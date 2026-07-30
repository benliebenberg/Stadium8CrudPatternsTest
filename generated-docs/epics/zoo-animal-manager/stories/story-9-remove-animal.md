# Story 9 — Remove an animal with confirmation

- **Epic:** `zoo-animal-manager` (Zoo Animal Manager)
- **Slug:** `story-9-remove-animal`
- **Route:** `/animals/[id]`
- **Target file:** `web/src/app/animals/[id]/page.tsx`
- **Page action:** `modify_existing`
- **Roles:** N/A — single user type, roles out of scope
- **Infrastructure only:** `false`
- **Requirement IDs:** R22, R23, BR3, BR12, NFR-3, NFR-4, NFR-5

## Plain summary

Remove an animal from its own page, behind a confirmation step that names the animal and makes clear
the removal cannot be undone. On confirming you see the backend's own confirmation message and land
back on a roster that no longer lists it.

## Technical summary

Add a Remove action to the animal detail view (`web/src/app/animals/[id]/page.tsx`) behind an
**explicit confirmation dialog that names the animal** and states the action is irreversible, then
delete through the story 1 proxy (change-name header injected server-side, R5) and interpret the
reply with the shared write-result helper.

On success, show the backend's own confirmation wording via the existing toast infrastructure and
land the user on a **refreshed** roster with the animal gone — never a stale, unchanged-looking list.

**The destructive treatment uses the BUILD-defined destructive token, never the brand orange
primary-action colour** (NFR-4). The brand is single-accent; orange reads as the primary action
here, so a destructive-orange delete button would be genuinely dangerous.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A Remove action on the animal's page opens a confirmation step that names the animal being removed and states plainly that the removal cannot be undone. | playwright |
| AC-2 | Cancelling the confirmation removes nothing and leaves the user exactly where they were. | vitest |
| AC-3 | Confirming removes the animal, shows the backend's own confirmation wording, and lands the user on a roster that no longer lists it — with no manual reload. | playwright |
| AC-4 | The Remove action and its confirm button use a clearly destructive visual treatment that is never the brand's primary-action colour. | none |
| AC-5 | If the removal fails, a readable failure message is shown and the animal is still listed. | vitest |

## Manual test checklist

- ☐ Open an animal and click Remove → a confirmation names that specific animal and says the removal can't be undone
- ☐ Click Cancel → the animal is still there, unchanged
- ☐ Confirm the removal → you see the backend's own confirmation message and land on the roster with the animal gone
- ☐ The Remove button is obviously different from Save and is not the brand orange
- ☐ Stop the backend and try to remove an animal → you see a readable failure and the animal is still listed

## Notes

- **BR12:** the backend has **no error path on delete** — its Linx event is just
  `DeleteAnimal → Return`. Deleting an already-removed animal is likely reported as **success**.
  Confirm live while building; if so, that is backend behaviour to report, not to code around.
- Use Shadcn `alert-dialog` for the confirmation — add via the CLI, don't hand-roll a modal.
- AC-4 is verified by eye at the manual-test gate; the destructive token itself is defined during
  the styling pass, since the harvested Digiata palette is single-accent and has no
  success/warning/destructive hues.
