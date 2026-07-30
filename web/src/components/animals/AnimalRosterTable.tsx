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
 *    choose to send. The rules for that live in `@/lib/animals/animal-display`, shared with
 *    the detail view so a gap reads identically on both screens.
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
import {
  animalDisplayName,
  recordedNumber,
  recordedText,
} from '@/lib/animals/animal-display';
import { animalDetailRoute } from '@/lib/routes';
import type { AnimalRead } from '@/types/api-generated';

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
          const name = animalDisplayName(animal);

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
              <TableCell>{recordedText(animal.Species)}</TableCell>
              <TableCell>{recordedNumber(animal.Age)}</TableCell>
              <TableCell>{recordedText(animal.HabitatName)}</TableCell>
              <TableCell>{recordedText(animal.Diet)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
