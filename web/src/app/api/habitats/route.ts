// security-ignore-file: rbac This project has no authentication surface at all — no login, no session, no user store and no roles (decided at INTAKE, recorded in generated-docs/project.md §Roles & Permissions and §Authentication). There is no auth helper to call and no identity to authorize, so an authorization guard here could only be theatre. This route is read-only in any case — `GET /v1/habitats` is the only habitat operation the backend has. The access model is a single shared API key held server-side; closing that needs a backend change to the Linx solution plus a sign-in surface, and is out of scope for this epic. Reviewed and accepted by the project owner at the epic-end quality gate on 2026-07-30.
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
