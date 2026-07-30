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

/** One animal's detail screen. */
export function animalDetailRoute(id: number | string): string {
  return `/animals/${id}`;
}
