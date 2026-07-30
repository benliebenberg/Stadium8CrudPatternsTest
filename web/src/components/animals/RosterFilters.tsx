'use client';

/**
 * The roster's two narrowing controls: a search box (Name or Species) and a habitat filter
 * (R11).
 *
 * Fully controlled and entirely presentational — it owns no roster, issues no request and
 * knows nothing about where the habitat choices came from. The screen holds the two values
 * and derives the visible animals from them, so narrowing can never turn into a second data
 * load (BR6).
 *
 * Two accessibility details that are requirements rather than polish:
 *
 * 1. **The search box has a real, visible `<Label>`**, so it is reachable by its accessible
 *    name whether it renders as a `textbox` or (as here) a `searchbox`.
 * 2. **The habitat trigger is named with `aria-labelledby`, not a `<label for>`.** A `<label>`
 *    cannot name a `<button>` — and Radix's Select trigger is a button whose content is the
 *    *selected value*, so without an explicit name the control would be called "Rainforest"
 *    once someone picked Rainforest. The visible text is rendered with `Label asChild` on a
 *    `<span>`: identical typography to the search label, no invalid `for` attribute.
 */

import { useId, useMemo } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** The habitat filter's reset choice, as a person reads it. Must remain distinct per R11. */
const EVERY_HABITAT_LABEL = 'All habitats';

/**
 * The `value` Radix carries for {@link EVERY_HABITAT_LABEL}.
 *
 * "Every habitat" is the absence of a habitat, but Radix rejects an empty-string item value
 * outright, so the choice needs a value of its own — and that value must not collide with a
 * real habitat name, or picking that habitat would silently clear the filter instead. Rather
 * than trusting a magic literal never to be a habitat, derive one the current roster
 * demonstrably does not contain. Purely internal: the screen above still models "every
 * habitat" as `null`.
 */
function everyHabitatValue(habitats: readonly string[]): string {
  let value = 'all-habitats';

  while (habitats.includes(value)) {
    value = `${value}-`;
  }

  return value;
}

interface RosterFiltersProps {
  /** The current search term, as typed. */
  readonly term: string;
  readonly onTermChange: (term: string) => void;
  /** The chosen `HabitatName`, or `null` for every habitat. */
  readonly habitat: string | null;
  readonly onHabitatChange: (habitat: string | null) => void;
  /** The habitats on offer — the ones the loaded roster occupies. */
  readonly habitats: readonly string[];
}

export function RosterFilters({
  term,
  onTermChange,
  habitat,
  onHabitatChange,
  habitats,
}: RosterFiltersProps) {
  const searchId = useId();
  const habitatLabelId = useId();

  const everyHabitat = useMemo(() => everyHabitatValue(habitats), [habitats]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-2 sm:max-w-xs sm:flex-1">
        <Label htmlFor={searchId}>Search by name or species</Label>
        <Input
          id={searchId}
          type="search"
          value={term}
          onChange={(event) => onTermChange(event.target.value)}
          placeholder="e.g. Kaya, or Bengal Tiger"
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label asChild>
          <span id={habitatLabelId}>Habitat</span>
        </Label>
        <Select
          value={habitat ?? everyHabitat}
          onValueChange={(value) =>
            onHabitatChange(value === everyHabitat ? null : value)
          }
        >
          <SelectTrigger
            aria-labelledby={habitatLabelId}
            className="w-full sm:w-56"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={everyHabitat}>{EVERY_HABITAT_LABEL}</SelectItem>
            {habitats.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
