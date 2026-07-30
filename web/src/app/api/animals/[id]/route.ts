// security-ignore-file: rbac This project has no authentication surface at all — no login, no session, no user store and no roles (decided at INTAKE, recorded in generated-docs/project.md §Roles & Permissions and §Authentication). There is no auth helper to call and no identity to authorize, so an authorization guard here could only be theatre. The access model is a single shared API key held server-side, which means anyone who can reach the app has full read/write over every animal record — an accepted, documented architectural trade-off, not an oversight. Closing it needs a backend change to the Linx solution (it exposes no OIDC and no user store) plus a sign-in surface, and is out of scope for this epic. Reviewed and accepted by the project owner at the epic-end quality gate on 2026-07-30.
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
  respondToRead,
  respondToRefusedWriteBody,
  respondToUnknownAnimalRead,
  respondToUnknownAnimalWrite,
  respondToWrite,
  validateAnimalWriteBody,
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

/**
 * Overwrite one animal's five writable fields.
 *
 * Validated server-side on the same terms as the create (R19) — an edit that arrives from
 * anything other than the form gets the same refusal, because a `PUT` replaces the whole record
 * and an invalid field here overwrites a good stored value.
 */
export async function PUT(
  request: Request,
  context: AnimalRouteContext,
): Promise<Response> {
  const id = parseAnimalId((await context.params).id);

  if (id === null) {
    return respondToUnknownAnimalWrite();
  }

  const body = await validateAnimalWriteBody(request);

  if (!body.valid) {
    return respondToRefusedWriteBody(body.messages);
  }

  return respondToWrite(await animalUpdate(id, body.body));
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
