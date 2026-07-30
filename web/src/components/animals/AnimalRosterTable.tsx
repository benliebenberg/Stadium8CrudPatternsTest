/**
 * The animal roster as a real table: one row per animal, one cell per field (R8).
 *
 * Three things this component is careful about:
 *
 * 1. **Habitat comes from the animal's own `HabitatName`** (R9/BR5) — pre-joined by the
 *    backend. No second request resolves it, and no habitat list is consulted.
 * 2. **Order is the backend's.** `GET /v1/animals` returns every animal sorted by `Name`
 *    (BR6); re-sorting here would only invent a second, conflicting order.
 * 3. **A missing value is a gap, not something to print.** Every field on the generated types
 *    is optional (the spec declares no `required:` arrays), so an incomplete record degrades
 *    to "Not recorded" rather than rendering `undefined` / `NaN` at a user. Rows are never
 *    dropped for it: an animal with an unmatched habitat is already excluded by the backend's
 *    INNER JOIN (BR5), and re-implementing that rule here would hide a record the backend did
 *    choose to send.
 */

import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { animalDetailRoute } from '@/lib/routes';
import type { AnimalRead } from '@/types/api-generated';

/** Shown in place of a field the record does not carry. */
const NOT_RECORDED = 'Not recorded';

/** Text for a field that may be absent or blank. */
function textValue(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? NOT_RECORDED : trimmed;
}

/** Text for a numeric field, without letting a non-number reach the screen. */
function numberValue(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value)
    ? NOT_RECORDED
    : String(value);
}

/**
 * What to call an animal in its own row. Falls back to the id so the row's link always has an
 * accessible name — an unnamed link is unusable to a screen reader.
 */
function displayName(animal: AnimalRead): string {
  const name = animal.Name?.trim();

  if (name !== undefined && name !== '') {
    return name;
  }

  return animal.Id === undefined ? 'Unnamed animal' : `Animal ${animal.Id}`;
}

export function AnimalRosterTable({
  animals,
}: {
  readonly animals: readonly AnimalRead[];
}) {
  return (
    <Table>
      <TableCaption className="sr-only">
        Animals currently recorded, sorted by name
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Name</TableHead>
          <TableHead scope="col">Species</TableHead>
          <TableHead scope="col">Age</TableHead>
          <TableHead scope="col">Habitat</TableHead>
          <TableHead scope="col">Diet</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {animals.map((animal, row) => {
          const name = displayName(animal);

          return (
            <TableRow key={animal.Id ?? `row-${row}`}>
              <TableCell className="font-medium">
                {animal.Id === undefined ? (
                  name
                ) : (
                  <Link
                    href={animalDetailRoute(animal.Id)}
                    className="text-primary rounded-small underline-offset-4 hover:underline focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
                  >
                    {name}
                  </Link>
                )}
              </TableCell>
              <TableCell>{textValue(animal.Species)}</TableCell>
              <TableCell>{numberValue(animal.Age)}</TableCell>
              <TableCell>{textValue(animal.HabitatName)}</TableCell>
              <TableCell>{textValue(animal.Diet)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
