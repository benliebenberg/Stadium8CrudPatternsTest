/**
 * The habitats the zoo has, as a finished reference table (R15).
 *
 * **This component ships no add, edit or delete affordance, and that is the requirement — not an
 * omission** (R16/BR7). Only `GET /v1/habitats` exists on the backend, so a button, a row menu,
 * a greyed-out control or a "coming soon" placeholder would each promise a capability that does
 * not exist anywhere. Three consequences that are easy to undo by "finishing" this table later:
 *
 * 1. **There is no Actions column.** An empty trailing column is the clearest possible signal
 *    that controls are missing, and nothing would ever go in it.
 * 2. **There are no column-sort controls.** No criterion asks for sorting, the backend documents
 *    no ordering for `GET /v1/habitats`, and every extra header button is one more thing that
 *    looks half-wired.
 * 3. **The read-only-ness is framed as a property of this app, never of the reader.** Habitats
 *    are reference data here — a backend capability limit — so no wording may hint that another
 *    role, permission or account could change them. There is no login and no per-person identity
 *    in this project at all (BR14/BR15).
 *
 * The audit column follows the same two rules as `AnimalRecord`:
 *
 * - **`LastChangedDate` is rendered character-for-character as the backend sent it** (BR13). The
 *   backend's SQL already did
 *   `FORMAT(... AT TIME ZONE 'UTC' AT TIME ZONE 'South Africa Standard Time', 'yyyy-MM-dd HH:mm:ss')`,
 *   so the value arriving here is finished text in South African local time. No `new Date(...)`,
 *   no `toLocaleString()`, no `Intl`, no date library, no relative "2 days ago" — each of those
 *   would re-parse the text as UTC and convert it a second time, shifting every timestamp two
 *   hours forward. The zone is told to the user in the **column heading**, because a suffix
 *   inside the value would be the app adding to a string it must pass through untouched.
 * - **`LastChangedUser` is a fixed system value, never attribution** (BR14) — one deployment name
 *   injected server-side, so it is headed as the system source and the note below the table says
 *   plainly why it reads the same on every row.
 *
 * `LastChangedUser` and `LastChangedDate` are both optional on `HabitatRead`, so a habitat
 * written outside this app's flow can arrive with neither. A gap degrades to "Not recorded" via
 * the shared display helper — never `undefined`, `null` or `Invalid Date` — and the row still
 * shows its name, because one incomplete record is not an outage.
 */

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { recordedText } from '@/lib/animals/animal-display';
import type { HabitatRead } from '@/types/api-generated';

/**
 * Why the system source is identical on every row, said once rather than implied — the same
 * sentence the animal record uses, for the same reason (BR14): without it a reader could
 * reasonably assume the value names whoever made the last change.
 */
const SYSTEM_SOURCE_NOTE =
  'The system source is one fixed deployment name, so it reads the same on every habitat.';

/** How many habitats this reference holds, said in full so the list reads as complete. */
function referenceSummary(count: number): string {
  return count === 1
    ? 'The complete habitat reference: 1 habitat on record.'
    : `The complete habitat reference: all ${count} habitats on record.`;
}

export function HabitatReference({
  habitats,
}: {
  readonly habitats: readonly HabitatRead[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <Table>
        {/* Visible, unlike the roster's caption: stating the whole set is here is what makes a
            table with no controls read as a finished reference rather than a stripped-down
            editor. */}
        <TableCaption className="text-body">
          {referenceSummary(habitats.length)}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Name</TableHead>
            {/* "Last changed", the wording used for this field throughout the epic, with the
                zone in the heading and never inside the value. */}
            <TableHead scope="col">Last changed (SAST)</TableHead>
            <TableHead scope="col">System source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {habitats.map((habitat, row) => (
            <TableRow key={habitat.Id ?? `row-${row}`}>
              {/* Rendered as the cell's own text with no wrapping element: the name is what both
                  test layers locate a habitat by, and a nested span would give the same text two
                  elements to match. */}
              <TableCell className="font-medium">
                {recordedText(habitat.Name)}
              </TableCell>
              <TableCell className="font-mono">
                {recordedText(habitat.LastChangedDate)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {recordedText(habitat.LastChangedUser)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-body text-muted-foreground">{SYSTEM_SOURCE_NOTE}</p>
    </div>
  );
}
