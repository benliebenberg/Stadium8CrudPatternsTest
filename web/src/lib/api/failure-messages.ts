/**
 * Readable failure wording for a backend that could not be used.
 *
 * Shared by every path that talks to Linx — reads and writes alike — so a refused
 * connection or a rejected API key reads the same wherever it surfaces (R6,
 * NFR-base-5: a user-visible message with a retry affordance, never a blank screen and
 * never a swallowed error).
 *
 * Two rules these strings exist to keep:
 *
 * 1. **Never name or echo the credential.** The API key is a server-only secret; not
 *    its value, not its length, not the header it travels in.
 * 2. **Never leak raw internals as the primary message.** A transport failure's
 *    underlying `TypeError` and a Linx stack trace are not user-facing text.
 */

/** The backend did not answer at all — refused connection, DNS failure, timeout. */
export const BACKEND_UNREACHABLE_MESSAGE =
  'Could not reach the animal backend. Check that it is running, then try again.';

/** The backend answered, but refused the shared key it was sent. */
export const API_KEY_REJECTED_MESSAGE =
  'The animal backend rejected the configured API key, so this request was not authorised.';

/** The server itself has no key to send — a deployment configuration gap, not a fault. */
export const API_KEY_MISSING_MESSAGE =
  'This app is not configured with an API key for the animal backend, so it cannot reach it.';

/**
 * Describe a response that arrived but could not be used: a non-2xx status, or a body
 * that was missing, unparseable, or not the shape the operation expects.
 *
 * The HTTP status is used ONLY to phrase the message — never to decide an outcome. For
 * writes, the outcome comes from `MessageType` alone (architecture.md § Decision 2); this
 * wording is the fallback for a response carrying no envelope at all, such as the bare
 * 401 the Linx host returns for a bad key.
 */
export function unusableResponseMessages(status: number): string[] {
  if (status === 401 || status === 403) {
    return [API_KEY_REJECTED_MESSAGE];
  }

  return [
    `The animal backend returned a response this app could not read (HTTP ${status}). Please try again.`,
  ];
}
