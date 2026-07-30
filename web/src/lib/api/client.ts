/**
 * The browser-side API client — this app's OWN `/api/*` route handlers, nothing else.
 *
 * A fetch wrapper providing JSON parsing, query-string building, development logging, and
 * one failure model driven by the backend's `DefaultResponse` envelope.
 *
 * TWO RULES THIS MODULE ENFORCES, both structural rather than stylistic:
 *
 * 1. **Endpoints are same-origin paths.** Every endpoint must start with `/`, and no base
 *    URL is prefixed onto it. The browser talks only to this app's route handlers; those
 *    handlers are the only code that reaches the Linx backend, because the shared API key
 *    must never leave the server and the Linx host emits no CORS headers (project.md
 *    §Authentication, architecture.md § Decision 1). An absolute URL passed here is
 *    rejected loudly rather than sent — that mistake would leak the backend's address into
 *    the browser and then fail on CORS anyway.
 * 2. **No credential, and no `lastChangedUser`, is accepted from a caller.** Both are
 *    server-injected configuration (brief BR2/BR3). There is nothing to pass in and
 *    nothing to configure here.
 *
 * Failures are read from the response body, never from the status code: this backend
 * reports business rejections and technical faults alike as HTTP 500 carrying a
 * `DefaultResponse` (project.md NFR-base-6, architecture.md § Decision 2). Note the
 * consequence for writes — the app's route handlers normalise every write to HTTP 200 with
 * that envelope, so a write RESOLVES here and the caller branches on `MessageType`; only a
 * genuine transport failure rejects (architecture.md § Decision 3).
 */

import { parseWriteEnvelope } from '@/lib/api/write-result';
import type {
  APIError,
  APIMessageTypeValue,
  APIRequestConfig,
  QueryParams,
} from '@/types/api';

/**
 * Main API client function that wraps fetch with error handling and logging
 *
 * @param endpoint - API endpoint path (e.g., '/v1/resource')
 * @param config - Request configuration including method, body, headers, etc.
 * @returns Promise with parsed JSON response
 * @throws APIError on HTTP errors or network failures
 */
export async function apiClient<T = unknown>(
  endpoint: string,
  config: APIRequestConfig = {},
): Promise<T> {
  const { params, isBinaryResponse, ...fetchConfig } = config;

  // Build the same-origin URL with query parameters
  const url = buildUrl(endpoint, params);

  // Build headers
  const headers = buildHeaders(
    fetchConfig.method,
    fetchConfig.headers,
    fetchConfig.body ?? undefined,
  );

  // Log request in development
  logRequest(url, fetchConfig.method || 'GET', fetchConfig.body ?? undefined);

  try {
    const response = await fetch(url, {
      ...fetchConfig,
      headers,
      body: fetchConfig.body ?? undefined,
    });

    // Log response in development
    logResponse(response);

    // Handle specific error status codes
    if (!response.ok) {
      await handleErrorResponse(response, url);
    }

    // Handle successful responses
    return await handleSuccessResponse<T>(response, isBinaryResponse);
  } catch (error) {
    // Handle network errors or other unexpected errors
    if (error instanceof Error && error.name === 'TypeError') {
      throw createAPIError(
        'Network error: Unable to connect to the API server',
        0,
        ['Please check your internet connection and try again.'],
        url,
      );
    }

    // Re-throw API errors
    throw error;
  }
}

/**
 * Builds the request URL with query parameters.
 *
 * **The endpoint is used as given — no base URL is prefixed onto it.** `'/api/animals'`
 * resolves to `/api/animals`: a same-origin request to this app's own route handler, which
 * is the only thing that may talk to the Linx backend. Prefixing a backend base URL here
 * was the template's shape and is precisely the bug this project cannot have — it would put
 * the backend's address in the browser, and the request would then fail on CORS because the
 * Linx host sends no `Access-Control-Allow-Origin` (architecture.md § Decision 1).
 *
 * Anything that is not a root-relative path is rejected rather than sent, so that mistake
 * cannot be made silently: both test layers can otherwise pass while the deployed app is
 * broken (Vitest mocks this module; a Playwright glob matches the wrong absolute URL too).
 *
 * Array values serialize as repeated params (`['a','b']` → `?k=a&k=b`); for
 * `explode: false` APIs, join at the endpoint-function layer. Empty arrays and
 * `undefined` values drop the key entirely (the "clear all filters" path). An
 * explicit empty string IS sent for scalars (`?k=`) — caller chose that. Array
 * items that are empty strings are dropped, since an array of empty strings is
 * never a meaningful filter selection.
 */
function buildUrl(endpoint: string, params?: QueryParams): string {
  // `//host/path` is protocol-relative — a cross-origin request wearing a relative
  // path's clothing — so it is rejected alongside absolute URLs.
  if (!endpoint.startsWith('/') || endpoint.startsWith('//')) {
    throw new Error(
      `API endpoints must be same-origin paths starting with "/", but got "${endpoint}". ` +
        'The browser may only call this app\'s own route handlers (e.g. "/api/animals"); ' +
        'they are what reach the backend, server-side.',
    );
  }

  const path = endpoint;

  if (!params) {
    return path;
  }

  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== '') {
          queryParams.append(key, String(item));
        }
      });
      return;
    }
    queryParams.append(key, String(value));
  });

  const queryString = queryParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

/**
 * Builds request headers. Only sets Content-Type when there's a request body.
 *
 * No credential is attached, and no `LastChangedUser` is attached. Both are injected
 * server-side by the route handlers this client calls (brief BR2/BR3) — the browser has
 * neither value and must not be able to influence either.
 */
function buildHeaders(
  method?: string,
  customHeaders?: HeadersInit,
  body?: BodyInit,
): Record<string, string> {
  const baseHeaders: Record<string, string> = {};

  // Convert HeadersInit to plain object if needed
  if (customHeaders) {
    if (customHeaders instanceof Headers) {
      customHeaders.forEach((value, key) => {
        baseHeaders[key] = value;
      });
    } else if (Array.isArray(customHeaders)) {
      customHeaders.forEach(([key, value]) => {
        baseHeaders[key] = value;
      });
    } else {
      Object.assign(baseHeaders, customHeaders);
    }
  }

  // Only set Content-Type for requests with a body
  const hasBody = body !== undefined;
  const methodsWithBody = ['POST', 'PUT', 'PATCH'];
  const shouldSetContentType =
    hasBody || (method && methodsWithBody.includes(method.toUpperCase()));

  if (shouldSetContentType && !baseHeaders['Content-Type']) {
    baseHeaders['Content-Type'] = 'application/json';
  }

  return baseHeaders;
}

/**
 * Turns a failed response into an `APIError`, reading the **body** for the reason.
 *
 * There is deliberately no status-code switch. This backend does not use status codes
 * conventionally: it answers with HTTP 500 for a business rejection, for a technical fault,
 * and occasionally for a success, always carrying a `DefaultResponse` envelope
 * (project.md NFR-base-6, architecture.md § Decision 2). A switch on 401/403/404/500 —
 * which is what the template shipped — invents distinctions the backend does not make and
 * discards the one thing that does carry meaning: `MessageType` and `Messages`.
 *
 * So the envelope's own wording becomes the error message, its `MessageType` is carried on
 * the error so a caller can tell a rejection from a fault, and the status is recorded for
 * diagnosis only. When there is no envelope to read, the status is all there is, and the
 * message says so plainly rather than guessing at a cause.
 */
async function handleErrorResponse(
  response: Response,
  url: string,
): Promise<never> {
  const envelope = parseWriteEnvelope(await readBodySafely(response));
  const messages = envelope?.Messages ?? [];

  const message =
    messages[0] ??
    `The request to ${url} failed (HTTP ${response.status}). Please try again.`;

  throw createAPIError(
    message,
    response.status,
    messages.length > 0 ? messages : [message],
    url,
    envelope?.MessageType,
  );
}

/**
 * Reads a response body as JSON, resolving to `undefined` when there is none or it is not
 * JSON — a failure response is not guaranteed to carry a body at all, and a parse error
 * while explaining a failure must not replace the failure.
 */
async function readBodySafely(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Handles successful API responses
 * Parses JSON or returns void for 204 No Content responses
 * For binary responses, returns a Blob
 */
async function handleSuccessResponse<T>(
  response: Response,
  isBinaryResponse?: boolean,
): Promise<T> {
  // Handle 204 No Content responses (e.g., DELETE operations)
  if (response.status === 204) {
    return undefined as T;
  }

  // If explicitly marked as binary response, always return blob
  if (isBinaryResponse) {
    return (await response.blob()) as T;
  }

  const contentType = response.headers.get('content-type');

  // Handle JSON responses
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  // Handle binary responses (e.g., file downloads)
  if (contentType && contentType.includes('application/octet-stream')) {
    return (await response.blob()) as T;
  }

  // Fallback: try to parse as JSON
  try {
    return (await response.json()) as T;
  } catch {
    // If JSON parsing fails, return undefined
    return undefined as T;
  }
}

/**
 * Creates a standardized APIError object.
 *
 * `messageType` is present only when the failure carried a `DefaultResponse` envelope, so a
 * caller can tell a business rejection from a technical fault without re-reading the body.
 */
function createAPIError(
  message: string,
  statusCode: number,
  details: string[],
  endpoint: string,
  messageType?: APIMessageTypeValue,
): APIError {
  return {
    message,
    statusCode,
    details,
    endpoint,
    messageType,
  };
}

/**
 * Sanitizes request body for safe logging by removing sensitive fields
 * Customize the sensitiveFields array based on your application's needs
 */
function sanitizeBodyForLogging(body: BodyInit | null): unknown {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body as string);
    const sensitiveFields = [
      'password',
      'token',
      'apiKey',
      'secret',
      'creditCard',
      'ssn',
    ];

    // Create a sanitized copy
    const sanitized = { ...parsed };

    // Remove or mask sensitive fields
    Object.keys(sanitized).forEach((key) => {
      if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
        sanitized[key] = '***REDACTED***';
      }
    });

    return sanitized;
  } catch {
    return '[Unable to parse body]';
  }
}

/**
 * Logs API request details in development mode
 * Automatically sanitizes sensitive fields for security
 */
function logRequest(url: string, method: string, body?: BodyInit | null): void {
  if (process.env.NODE_ENV === 'development') {
    console.group(`API Request: ${method} ${url}`);
    console.log('URL:', url);
    console.log('Method:', method);

    if (body) {
      console.log('Body:', sanitizeBodyForLogging(body));
    }

    console.groupEnd();
  }
}

/**
 * Logs API response details in development mode
 */
function logResponse(response: Response): void {
  if (process.env.NODE_ENV === 'development') {
    const statusEmoji = response.ok ? '✅' : '❌';
    console.log(
      `${statusEmoji} API Response: ${response.status} ${response.statusText}`,
    );
  }
}

/**
 * GET a same-origin endpoint — e.g. `get<AnimalReadList>('/api/animals')`.
 */
export async function get<T>(
  endpoint: string,
  params?: QueryParams,
): Promise<T> {
  return apiClient<T>(endpoint, {
    method: 'GET',
    params,
  });
}

/**
 * POST to a same-origin endpoint.
 *
 * There is no change-name parameter: `LastChangedUser` is a required backend header, but it
 * is server-injected deployment configuration, not something a caller supplies (brief
 * R5/BR3). The route handler attaches it.
 */
export async function post<T>(endpoint: string, body?: unknown): Promise<T> {
  return apiClient<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * PUT to a same-origin endpoint. As with `post`, the change-name is server-injected.
 */
export async function put<T>(endpoint: string, body?: unknown): Promise<T> {
  return apiClient<T>(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * DELETE a same-origin endpoint — e.g. `del<DefaultResponse>('/api/animals/4')`.
 *
 * Carries no body: the record is identified by the path, and the change-name is a
 * server-injected header (brief R5/BR3).
 */
export async function del<T>(endpoint: string): Promise<T> {
  return apiClient<T>(endpoint, {
    method: 'DELETE',
  });
}
