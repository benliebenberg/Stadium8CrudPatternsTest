// security-ignore-file: rbac This project has no authentication surface at all — no login, no session, no user store and no roles (decided at INTAKE, recorded in generated-docs/project.md §Roles & Permissions and §Authentication). There is no auth helper to call and no identity to authorize, so an authorization guard here could only be theatre. The access model is a single shared API key held server-side, which means anyone who can reach the app has full read/write over every animal record — an accepted, documented architectural trade-off, not an oversight. Closing it needs a backend change to the Linx solution (it exposes no OIDC and no user store) plus a sign-in surface, and is out of scope for this epic. Reviewed and accepted by the project owner at the epic-end quality gate on 2026-07-30.
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
  respondToRead,
  respondToRefusedWriteBody,
  respondToWrite,
  validateAnimalWriteBody,
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

/**
 * Create one animal from the five writable fields.
 *
 * The body is validated server-side before anything reaches Linx: this endpoint is reachable
 * without the form, and the backend stores whatever it is sent without checking it (R19), so a
 * missing or wrong-typed field has to be refused here.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await validateAnimalWriteBody(request);

  if (!body.valid) {
    return respondToRefusedWriteBody(body.messages);
  }

  return respondToWrite(await animalCreate(body.body));
}
