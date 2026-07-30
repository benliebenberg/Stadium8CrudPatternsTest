/**
 * Shared write-result fixtures for the CrudPatterns backend.
 *
 * Every write to `/v1/animals` (POST / PUT / DELETE) answers with a `DefaultResponse`
 * envelope. The backend returns **HTTP 500** for both business rejections and technical
 * failures — and can return `MessageType: "Success"` on a 500 — so `MessageType` is the
 * only reliable outcome signal. See `generated-docs/architecture.md` § Decision 2.
 *
 * Both test layers import these: Vitest via `@/mocks/data/write-result`, Playwright via
 * `../src/mocks/data/write-result`. Keeping the three envelopes in one place is what stops
 * the two layers drifting onto different response bodies.
 *
 * Casing is the backend's own — `Success` / `Warning` / `Error`. A fixture spelled
 * `SUCCESS` would let a case-insensitive-comparison bug pass unnoticed, which is exactly
 * the defect story 1 fixes in `web/src/types/api.ts`.
 */

import type { DefaultResponse } from '@/types/api';

/**
 * A successful write. `Id` carries the new record's identifier on create, and echoes the
 * affected record on update/delete.
 */
export function createWriteSuccess(
  overrides: Partial<DefaultResponse> = {},
): DefaultResponse {
  return {
    Id: 42,
    MessageType: 'Success',
    Messages: ['Animal successfully created'],
    ...overrides,
  };
}

/**
 * A business rejection — the duplicate-name case, raised by the backend's
 * `ReturnDuplicateRecordError` path on both create and update.
 *
 * Arrives as **HTTP 500** despite being a recoverable, user-fixable problem: the UI must
 * surface it against the Name field with the user's input intact, never as a full-page
 * error. `Id` is 0 because no record was written.
 *
 * The exact uniqueness rule is unconfirmed against the live backend (most likely
 * `Animal.Name`) — see `generated-docs/epics/zoo-animal-manager/state.json`
 * `unverifiedAssumptions`.
 */
export function createDuplicateWarning(
  overrides: Partial<DefaultResponse> = {},
): DefaultResponse {
  return {
    Id: 0,
    MessageType: 'Warning',
    Messages: ['Animal already exists'],
    ...overrides,
  };
}

/**
 * A technical failure. `Messages[0]` is the raw database/runtime text, which the UI must
 * NOT use as its primary user-facing message — show something readable, keep the user's
 * input, and offer a retry.
 */
export function createWriteError(
  overrides: Partial<DefaultResponse> = {},
): DefaultResponse {
  return {
    Id: 0,
    MessageType: 'Error',
    Messages: [
      'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_Animal_Habitat".',
    ],
    ...overrides,
  };
}
