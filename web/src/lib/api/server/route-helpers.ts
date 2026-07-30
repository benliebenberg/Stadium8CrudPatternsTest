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
 */

import { NextResponse } from 'next/server';

import type { LinxReadResult } from '@/lib/api/server/linx-client';
import {
  writeResultToEnvelope,
  type LinxWriteResult,
} from '@/lib/api/write-result';
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

/** Answer a write whose request body could not be read — still HTTP 200 + envelope. */
export function respondToUnreadableBody(): NextResponse {
  return respondToWrite({
    outcome: 'failed',
    messages: [UNREADABLE_BODY_MESSAGE],
  });
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
 * The five writable fields from a request body, or `null` when the body is not a JSON
 * object.
 *
 * Only the five are picked out. Anything else the browser sent — an `Id`, a `HabitatName`,
 * a `LastChangedUser` — is dropped here as well as in the Linx client, so a stray field
 * can never reach the backend from either side of the proxy (R17/BR3).
 */
export async function readAnimalWriteBody(
  request: Request,
): Promise<AnimalWrite | null> {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const body = parsed as Record<string, unknown>;

  return {
    Name: asString(body.Name),
    Species: asString(body.Species),
    Age: asNumber(body.Age),
    HabitatId: asNumber(body.HabitatId),
    Diet: asString(body.Diet),
  };
}

function errorEnvelope(messages: string[], status: number): NextResponse {
  const envelope: DefaultResponse = {
    Id: 0,
    MessageType: APIMessageType.Error,
    Messages: messages,
  };

  return NextResponse.json(envelope, { status });
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
