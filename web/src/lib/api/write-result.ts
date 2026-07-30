/**
 * The ONE shared interpretation of a write's outcome (R4 / NFR-3).
 *
 * Every write to `/v1/animals` — create, update, delete — answers with a
 * `DefaultResponse` envelope (`{ Id, MessageType, Messages }`). The backend sends
 * **HTTP 500 for business rejections and technical faults alike**, and can even send
 * `MessageType: "Success"` on a 500, so the status carries no outcome information at all.
 * `MessageType` is the only discriminator (architecture.md § Decision 2, brief
 * BR4/BR10/BR11).
 *
 * This module is deliberately environment-neutral — no `fetch`, no `process.env`, no
 * server-only import — so both sides of the proxy use the same interpretation:
 *
 * - the server tier (web/src/lib/api/server/linx-client.ts) interprets what Linx replied;
 * - the write screens interpret the envelope this app's own route handler returned.
 *
 * Nothing here throws. A refused write is a value the caller branches on, not an
 * exception: the difference between "the name is already taken" and "the database fell
 * over" is exactly what the UI needs, and an exception flattens it.
 */

import {
  BACKEND_UNREACHABLE_MESSAGE,
  unusableResponseMessages,
} from '@/lib/api/failure-messages';
import { isAPIError } from '@/lib/api/read-failure';
import { APIMessageType, type APIMessageTypeValue } from '@/types/api';
import type { DefaultResponse } from '@/types/api';

/**
 * The outcome of one write.
 *
 * - `success`  — `MessageType: 'Success'`. `id` is the affected record; `messages` is the
 *   backend's own confirmation wording, which the UI shows rather than inventing its own
 *   (R23).
 * - `rejected` — `MessageType: 'Warning'`. A business rejection the user can fix, such as
 *   a duplicate animal name. Recoverable: keep what they typed (R20).
 * - `failed`   — `MessageType: 'Error'`, or the backend could not be reached / used at
 *   all. `messages` may contain raw database text, so a screen must not use it as its
 *   primary user-facing wording (R24).
 */
export type LinxWriteResult =
  | {
      readonly outcome: 'success';
      readonly id: number;
      readonly messages: string[];
    }
  | { readonly outcome: 'rejected'; readonly messages: string[] }
  | { readonly outcome: 'failed'; readonly messages: string[] };

/**
 * `statusCode: 0` is how `client.ts` records "no response at all" — a transport failure rather
 * than an answer the backend chose to give.
 */
const TRANSPORT_FAILURE_STATUS = 0;

/** Wording used when the backend reported an outcome but attached no message to it. */
const OUTCOME_WITHOUT_MESSAGE: Record<APIMessageTypeValue, string> = {
  [APIMessageType.Success]: 'The change was saved.',
  [APIMessageType.Warning]: 'The animal backend refused the change.',
  [APIMessageType.Error]: 'The animal backend could not complete the change.',
};

/**
 * Read a response body as a `DefaultResponse`, or `null` when it is not one.
 *
 * The `MessageType` must be one of the backend's three exact values — `Success`,
 * `Warning`, `Error`. A body whose `MessageType` reads `SUCCESS` is NOT accepted:
 * matching loosely here would hide the very casing defect this project had to fix
 * (brief R3), and would make a genuinely unrecognisable body look like a real outcome.
 *
 * Also useful on the READ side: a successful single-animal read is an unwrapped
 * `AnimalRead` (BR8), so an envelope arriving there means the record could not be read
 * rather than that the read succeeded (BR9).
 */
export function parseWriteEnvelope(body: unknown): DefaultResponse | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }

  const candidate = body as {
    Id?: unknown;
    MessageType?: unknown;
    Messages?: unknown;
  };

  if (!isMessageType(candidate.MessageType)) {
    return null;
  }

  return {
    Id: typeof candidate.Id === 'number' ? candidate.Id : 0,
    MessageType: candidate.MessageType,
    Messages: Array.isArray(candidate.Messages)
      ? candidate.Messages.filter(
          (message): message is string => typeof message === 'string',
        )
      : [],
  };
}

/**
 * Interpret a write's response body.
 *
 * @param body The parsed response body, or `undefined` when there was none.
 * @param status The HTTP status the body arrived with. Used ONLY to phrase the failure
 *   message when there is no envelope to read (a bare 401, an empty body) — never to
 *   decide the outcome. A 500 carrying `Warning` is a rejection; a 200 carrying `Error`
 *   is a failure.
 */
export function interpretWriteResponse(
  body: unknown,
  status = 200,
): LinxWriteResult {
  const envelope = parseWriteEnvelope(body);

  if (!envelope) {
    return { outcome: 'failed', messages: unusableResponseMessages(status) };
  }

  const messages =
    envelope.Messages.length > 0
      ? [...envelope.Messages]
      : [OUTCOME_WITHOUT_MESSAGE[envelope.MessageType]];

  switch (envelope.MessageType) {
    case APIMessageType.Success:
      return { outcome: 'success', id: envelope.Id, messages };
    case APIMessageType.Warning:
      return { outcome: 'rejected', messages };
    case APIMessageType.Error:
      return { outcome: 'failed', messages };
  }
}

/**
 * Turn an interpreted result back into a `DefaultResponse` envelope, for this app's own
 * route handlers to answer the browser with.
 *
 * Writes always answer HTTP 200 + this envelope, whatever status Linx used, so the
 * browser-side promise RESOLVES and the caller branches on `MessageType` instead of
 * digging an envelope out of a thrown error (architecture.md § Decision 3). A failure
 * that never reached Linx — an unreachable backend, an unconfigured key — becomes an
 * `Error` envelope carrying the readable reason, so the write screens have exactly one
 * response shape to handle.
 */
export function writeResultToEnvelope(
  result: LinxWriteResult,
): DefaultResponse {
  switch (result.outcome) {
    case 'success':
      return {
        Id: result.id,
        MessageType: APIMessageType.Success,
        Messages: result.messages,
      };
    case 'rejected':
      return {
        Id: 0,
        MessageType: APIMessageType.Warning,
        Messages: result.messages,
      };
    case 'failed':
      return {
        Id: 0,
        MessageType: APIMessageType.Error,
        Messages: result.messages,
      };
  }
}

/**
 * The detail to show when a write got **no answer at all** — the single case a browser-side
 * write rejects instead of resolving (architecture.md § Decision 3), because the app's own
 * route handler never got far enough to return an envelope.
 *
 * Shared by every write surface (the add/edit form, the removal confirmation) so one event has
 * one wording: the client's own transport text reads like a stack trace, so the curated
 * backend-unreachable sentence stands in for it, while anything that DID come back through the
 * route handler's envelope is already curated and is passed on as it is.
 *
 * @param error What the write rejected with.
 */
export function describeUnansweredWrite(error: unknown): string {
  if (
    isAPIError(error) &&
    typeof error.statusCode === 'number' &&
    error.statusCode !== TRANSPORT_FAILURE_STATUS
  ) {
    return error.message;
  }

  return BACKEND_UNREACHABLE_MESSAGE;
}

/** True when the value is one of the backend's three `MessageType` strings, exactly. */
function isMessageType(value: unknown): value is APIMessageTypeValue {
  return (
    value === APIMessageType.Success ||
    value === APIMessageType.Warning ||
    value === APIMessageType.Error
  );
}
