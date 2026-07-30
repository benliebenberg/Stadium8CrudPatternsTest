/**
 * Animal Mock Data — project-wide entity factory
 *
 * The single source of truth for the shape and canonical values of an `AnimalRead`
 * in tests. Imported by BOTH test layers (Vitest integration tests and Playwright
 * specs) so the two can never drift onto different response bodies.
 *
 * Typed against the generated API types, so a spec change that alters the entity
 * breaks these factories at compile time instead of silently producing stale
 * fixtures. Types are imported with `import type` only (fully erased at compile
 * time), which is what lets Playwright import this module without tsconfig path
 * plumbing; the sibling habitat factory is imported by relative path for the same
 * reason.
 */

import type { AnimalRead, AnimalReadList } from '@/types/api-generated';

import { createHabitats } from './habitat';

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
const DEFAULT_ANIMAL: AnimalRead = {
  Id: 1,
  Name: 'Anaya',
  Species: 'African Elephant',
  Age: 12,
  HabitatId: 1,
  HabitatName: 'Savannah',
  Diet: 'Herbivore',
  LastChangedUser: LAST_CHANGED_USER,
  LastChangedDate: '2026-07-24 08:15:42',
};

/**
 * Resolve the `HabitatName` the backend would have joined onto an animal with this
 * `HabitatId`, or `undefined` when no such habitat exists.
 *
 * `HabitatName` is pre-joined by the backend via an INNER JOIN (brief R9/BR5), so a
 * real response can never pair a `HabitatId` with a habitat name that does not belong
 * to it — and an animal whose `HabitatId` matches no habitat is dropped from list
 * results entirely.
 */
function canonicalHabitatName(
  habitatId: number | undefined,
): string | undefined {
  return createHabitats().find((habitat) => habitat.Id === habitatId)?.Name;
}

/**
 * Build a single animal, overriding any field.
 *
 * `HabitatName` stays consistent with `HabitatId` automatically: override
 * `HabitatId` alone and the matching canonical habitat name is filled in, so a
 * fixture can never claim a habitat pairing the backend's INNER JOIN could not
 * produce. Overriding `HabitatName` explicitly always wins — which is how a test
 * deliberately constructs the orphan case (an animal the backend would drop):
 *
 * @example createAnimal() // Anaya, Savannah (HabitatId 1)
 * @example createAnimal({ Id: 7, Name: 'Kaya', HabitatId: 2 }) // HabitatName: 'Rainforest'
 * @example createAnimal({ HabitatId: 999, HabitatName: undefined }) // orphan — never the default
 */
export function createAnimal(overrides: Partial<AnimalRead> = {}): AnimalRead {
  const animal: AnimalRead = { ...DEFAULT_ANIMAL, ...overrides };

  if (!('HabitatName' in overrides)) {
    animal.HabitatName = canonicalHabitatName(animal.HabitatId);
  }

  return animal;
}

/**
 * The canonical animal set: four animals spanning all three canonical habitats and
 * three distinct diets, so a habitat filter and a diet-based assertion each have more
 * than one value to discriminate between.
 *
 * Ordered by `Name`, because `GET /v1/animals` always returns the complete set sorted
 * by `Name` and accepts no sort/filter/paging parameters (brief BR6).
 *
 * Every animal references a habitat that `createHabitats()` actually contains, so the
 * INNER JOIN orphan case (brief BR5) is never present by default.
 */
export function createAnimals(): AnimalRead[] {
  return [
    createAnimal({
      Id: 1,
      Name: 'Anaya',
      Species: 'African Elephant',
      Age: 12,
      HabitatId: 1,
      Diet: 'Herbivore',
      LastChangedDate: '2026-07-24 08:15:42',
    }),
    createAnimal({
      Id: 4,
      Name: 'Kaya',
      Species: 'Bengal Tiger',
      Age: 6,
      HabitatId: 2,
      Diet: 'Carnivore',
      LastChangedDate: '2026-07-02 13:20:05',
    }),
    createAnimal({
      Id: 2,
      Name: 'Nimbus',
      Species: 'Green Sea Turtle',
      Age: 24,
      HabitatId: 3,
      Diet: 'Omnivore',
      LastChangedDate: '2026-05-30 06:44:59',
    }),
    createAnimal({
      Id: 3,
      Name: 'Zuri',
      Species: 'Scarlet Macaw',
      Age: 9,
      HabitatId: 2,
      Diet: 'Herbivore',
      LastChangedDate: '2026-07-27 18:03:27',
    }),
  ];
}

/**
 * The `GET /v1/animals` response envelope: `{ Animals: AnimalRead[] }`.
 *
 * Pass an explicit array for the empty case (`createAnimalList([])`) or for a bespoke
 * set; omit it for the canonical four.
 */
export function createAnimalList(
  animals: AnimalRead[] = createAnimals(),
): AnimalReadList {
  return { Animals: animals };
}
