/**
 * Shared plumbing for this app's own `/api/*` route handlers — SERVER TIER ONLY.
 *
 * The handlers are thin on purpose: read the request, call one Linx operation, answer.
 * Everything they have in common lives here so all three files answer identically
 * (architecture.md § Decision 3):
 *
 * - **Writes always answer HTTP 200 with the `DefaultResponse` envelope**, whatever status
 *   Linx used. Linx returns 500 for business rejections, technical faults AND sometimes
 *   success, so passing its status through would make the browser-side client *throw* and
 *   force every caller to dig the envelope out of an error object to tell a fixable
 *   duplicate name from a database fault.
 * - **Reads keep ordinary HTTP semantics**: 200 with the body exactly as the backend sent
 *   it, or a non-2xx the browser-side client turns into a readable failure with a retry.
 * - **A write's body is validated here, server-side**, before any of it reaches Linx. The
 *   form's own validation only covers requests the form made; the backend validates nothing
 *   and stores whatever it is sent (R19), so this is the last check that exists.
 */

import { NextResponse } from 'next/server';

import type { LinxReadResult } from '@/lib/api/server/linx-client';
import {
  writeResultToEnvelope,
  type LinxWriteResult,
} from '@/lib/api/write-result';
import { animalWriteSchema, validateRequest } from '@/lib/validation/schemas';
import { APIMessageType, type DefaultResponse } from '@/types/api';
import type { AnimalWrite } from '@/types/api-generated';

/**
 * The status a failed read answers with.
 *
 * 500 rather than a conventional 4xx, matching the only failure shape this backend
 * produces (project.md NFR-base-6): every read failure — unreachable host, refused key,
 * unreadable body — reaches the browser as one status with one envelope shape, so the read
 * screens have a single failure path to render.
 */
const READ_FAILURE_STATUS = 500;

/** The address bar held something that cannot be an animal id. */
const UNKNOWN_ANIMAL_MESSAGE = 'No animal with that id exists.';

/** The request body was absent, malformed, or not a JSON object. */
const UNREADABLE_BODY_MESSAGE =
  'The animal details could not be read from the request.';

/**
 * The request body was readable JSON, but not a valid animal.
 *
 * Leads the envelope's `Messages`, with the per-field detail following it, because a `failed`
 * outcome's first message is what a write screen shows as its primary wording while the rest is
 * kept as labelled secondary detail (R24).
 */
const INVALID_BODY_MESSAGE =
  'The animal details were rejected before they reached the backend, so nothing was saved.';

/** Answer a read: the body verbatim on success, an `Error` envelope on failure. */
export function respondToRead<T>(result: LinxReadResult<T>): NextResponse {
  if (result.outcome === 'success') {
    return NextResponse.json(result.data);
  }

  return errorEnvelope(result.messages, READ_FAILURE_STATUS);
}

/**
 * Answer a write: always HTTP 200, always the `DefaultResponse` envelope.
 *
 * A transport failure becomes an `Error` envelope rather than a rejected promise, so the
 * write screens branch on `MessageType` for every outcome without a second failure mode.
 */
export function respondToWrite(result: LinxWriteResult): NextResponse {
  return NextResponse.json(writeResultToEnvelope(result));
}

/** Answer a read for an id that cannot exist. */
export function respondToUnknownAnimalRead(): NextResponse {
  return errorEnvelope([UNKNOWN_ANIMAL_MESSAGE], 404);
}

/** Answer a write aimed at an id that cannot exist — still HTTP 200 + envelope. */
export function respondToUnknownAnimalWrite(): NextResponse {
  return respondToWrite({
    outcome: 'failed',
    messages: [UNKNOWN_ANIMAL_MESSAGE],
  });
}

/**
 * Answer a write whose request body was unreadable or invalid — still HTTP 200 + envelope.
 *
 * HTTP 200 rather than a conventional `400`, deliberately, because Decision 3 is a contract the
 * browser side depends on: a write's promise **resolves** and the caller branches on
 * `MessageType`. A `400` would make `client.ts` throw, and every write surface would have to dig
 * an envelope out of an error object to tell a refusal apart from an unreachable backend — losing
 * the distinction the UI is built on. One response shape for every write outcome is worth more
 * here than status-code purism.
 *
 * `Error` and not `Warning`, equally deliberately: `Warning` means a business rejection the person
 * can fix in the form, and the add/edit form routes it to the **Name** entry as a duplicate-name
 * message (R20). A malformed request body is not a duplicate name and must not be reported as one
 * — it is a fault in whatever sent it, which is what `Error` means (R24).
 */
export function respondToRefusedWriteBody(messages: string[]): NextResponse {
  return respondToWrite({ outcome: 'failed', messages });
}

/**
 * The animal id from a dynamic route segment, or `null` when it is not a positive whole
 * number. Route segments are strings and can be anything a person types into the address
 * bar.
 */
export function parseAnimalId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * What a write handler got out of its request body: either a valid animal, or the reasons it
 * was refused.
 */
export type AnimalWriteBodyResult =
  | { readonly valid: true; readonly body: Required<AnimalWrite> }
  | { readonly valid: false; readonly messages: string[] };

/**
 * Read and **validate** the request body of a write, server-side.
 *
 * This is the app's last line of defence and, for anything that is not the form, its only one.
 * `animalFormSchema` guards what a person types, but nothing stops a request arriving at
 * `/api/animals` from curl, a stale tab, or a future bug in client code — and the backend
 * validates nothing at all: it inserts what it is sent straight into the database (R19). So a
 * field that is missing, the wrong type, or out of range has to be refused **here** or it becomes
 * a permanent bad row.
 *
 * Both write handlers on the collection and both on a single animal go through this one function,
 * so there is a single place where "what may be written" is decided (NFR-3) and no handler can
 * drift from it.
 *
 * Unknown keys are stripped by {@link animalWriteSchema} rather than rejected, which is what keeps
 * the writable surface to exactly the five fields: an `Id`, a `HabitatName` or a
 * `LastChangedUser` a caller tried to smuggle in never survives the parse (R17/BR3). The Linx
 * client rebuilds the body from the same five fields again, so a stray field cannot reach the
 * backend from either side of the proxy.
 *
 * Nothing here throws — an unreadable body is a result the handler branches on, exactly as a
 * refused write is.
 */
export async function validateAnimalWriteBody(
  request: Request,
): Promise<AnimalWriteBodyResult> {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    return { valid: false, messages: [UNREADABLE_BODY_MESSAGE] };
  }

  const validation = validateRequest(animalWriteSchema, parsed);

  if (!validation.success) {
    return {
      valid: false,
      messages: [INVALID_BODY_MESSAGE, ...validation.errors],
    };
  }

  return { valid: true, body: validation.data };
}

function errorEnvelope(messages: string[], status: number): NextResponse {
  const envelope: DefaultResponse = {
    Id: 0,
    MessageType: APIMessageType.Error,
    Messages: messages,
  };

  return NextResponse.json(envelope, { status });
}
