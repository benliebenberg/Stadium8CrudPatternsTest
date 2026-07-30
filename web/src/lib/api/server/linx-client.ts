/**
 * The Linx CrudPatterns client — SERVER TIER ONLY.
 *
 * The only module in this app that talks to the Linx backend. It is imported exclusively
 * by the route handlers under `web/src/app/api/`; nothing the browser runs may import it,
 * because it reads the shared `API_KEY` secret. The browser reaches the backend only
 * through those same-origin `/api/*` handlers (project.md §Authentication;
 * generated-docs/architecture.md § Decision 1). Two reasons, both hard:
 *
 * 1. `API_KEY` is a single shared secret. Anything the browser can read, anyone can read.
 * 2. The Linx REST host's CORS origins property is unset, so it emits no
 *    `Access-Control-Allow-Origin` — a direct browser call would be blocked regardless.
 *
 * Six functions, one per operation in `generated-docs/specs/api-spec.yaml`, each named
 * after that operation's own `operationId` so the module and the contract stay traceable
 * to one another.
 *
 * **Nothing here throws or rejects.** A refused backend is a normal state of the world for
 * this app, not an exception (R6 / NFR-base-5), so every function resolves to a result the
 * caller can branch on. Writes additionally distinguish a business rejection from a
 * technical fault, because that distinction is what the UI needs (see
 * `@/lib/api/write-result`).
 *
 * Configuration is read **per request, inside these functions** — never captured into a
 * module-level constant at import time. That is what a server runtime expects (env is
 * resolved per request), and it means changing `LAST_CHANGED_USER` or the base URL does
 * not depend on when this module happened to first be imported.
 */

import {
  API_KEY_MISSING_MESSAGE,
  BACKEND_UNREACHABLE_MESSAGE,
  unusableResponseMessages,
} from '@/lib/api/failure-messages';
import {
  interpretWriteResponse,
  type LinxWriteResult,
} from '@/lib/api/write-result';
import { LINX_API_BASE_URL_DEFAULT } from '@/lib/utils/constants';
import type {
  AnimalRead,
  AnimalReadList,
  AnimalWrite,
  HabitatReadList,
} from '@/types/api-generated';

export type { LinxWriteResult };

/**
 * The outcome of one read.
 *
 * There is no `rejected` state: only writes carry a `DefaultResponse` envelope, so a read
 * either produced a body or it did not. `data` is passed through exactly as the backend
 * sent it — including the unwrapped `AnimalRead` a single-animal read returns (BR8), and
 * including an empty object, which is one of the things this backend does for an id that
 * does not exist. Deciding that an empty body means "not found" belongs to the screen
 * showing it (BR9, architecture.md § Decision 3), not here.
 */
export type LinxReadResult<T> =
  | { readonly outcome: 'success'; readonly data: T }
  | { readonly outcome: 'failed'; readonly messages: string[] };

/**
 * The fixed change-name used when `LAST_CHANGED_USER` is not configured.
 *
 * Every record shows this same value, because there is no login and no per-person
 * identity: it is deployment configuration, not attribution (project.md
 * §`LastChangedUser` header, brief BR14).
 */
const DEFAULT_LAST_CHANGED_USER = 'Animal Manager';

type LinxMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** GET /v1/animals — the complete roster, `{ Animals: [...] }`, always sorted by Name. */
export async function animalGetList(): Promise<LinxReadResult<AnimalReadList>> {
  return read<AnimalReadList>('/v1/animals');
}

/**
 * GET /v1/animals/{Id} — one animal, returned **unwrapped**: an `AnimalRead`, not the
 * `{ Animals: [...] }` envelope the roster uses and not the `DefaultResponse` envelope
 * every write uses (BR8).
 */
export async function animalGetById(
  id: number,
): Promise<LinxReadResult<AnimalRead>> {
  return read<AnimalRead>(`/v1/animals/${encodeURIComponent(id)}`);
}

/** GET /v1/habitats — the habitat reference list, `{ Habitats: [...] }`. */
export async function habitatGetList(): Promise<
  LinxReadResult<HabitatReadList>
> {
  return read<HabitatReadList>('/v1/habitats');
}

/** POST /v1/animals — create one animal from the five writable fields. */
export async function animalCreate(
  body: AnimalWrite,
): Promise<LinxWriteResult> {
  return write('POST', '/v1/animals', body);
}

/** PUT /v1/animals/{Id} — overwrite one animal's five writable fields. */
export async function animalUpdate(
  id: number,
  body: AnimalWrite,
): Promise<LinxWriteResult> {
  return write('PUT', `/v1/animals/${encodeURIComponent(id)}`, body);
}

/** DELETE /v1/animals/{Id} — irreversible; carries no request body. */
export async function animalDelete(id: number): Promise<LinxWriteResult> {
  return write('DELETE', `/v1/animals/${encodeURIComponent(id)}`);
}

/**
 * Perform a read: a successful body is passed straight through to the caller.
 *
 * An empty or unparseable body on an otherwise-successful response is a failure, not an
 * empty success — an unreadable habitat list must not render as a habitat list that
 * happens to be empty (AC-4).
 */
async function read<T>(path: string): Promise<LinxReadResult<T>> {
  const exchange = await send('GET', path);

  if (exchange.kind === 'no-response') {
    return { outcome: 'failed', messages: exchange.messages };
  }

  const { response } = exchange;
  const body = await readJsonBody(response);

  if (!response.ok || body === undefined) {
    return {
      outcome: 'failed',
      messages: unusableResponseMessages(response.status),
    };
  }

  return { outcome: 'success', data: body as T };
}

/**
 * Perform a write, then let `MessageType` decide the outcome — never the HTTP status.
 *
 * The request body is rebuilt from exactly the five writable fields, so nothing a caller
 * puts on the object it passes in can reach the backend: not an `Id`, not a `HabitatName`,
 * and above all not a `LastChangedUser`, which is server configuration (R17, AC-5/BR3).
 */
async function write(
  method: Exclude<LinxMethod, 'GET'>,
  path: string,
  body?: AnimalWrite,
): Promise<LinxWriteResult> {
  const exchange = await send(
    method,
    path,
    body === undefined ? undefined : writableFields(body),
  );

  if (exchange.kind === 'no-response') {
    return { outcome: 'failed', messages: exchange.messages };
  }

  const { response } = exchange;
  return interpretWriteResponse(await readJsonBody(response), response.status);
}

/**
 * What came back from the attempt to talk to Linx: either a real response to interpret, or
 * no response at all (the host refused the connection, or this server has no key to send).
 */
type LinxExchange =
  | { readonly kind: 'response'; readonly response: Response }
  | { readonly kind: 'no-response'; readonly messages: string[] };

/**
 * Send one request to Linx, attaching the credentials server-side.
 *
 * `X-API-Key` goes on every operation — there is no unauthenticated endpoint (BR2). The
 * `LastChangedUser` header goes on every write and only on writes, from the same
 * configuration, in the same place (R5/BR3).
 *
 * A transport failure is caught and turned into a readable message. The underlying error
 * is deliberately not logged or attached: it is not user-facing text, and the message that
 * replaces it says the one thing a person can act on. Nothing here ever logs, echoes, or
 * returns the API key.
 */
async function send(
  method: LinxMethod,
  path: string,
  body?: AnimalWrite,
): Promise<LinxExchange> {
  const apiKey = resolveApiKey();

  if (apiKey === null) {
    return { kind: 'no-response', messages: [API_KEY_MISSING_MESSAGE] };
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-API-Key': apiKey,
  };

  if (method !== 'GET') {
    headers.LastChangedUser = resolveLastChangedUser();
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${resolveBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Animal data changes under the app's feet (R23 — a write must be visible
      // immediately afterwards), so no layer of this proxy may serve a cached copy.
      cache: 'no-store',
    });

    return { kind: 'response', response };
  } catch {
    return { kind: 'no-response', messages: [BACKEND_UNREACHABLE_MESSAGE] };
  }
}

/**
 * Parse a JSON response body, resolving to `undefined` when there is nothing usable to
 * parse.
 *
 * The Linx host answers a rejected key with a bare `401` — no JSON, no envelope, no body
 * at all — so parsing must not blow up. `undefined` here means "no body", which each
 * caller interprets: a failure for a read, and an envelope-less response for a write.
 */
async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/** Exactly the five writable fields (R17) — the entire surface a client may send. */
function writableFields(body: AnimalWrite): AnimalWrite {
  return {
    Name: body.Name,
    Species: body.Species,
    Age: body.Age,
    HabitatId: body.HabitatId,
    Diet: body.Diet,
  };
}

/**
 * The base address of the Linx backend, without a trailing slash.
 *
 * Read per request from `NEXT_PUBLIC_API_BASE_URL`, falling back to the corrected default.
 * The var is `NEXT_PUBLIC_*` because it holds no secret — but only this server-side module
 * consumes it, so the address never has to appear in a browser bundle either.
 */
function resolveBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  const base =
    configured !== undefined && configured.length > 0
      ? configured
      : LINX_API_BASE_URL_DEFAULT;

  return base.replace(/\/+$/, '');
}

/**
 * The shared secret, or `null` when this deployment has none configured.
 *
 * Read from the server-only `API_KEY` (never a `NEXT_PUBLIC_*` var, which would be baked
 * into the browser bundle) at request time, and used immediately. Never logged, never
 * returned to a caller, never copied into a message.
 */
function resolveApiKey(): string | null {
  const key = process.env.API_KEY?.trim();
  return key !== undefined && key.length > 0 ? key : null;
}

/**
 * The fixed name every write is attributed to.
 *
 * Deployment configuration only: there is no prompt, no browser storage, and no way for a
 * user to influence this value (R5/BR3). A caller cannot pass one in — this function takes
 * no arguments, which is the point.
 */
function resolveLastChangedUser(): string {
  const configured = process.env.LAST_CHANGED_USER?.trim();

  return configured !== undefined && configured.length > 0
    ? configured
    : DEFAULT_LAST_CHANGED_USER;
}
