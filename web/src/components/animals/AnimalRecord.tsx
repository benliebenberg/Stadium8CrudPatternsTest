/**
 * One animal's complete record, as a labelled term/value list (R12).
 *
 * A description list rather than a table: this is one entity's fields, so every value has a
 * label of its own, which is both how a screen reader should hear it and what lets a test
 * assert a value *against its own label* instead of by position.
 *
 * Two rules this component exists to hold, both of which are easy to break by accident:
 *
 * 1. **`LastChangedDate` is rendered character-for-character as the backend sent it** (R13,
 *    BR13). The backend's SQL already did
 *    `FORMAT(... AT TIME ZONE 'UTC' AT TIME ZONE 'South Africa Standard Time', 'yyyy-MM-dd HH:mm:ss')`,
 *    so the value arriving here is finished text in South African local time. There is
 *    deliberately no `new Date(...)`, no `toLocaleString()`, no `Intl`, no date library and no
 *    relative "2 days ago" anywhere in this file — every one of those would re-parse the text
 *    as UTC and convert it a second time, shifting every timestamp two hours forward. The zone
 *    is told to the user in the **label**, because a suffix inside the value would be the app
 *    adding to a string it is supposed to pass through untouched.
 * 2. **`LastChangedUser` is a fixed system value, never attribution** (R13, BR14). It is one
 *    deployment name injected server-side on every write (`LAST_CHANGED_USER`); there is no
 *    login and no per-person identity in this project, so labelling it "Changed by" would name
 *    somebody who does not exist. It is labelled as the system source, and the note below the
 *    list says plainly why it reads the same on every animal.
 *
 * Absent fields degrade to "Not recorded" via the shared display helpers — never `undefined`
 * or `NaN` (R14).
 */

import { Card, CardContent } from '@/components/ui/card';
import {
  recordedNumber,
  recordedText,
  recordedYears,
} from '@/lib/animals/animal-display';
import { cn } from '@/lib/utils';
import type { AnimalRead } from '@/types/api-generated';

/** One labelled field: the `<dt>` text and the `<dd>` text that belongs to it. */
interface RecordField {
  readonly label: string;
  readonly value: string;
  /**
   * Render the value in the tabular-numeric face. Reserved for the id and the timestamp — the
   * two values that are read digit by digit rather than as words (design-tokens.md §1).
   */
  readonly mono?: boolean;
}

/**
 * Why the system source is identical on every record, said once rather than implied.
 *
 * Without this line a reader could reasonably assume the value names whoever made the last
 * change — which is the misrepresentation BR14 forbids.
 */
const SYSTEM_SOURCE_NOTE =
  'Every change is recorded against one fixed deployment name, so the system source reads the same on every animal.';

/**
 * The animal's own fields, in reading order: what it is, then where and how it lives, then the
 * audit trail. The name is not repeated here — it is the page heading, because the whole record
 * is about that one animal.
 */
function recordFields(animal: AnimalRead): readonly RecordField[] {
  return [
    { label: 'Animal ID', value: recordedNumber(animal.Id), mono: true },
    { label: 'Species', value: recordedText(animal.Species) },
    { label: 'Age', value: recordedYears(animal.Age) },
    // The backend pre-joins the habitat name onto the animal (R9/BR5), so no second request
    // resolves it and no habitat list is consulted.
    { label: 'Habitat', value: recordedText(animal.HabitatName) },
    { label: 'Diet', value: recordedText(animal.Diet) },
    {
      // The zone belongs in the label; the value stays exactly as it arrived.
      label: 'Last changed (SAST)',
      value: recordedText(animal.LastChangedDate),
      mono: true,
    },
    { label: 'System source', value: recordedText(animal.LastChangedUser) },
  ];
}

export function AnimalRecord({ animal }: { readonly animal: AnimalRead }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          {recordFields(animal).map((field) => (
            <div key={field.label} className="flex flex-col gap-1">
              <dt className="text-body text-muted-foreground">{field.label}</dt>
              <dd
                className={cn(
                  'text-body font-medium',
                  field.mono === true && 'font-mono',
                )}
              >
                {field.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-body text-muted-foreground">{SYSTEM_SOURCE_NOTE}</p>
      </CardContent>
    </Card>
  );
}
