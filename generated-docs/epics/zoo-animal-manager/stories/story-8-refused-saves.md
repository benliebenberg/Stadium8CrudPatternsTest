# Story 8 — Handling refused saves: duplicate names and technical failures

- **Epic:** `zoo-animal-manager` (Zoo Animal Manager)
- **Slug:** `story-8-refused-saves`
- **Route:** `/animals/new`
- **Target file:** `web/src/components/animals/AnimalForm.tsx`
- **Page action:** `modify_existing`
- **Roles:** N/A — single user type, roles out of scope
- **Infrastructure only:** `false`
- **Requirement IDs:** R20, R24, BR4, BR10, BR11, NFR-3, NFR-base-5, NFR-base-6

## Plain summary

When the backend refuses a save, you get told why without losing your work. A name that already
exists shows a fixable warning right next to the Name field; a technical problem shows a readable
message with a way to try again. In both cases everything you typed stays exactly where it was.

## Technical summary

Add the two rejection branches to the shared form component used by both add (story 6) and edit
(story 7), consuming the story 1 write-result helper.

**Duplicate** arrives as **HTTP 500** with `MessageType: "Warning"` and
`Messages: ["Animal already exists"]` (BR10). Surface it against the **Name field**, styled visibly
as a **recoverable business rejection** — never a full-page error, never a wiped form.

**Technical failure** arrives as **HTTP 500** with `MessageType: "Error"` and the raw
backend/database text in `Messages[0]` (BR11). Surface something readable as the *primary* message
rather than the raw SQL, keep every entry, and offer retry — without dismissing or swallowing the
error (Critical Rule 3).

### Standalone rationale

These two branches apply **identically to add and edit**, depend on both existing, and are the
epic's **highest-risk unverified backend assumption**. Folding them into story 6 would blow its AC
budget and leave edit's rejection path unverified.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Saving an animal whose name already exists shows a recoverable warning against the Name field, keeps every value the user typed, and neither navigates away nor clears the form. | playwright |
| AC-2 | The same duplicate-name warning behaves identically when editing an existing animal. | vitest |
| AC-3 | A duplicate-name rejection is presented visibly as a business rejection, clearly distinct in wording and treatment from a technical failure. | vitest |
| AC-4 | A technical failure shows a readable message as the primary message rather than the raw backend text, keeps every entry intact, and offers a way to try again. | vitest |
| AC-5 | Retrying after a technical failure resubmits the same values without the user re-typing anything. | vitest |

## Manual test checklist

- ☐ Add an animal using a name that already exists → a warning appears next to the Name field and everything you typed is still there
- ☐ That duplicate warning reads as something you can fix, clearly not a system crash
- ☐ Try the same duplicate name while editing a different animal → you get the same warning in the same place
- ☐ Stop the backend, then save the form → you see a readable message (not raw database text), and your entries are still on screen
- ☐ Restart the backend and click retry → the save goes through without you re-typing anything

## Notes

- **The exact uniqueness rule is unconfirmed** — most likely `Animal.Name`, but the backend files
  don't show it. A dedicated `ReturnDuplicateRecordError.function` exists on both
  `AnimalCreate` and `AnimalUpdate`. **Confirm against the running backend during this story.** If
  it turns out to be broader (name *plus* species, say), the message must not point at the wrong
  field.
- Both branches share the same HTTP status (500) — `MessageType` is the **only** reliable
  discriminator. This is exactly why story 1 builds the shared result helper.
