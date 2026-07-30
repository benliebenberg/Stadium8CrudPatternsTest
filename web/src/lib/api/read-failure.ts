/**
 * One readable sentence for a read that did not produce usable data.
 *
 * Every read screen (roster, animal detail, habitats) needs the same thing: a failure line a
 * person can act on, with no raw internals in it. The wording itself is already curated
 * server-side — the app's route handlers answer a failed read with an `Error` envelope built
 * from `web/src/lib/api/failure-messages.ts`, and the browser-side client lifts
 * `Messages[0]` onto `APIError.message` — so the job here is to pick the right sentence, not
 * to invent one.
 *
 * Two cases the server wording cannot cover, and this module does:
 *
 * 1. **A transport failure** — the app's own route handler was unreachable (dev server down,
 *    network gone). The client's own text for that is "Network error: Unable to connect to
 *    the API server", which is accurate but reads like a stack trace, so the shared
 *    backend-unreachable wording is used instead.
 * 2. **A response that arrived but is not the shape the screen needs** — e.g. a body with
 *    `Messages` and no `Animals`. There is no error object at all in that case, so there is
 *    no message to lift.
 */

import { BACKEND_UNREACHABLE_MESSAGE } from '@/lib/api/failure-messages';
import type { APIError } from '@/types/api';

/**
 * `statusCode: 0` is how `client.ts` records "no response at all" — a transport failure
 * rather than an answer the backend chose to give.
 */
const TRANSPORT_FAILURE_STATUS = 0;

/**
 * The response arrived and could be parsed, but it is not what the screen asked for. Said
 * plainly, because there is nothing more specific to say — and never reported as "there is
 * nothing here", which is a different fact about the world.
 */
export const UNUSABLE_RESPONSE_MESSAGE =
  'The backend answered, but not with the information this screen needs. Try again in a moment.';

/** An object carrying a `message` string — what `client.ts` rejects with. */
export function isAPIError(value: unknown): value is APIError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

/**
 * The failure detail to show for a read that could not be used.
 *
 * @param error What the read rejected with, or `undefined` when the read resolved with a
 *   body of the wrong shape (there is no error object in that case).
 */
export function describeReadFailure(error: unknown): string {
  if (!isAPIError(error)) {
    return UNUSABLE_RESPONSE_MESSAGE;
  }

  if (error.statusCode === TRANSPORT_FAILURE_STATUS) {
    return BACKEND_UNREACHABLE_MESSAGE;
  }

  return error.message;
}
