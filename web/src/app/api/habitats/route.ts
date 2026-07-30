/**
 * `/api/habitats` — the app's own habitat endpoint.
 *
 * Read-only, and deliberately so: `GET /v1/habitats` is the ONLY habitat operation the Linx
 * backend has. There is no create, update or delete to proxy — a genuine backend capability
 * limit, not a permission rule (R16/BR7). This file therefore exports one method, and adding
 * another would be inventing an endpoint the backend does not have.
 */

import { habitatGetList } from '@/lib/api/server/linx-client';
import { respondToRead } from '@/lib/api/server/route-helpers';

/** Never prerendered or cached — habitats are read fresh whenever a screen needs them. */
export const dynamic = 'force-dynamic';

/** The habitat reference list — `{ Habitats: [...] }`. */
export async function GET(): Promise<Response> {
  return respondToRead(await habitatGetList());
}
