/**
 * API Type Definitions Template
 *
 * Generic type definitions for API communication
 * Customize these based on your API's response format
 */

/**
 * DefaultResponse - the envelope every write to this backend answers with.
 *
 * Arrives on success AND on failure, because the backend reports business rejections
 * and technical faults as HTTP 500 carrying this body rather than as conventional 4xx
 * responses. `MessageType` is therefore the only reliable outcome signal — never the
 * HTTP status (see generated-docs/architecture.md § Decision 2).
 */
export interface DefaultResponse {
  Id: number;
  MessageType: APIMessageTypeValue;
  Messages: string[];
}

/**
 * APIError - Standardized error object for API failures
 * Used throughout the application for consistent error handling
 */
export interface APIError {
  message: string;
  statusCode?: number;
  details?: string[];
  endpoint?: string;
  /**
   * The `MessageType` of the `DefaultResponse` envelope the failure carried, when it
   * carried one. Absent when the response had no envelope (a bare 401, a transport
   * failure). Lets a caller tell a business rejection from a technical fault without
   * re-reading the response body.
   */
  messageType?: APIMessageTypeValue;
}

export type QueryParamScalar = string | number | boolean;
export type QueryParams = Record<
  string,
  QueryParamScalar | ReadonlyArray<QueryParamScalar> | undefined
>;

/**
 * APIRequestConfig - Configuration options for API requests
 * Extends standard fetch RequestInit with additional options
 */
/**
 * There is deliberately no credential option and no `lastChangedUser` option here.
 * The browser-side client only ever calls this app's OWN same-origin `/api/*` route
 * handlers; the shared `X-API-Key` and the fixed `LastChangedUser` name are injected
 * server-side by web/src/lib/api/server/linx-client.ts, from server-only env vars.
 * Neither value may be reachable from — or supplied by — anything in the browser
 * (project.md §Authentication, brief BR3).
 */
export interface APIRequestConfig extends RequestInit {
  params?: QueryParams;
  isBinaryResponse?: boolean; // Flag to indicate response should be treated as binary data
}

/**
 * APIResponse - Generic wrapper for successful API responses
 * Provides type-safe response handling
 */
export interface APIResponse<T> {
  data: T;
  status: number;
  statusText: string;
}

/**
 * The `MessageType` values this backend actually sends, in ITS OWN casing.
 *
 * `Success` / `Warning` / `Error` — not `SUCCESS` / `WARNING` / `ERROR`. Compare against
 * these constants exactly; never compare case-insensitively and never upper-case a value
 * before comparing it. (The template shipped uppercase values, which no response ever
 * matches — that was a defect, not a convention.)
 *
 * - `Success` — the write worked; `Messages` carries the backend's own confirmation.
 * - `Warning` — a business rejection the user can fix (e.g. a duplicate animal name).
 * - `Error`   — a technical failure; `Messages[0]` is raw backend/database text.
 *
 * There is no `Info` value: the backend has none.
 */
export const APIMessageType = {
  Success: 'Success',
  Warning: 'Warning',
  Error: 'Error',
} as const;

export type APIMessageTypeValue =
  (typeof APIMessageType)[keyof typeof APIMessageType];

/**
 * HTTP Status Codes - Common status codes used in the application
 */
export const HTTPStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export type HTTPStatusCode = (typeof HTTPStatus)[keyof typeof HTTPStatus];
