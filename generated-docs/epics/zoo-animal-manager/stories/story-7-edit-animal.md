# Story 7 — Edit an animal

- **Epic:** `zoo-animal-manager` (Zoo Animal Manager)
- **Slug:** `story-7-edit-animal`
- **Route:** `/animals/[id]/edit`
- **Target file:** `web/src/app/animals/[id]/edit/page.tsx`
- **Page action:** `create_new`
- **Roles:** N/A — single user type, roles out of scope
- **Infrastructure only:** `false`
- **Requirement IDs:** R21, R19, R23, BR3, NFR-3, NFR-5

## Plain summary

Change an existing animal using the same form, prefilled with its current details. The same entry
rules apply as when adding, a successful save shows the backend's own confirmation, and the updated
values show up immediately on the animal's page and in the roster.

## Technical summary

New route `web/src/app/animals/[id]/edit/page.tsx`, entered from the animal detail view (story 4),
**reusing the story 6 shared form component** in edit mode and prefilling it from the single-animal
read.

Send the same five writable fields via `PUT` through the story 1 proxy (the change-name header is
injected server-side, R5), with the same validation as add and the same shared write-result
interpretation, then show the backend's own confirmation and refresh both the detail view and the
roster.

Cancel is non-destructive.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Choosing Edit on an animal opens the same form prefilled with that animal's current Name, Species, Age, Habitat and Diet. | playwright |
| AC-2 | The prefilled form applies exactly the same required-field and Age rules as adding, blocking the save on invalid entries. | vitest |
| AC-3 | Saving changes shows the backend's own confirmation wording, and the updated values appear on the animal's page and in the roster without a manual reload. | playwright |
| AC-4 | Cancelling leaves the animal unchanged and returns the user to where they came from. | vitest |
| AC-5 | The form never exposes the record's identifier, its habitat name, or its change-tracking values as editable entries. | vitest |

## Manual test checklist

- ☐ Open an animal and click Edit → the form is prefilled with its current values
- ☐ Clear the Name and try to save → you see a required message, exactly as on the add form
- ☐ Change the habitat and save → you see the backend's confirmation message and the animal's page shows the new habitat
- ☐ Go back to the roster → the updated values are already shown, without reloading the page
- ☐ Open Edit again and click Cancel → nothing about the animal changes

## Notes

- Success returns `MessageType: "Success"` with `"Animal updated successfully"`.
- Prefer extending the shared `AnimalForm` with a mode/variant over duplicating it.
- Duplicate-name and technical-failure handling is **story 8** — it applies to this story's save
  path too, and story 8's ACs explicitly cover the edit case.
