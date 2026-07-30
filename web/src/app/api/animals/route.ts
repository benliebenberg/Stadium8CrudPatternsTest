/**
 * `/api/animals` — the app's own animal-collection endpoint.
 *
 * The browser calls this same-origin path; this handler is what reaches Linx, injecting the
 * server-only `X-API-Key` and, on the write, the configured `LastChangedUser`
 * (architecture.md § Decision 1). Nothing about the backend's address or credentials is
 * observable from here.
 */

import { animalCreate, animalGetList } from '@/lib/api/server/linx-client';
import {
  readAnimalWriteBody,
  respondToRead,
  respondToUnreadableBody,
  respondToWrite,
} from '@/lib/api/server/route-helpers';

/**
 * Never prerendered or cached: the roster changes whenever anyone writes, and a create
 * must be visible in the list immediately afterwards (R23).
 */
export const dynamic = 'force-dynamic';

/** The complete roster — `{ Animals: [...] }`, sorted by Name, with no paging (BR6). */
export async function GET(): Promise<Response> {
  return respondToRead(await animalGetList());
}

/** Create one animal from the five writable fields. */
export async function POST(request: Request): Promise<Response> {
  const body = await readAnimalWriteBody(request);

  if (body === null) {
    return respondToUnreadableBody();
  }

  return respondToWrite(await animalCreate(body));
}
