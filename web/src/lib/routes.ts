/**
 * The app's own screen routes, in one place.
 *
 * Navigation links, roster row links, and post-write redirects all read from here, so a
 * route is spelled once. Kept separate from `web/src/lib/api/endpoints.ts`: these are pages
 * a person navigates to, those are the app's API handlers.
 */

/** The animal roster — the home screen. */
export const ANIMALS_ROUTE = '/';

/** The habitat list. */
export const HABITATS_ROUTE = '/habitats';

/** The add-an-animal form, reached from the roster (R17). */
export const ANIMAL_CREATE_ROUTE = '/animals/new';

/** One animal's detail screen. */
export function animalDetailRoute(id: number | string): string {
  return `/animals/${id}`;
}

/**
 * One animal's edit form (R21) — reached from that animal's detail screen.
 *
 * Built from {@link animalDetailRoute} rather than spelled out again, so the edit form can
 * never end up hanging off a different path than the record it edits.
 */
export function animalEditRoute(id: number | string): string {
  return `${animalDetailRoute(id)}/edit`;
}

/**
 * One dynamic route segment out of `useParams()`, as a plain string.
 *
 * `useParams()` types every segment as possibly an array (catch-all routes) and possibly
 * absent, so both are narrowed here instead of being asserted away in each page. The value is
 * passed on exactly as it appears in the address bar: the API route handler is what decides
 * whether it could be a record id at all, and it answers a junk segment with a proper
 * not-found rather than a screen second-guessing the address bar.
 *
 * Shared by every screen that reads an id from its route — the animal detail view and the
 * animal edit form both take the same way in.
 */
export function routeSegment(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}
