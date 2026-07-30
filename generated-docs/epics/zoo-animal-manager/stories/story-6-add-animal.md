# Story 6 — Add an animal

- **Epic:** `zoo-animal-manager` (Zoo Animal Manager)
- **Slug:** `story-6-add-animal`
- **Route:** `/animals/new`
- **Target file:** `web/src/app/animals/new/page.tsx`
- **Page action:** `create_new`
- **Roles:** N/A — single user type, roles out of scope
- **Infrastructure only:** `false`
- **Requirement IDs:** R17, R18, R19, R23, R16, BR3, BR5, NFR-3, NFR-5

## Plain summary

Add a new animal from the roster using a form with exactly five entries — Name, Species, Age,
Habitat and Diet. Habitat must be chosen from the existing habitats, entries are checked before
anything is sent, and a successful save shows the backend's own confirmation with the new animal
visible in the roster straight away.

## Technical summary

New route `web/src/app/animals/new/page.tsx` plus the **shared form component**
`web/src/components/animals/AnimalForm.tsx` that story 7 reuses for editing.

Five writable fields only — `Id`, `HabitatName`, `LastChangedUser` and `LastChangedDate` are never
sent or shown.

The habitat picker is **mandatory** and sourced from story 5's habitat data, because an animal
saved against a non-existent habitat is created and then **permanently invisible in every list**
(BR5 — the backend INNER JOINs Habitat on read). It offers no habitat-creation shortcut (R16).

Validation is Zod-based in `web/src/lib/validation/`, alongside the existing `validateRequest`
helper, with Age a whole number ≥ 0 — **the backend validates nothing** (R19), it inserts straight
to the database.

Submit via the story 1 proxy and interpret the reply with the shared write-result helper, showing
the backend's own success message through the existing toast infrastructure and refreshing the
roster.

### Split rationale

Add and edit share one form component but are **separate stories** because edit adds a
prefill-from-single-read path, a different route, a different operation and a different landing
destination — one story could not honestly fit both inside the AC budget. Validation rides **here**
rather than standing alone because it is the form's own behaviour and is inseparable from it; edit
inherits it free through the shared component.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | An "Add animal" action on the roster opens a form with exactly the five entries specified in the brief — Name, Species, Age, Habitat and Diet — and no change-tracking or identifier fields. | playwright |
| AC-2 | Habitat is chosen from the existing habitats and is mandatory — the animal cannot be saved without one, and the picker offers no way to create a habitat. | vitest |
| AC-3 | Invalid entries block the save and show a message against each offending field per the brief's rules, with Age required to be a whole number of zero or more. | vitest |
| AC-4 | Saving a valid animal shows the backend's own confirmation wording and the new animal is visible in the roster without a manual reload. | playwright |
| AC-5 | If the save is refused, everything the user typed stays on screen and they are not navigated away or dumped on a full-page error. | vitest |

## Manual test checklist

- ☐ Click Add animal on the roster → the form opens with Name, Species, Age, Habitat and Diet, and nothing about who changed the record
- ☐ Try to save with the form empty → each field shows a message and nothing is saved
- ☐ Enter Age as -1, then as 2.5 → you're told Age must be a whole number of 0 or more
- ☐ Try to save without choosing a habitat → you can't; a habitat is required
- ☐ Open the habitat picker → it lists only existing habitats, with no "add a new habitat" option
- ☐ Fill in a valid animal and save → you see the backend's own confirmation message and the animal appears in the roster without reloading

## Notes

- Success returns `MessageType: "Success"` with `"Animal successfully created"` and the new `Id`.
- The `LastChangedUser` header is injected by the server tier (story 1) — **no form field**, and
  the user never supplies or sees it.
- Shadcn `form`, `select` and `alert` are needed — add via the CLI, don't hand-roll.
- Duplicate-name and technical-failure handling is **story 8**, not here.
