/**
 * Habitat Mock Data — project-wide entity factory
 *
 * The single source of truth for the shape and canonical values of a `HabitatRead`
 * in tests. Imported by BOTH test layers (Vitest integration tests and Playwright
 * specs) so the two can never drift onto different response bodies.
 *
 * Typed against the generated API types, so a spec change that alters the entity
 * breaks these factories at compile time instead of silently producing stale
 * fixtures. Types are imported with `import type` only (fully erased at compile
 * time), which is what lets Playwright import this module without tsconfig path
 * plumbing.
 *
 * Habitats are read-only on this backend — only `GET /v1/habitats` exists — so
 * there is deliberately no "write" counterpart to these factories.
 */

import type { HabitatRead, HabitatReadList } from '@/types/api-generated';

/**
 * Every record carries the SAME `LastChangedUser`, because it is a single fixed
 * deployment value injected server-side from the `LAST_CHANGED_USER` env var
 * (default `Animal Manager`) — there is no login and no per-person identity
 * (project.md §`LastChangedUser` header, brief BR14).
 *
 * Deliberately NOT varied per record: varying it would misrepresent the system and
 * could let a test look like it proves per-person attribution, which does not exist.
 */
const LAST_CHANGED_USER = 'Animal Manager';

/**
 * `LastChangedDate` arrives as pre-formatted text in `'yyyy-MM-dd HH:mm:ss'`,
 * ALREADY converted to South Africa Standard Time by the backend (brief BR13).
 *
 * These defaults are therefore plain strings in exactly that shape — never ISO-8601,
 * never a `Date`, never carrying a `Z` or an offset. The times of day are chosen so
 * that a frontend bug which re-parses the value as UTC and re-converts it produces a
 * visibly different string, rather than passing unnoticed.
 */
const DEFAULT_HABITAT: HabitatRead = {
  Id: 1,
  Name: 'Savannah',
  LastChangedUser: LAST_CHANGED_USER,
  LastChangedDate: '2026-07-21 09:15:00',
};

/**
 * Build a single habitat, overriding any field.
 *
 * @example createHabitat() // Savannah, Id 1
 * @example createHabitat({ Id: 2, Name: 'Rainforest' })
 */
export function createHabitat(
  overrides: Partial<HabitatRead> = {},
): HabitatRead {
  return { ...DEFAULT_HABITAT, ...overrides };
}

/**
 * The canonical habitat set: three habitats, so any habitat filter or habitat picker
 * has more than one option to choose between.
 *
 * `Id` values here are what `web/src/mocks/data/animal.ts` resolves `HabitatName`
 * against — keep the two in step.
 *
 * Returned in `Id` order. The backend does not document an ordering for
 * `GET /v1/habitats` (unlike animals, which are documented as sorted by `Name`), so
 * tests should not assert on the order of this list.
 */
export function createHabitats(): HabitatRead[] {
  return [
    createHabitat({
      Id: 1,
      Name: 'Savannah',
      LastChangedDate: '2026-07-21 09:15:00',
    }),
    createHabitat({
      Id: 2,
      Name: 'Rainforest',
      LastChangedDate: '2026-06-08 16:47:33',
    }),
    createHabitat({
      Id: 3,
      Name: 'Aquarium',
      LastChangedDate: '2026-07-19 07:02:11',
    }),
  ];
}

/**
 * The `GET /v1/habitats` response envelope: `{ Habitats: HabitatRead[] }`.
 *
 * Pass an explicit array for the empty case (`createHabitatList([])`) or for a
 * bespoke set; omit it for the canonical three.
 */
export function createHabitatList(
  habitats: HabitatRead[] = createHabitats(),
): HabitatReadList {
  return { Habitats: habitats };
}
