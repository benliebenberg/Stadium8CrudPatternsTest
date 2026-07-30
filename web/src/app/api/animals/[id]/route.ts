/**
 * `/api/animals/{id}` — the app's own single-animal endpoint.
 *
 * The browser calls this same-origin path; this handler is what reaches Linx, injecting the
 * server-only `X-API-Key` and, on the writes, the configured `LastChangedUser`
 * (architecture.md § Decision 1).
 *
 * The successful read answers with an `AnimalRead` **unwrapped** — exactly what Linx sent,
 * envelope-free (BR8) — which is also why a body that DOES carry a `MessageType`, or an
 * empty object, means the record could not be read rather than that the read succeeded. The
 * screen showing the record decides how to present that (BR9).
 */

import {
  animalDelete,
  animalGetById,
  animalUpdate,
} from '@/lib/api/server/linx-client';
import {
  parseAnimalId,
  readAnimalWriteBody,
  respondToRead,
  respondToUnknownAnimalRead,
  respondToUnknownAnimalWrite,
  respondToUnreadableBody,
  respondToWrite,
} from '@/lib/api/server/route-helpers';

/** Never prerendered or cached — an edit must be visible immediately afterwards (R23). */
export const dynamic = 'force-dynamic';

/** The dynamic route segment. Next resolves route params asynchronously. */
interface AnimalRouteContext {
  params: Promise<{ id: string }>;
}

/** One animal's full record. */
export async function GET(
  request: Request,
  context: AnimalRouteContext,
): Promise<Response> {
  const id = parseAnimalId((await context.params).id);

  if (id === null) {
    return respondToUnknownAnimalRead();
  }

  return respondToRead(await animalGetById(id));
}

/** Overwrite one animal's five writable fields. */
export async function PUT(
  request: Request,
  context: AnimalRouteContext,
): Promise<Response> {
  const id = parseAnimalId((await context.params).id);

  if (id === null) {
    return respondToUnknownAnimalWrite();
  }

  const body = await readAnimalWriteBody(request);

  if (body === null) {
    return respondToUnreadableBody();
  }

  return respondToWrite(await animalUpdate(id, body));
}

/** Remove one animal. Irreversible — the confirmation step lives in the UI (R22). */
export async function DELETE(
  request: Request,
  context: AnimalRouteContext,
): Promise<Response> {
  const id = parseAnimalId((await context.params).id);

  if (id === null) {
    return respondToUnknownAnimalWrite();
  }

  return respondToWrite(await animalDelete(id));
}
