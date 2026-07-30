/**
 * Narrowing the animal roster — the matching rules, with no React in them (R11, BR6).
 *
 * All of this happens **in the browser, over the roster already loaded**. `GET /v1/animals`
 * accepts no search, filter, sort or paging parameters and always returns the complete set
 * sorted by `Name` (BR6), so there is no server-side alternative to defer to: narrowing is
 * derived state over what `useAnimalRoster()` already holds, never a second request.
 *
 * Kept as plain functions so the rules are testable and reusable on their own, and so the
 * screen holds nothing but the two values a person typed and picked.
 *
 * Known scaling limitation, accepted for this epic: every animal is in browser memory. Fixing
 * it needs a **backend** change (paging parameters that do not exist), not a frontend one.
 */

import type { AnimalRead } from '@/types/api-generated';

/** What the person has narrowed the roster by. */
export interface RosterFilter {
  /** Free text matched against Name and Species. Blank means "no term". */
  readonly term: string;
  /** An exact `HabitatName`, or `null` for every habitat. */
  readonly habitat: string | null;
}

/** A field's text for comparison purposes, or `''` when the record does not carry it. */
function comparable(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/**
 * The habitat names the loaded roster actually occupies, de-duplicated and sorted.
 *
 * Deliberately derived from the animals rather than from `GET /api/habitats`: the filter
 * offers only habitats a person can actually narrow *to*, an empty choice is impossible by
 * construction, and this screen needs no habitat fetch at all (so it works before the
 * habitats screen exists, and cannot break when that endpoint does).
 *
 * An animal whose `HabitatName` is missing contributes no choice — the backend's INNER JOIN
 * means such a record should never arrive (BR5), and inventing an "Unassigned" bucket for it
 * would put a habitat in the list that no habitat record backs.
 */
export function habitatsInRoster(animals: readonly AnimalRead[]): string[] {
  const names = new Set<string>();

  for (const animal of animals) {
    const habitat = animal.HabitatName?.trim();

    if (habitat !== undefined && habitat !== '') {
      names.add(habitat);
    }
  }

  return [...names].sort((left, right) => left.localeCompare(right));
}

/**
 * Does this animal match the typed term?
 *
 * Case-insensitive **substring** match on Name **or** Species — someone looking for the
 * Bengal Tiger types "tiger", and someone half-remembering "Anaya" types "aya". A prefix or
 * exact match would answer neither.
 */
function matchesTerm(animal: AnimalRead, term: string): boolean {
  if (term === '') {
    return true;
  }

  return (
    comparable(animal.Name).includes(term) ||
    comparable(animal.Species).includes(term)
  );
}

/** Is this animal in the chosen habitat? `null` means no habitat was chosen. */
function matchesHabitat(animal: AnimalRead, habitat: string | null): boolean {
  return (
    habitat === null || comparable(animal.HabitatName) === comparable(habitat)
  );
}

/**
 * The animals that survive both controls.
 *
 * An **intersection**, not a union: a term and a habitat together are narrower than either
 * alone, which is what makes combining them worth doing. Order is untouched — the backend's
 * `Name` order is the only order this app shows (BR6).
 */
export function filterRoster(
  animals: readonly AnimalRead[],
  filter: RosterFilter,
): readonly AnimalRead[] {
  const term = filter.term.trim().toLowerCase();

  if (term === '' && filter.habitat === null) {
    return animals;
  }

  return animals.filter(
    (animal) =>
      matchesTerm(animal, term) && matchesHabitat(animal, filter.habitat),
  );
}
