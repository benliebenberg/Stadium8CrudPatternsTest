/**
 * The app's OWN browser-side API surface — the only endpoints the browser may call.
 *
 * Every path here is root-relative on purpose. The browser talks exclusively to this app's
 * route handlers under `web/src/app/api/`; those handlers are the only code that reaches the
 * Linx backend, because the shared `X-API-Key` must never leave the server and the Linx host
 * emits no CORS headers (architecture.md § Decision 1). `buildUrl()` in
 * `web/src/lib/api/client.ts` throws on anything that is not root-relative, so an absolute
 * URL added here would fail loudly rather than leak the backend's address.
 *
 * Centralised so a path is written once and every screen — roster, detail, habitats, and the
 * write flows — asks for the same string.
 */

/** The animal collection: `GET` the full roster, `POST` a new animal. */
export const ANIMALS_ENDPOINT = '/api/animals';

/** The habitat collection: `GET` only — the backend has no habitat writes (BR7). */
export const HABITATS_ENDPOINT = '/api/habitats';

/**
 * One animal: `GET` / `PUT` / `DELETE`.
 *
 * The id is interpolated as given; the route handler is what validates it can be an animal
 * id at all (`parseAnimalId`), so a junk value produces a proper not-found answer instead of
 * being silently swallowed here.
 */
export function animalEndpoint(id: number | string): string {
  return `${ANIMALS_ENDPOINT}/${id}`;
}
