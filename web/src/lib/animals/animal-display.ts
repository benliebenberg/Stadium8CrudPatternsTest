/**
 * How an animal's recorded fields are turned into text a person reads.
 *
 * Every field on the generated API types is optional — the spec declares no `required:`
 * arrays and the backend validates nothing (architecture.md § Cross-epic debt) — so every
 * screen that shows a record has the same problem: a value may simply not be there, and
 * `undefined` / `NaN` must never reach the page. Written once here so the roster, the detail
 * view, and the write flows all say the same thing about a gap.
 *
 * **Text values are returned verbatim when they are present.** Nothing here reformats,
 * re-parses, or "tidies" a recorded value — which matters most for `LastChangedDate`, whose
 * pre-formatted South African local time the backend has already converted (BR13). Applying
 * a second conversion, or a locale format, would shift every timestamp by two hours.
 * React-free and fetch-free on purpose.
 */

import type { AnimalRead } from '@/types/api-generated';

/** Shown in place of a field the record does not carry. Never a blank cell, never `undefined`. */
export const NOT_RECORDED = 'Not recorded';

/**
 * A recorded text field, or {@link NOT_RECORDED}.
 *
 * The value itself is returned untouched — only the emptiness test trims, so a field holding
 * nothing but whitespace counts as absent rather than rendering as a mysterious gap.
 */
export function recordedText(value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    return NOT_RECORDED;
  }

  return value;
}

/**
 * A recorded numeric field, or {@link NOT_RECORDED}.
 *
 * `Number.isFinite` rather than a truthiness check: `0` is a real value, and `NaN` — which a
 * malformed response can produce — is text no user should ever see.
 */
export function recordedNumber(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value)
    ? NOT_RECORDED
    : String(value);
}

/**
 * An age with its unit, or {@link NOT_RECORDED} — "6 years", "1 year".
 *
 * Used where the number needs saying out loud (the detail view's labelled field). The roster
 * table shows the bare number instead, because its column heading already supplies the unit.
 */
export function recordedYears(value: number | undefined): string {
  const years = recordedNumber(value);

  if (years === NOT_RECORDED) {
    return NOT_RECORDED;
  }

  return `${years} ${value === 1 ? 'year' : 'years'}`;
}

/**
 * What to call an animal on screen.
 *
 * Falls back to the id so a link or a heading always has a name — an unnamed link is unusable
 * to a screen reader, and "Not recorded" as a page heading tells the reader nothing about
 * which record they are looking at.
 */
export function animalDisplayName(animal: AnimalRead): string {
  const name = animal.Name?.trim();

  if (name !== undefined && name !== '') {
    return name;
  }

  return animal.Id === undefined ? 'Unnamed animal' : `Animal ${animal.Id}`;
}
