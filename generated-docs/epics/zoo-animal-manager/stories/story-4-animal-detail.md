# Story 4 — Animal detail view

- **Epic:** `zoo-animal-manager` (Zoo Animal Manager)
- **Slug:** `story-4-animal-detail`
- **Route:** `/animals/[id]`
- **Target file:** `web/src/app/animals/[id]/page.tsx`
- **Page action:** `create_new`
- **Roles:** N/A — single user type, roles out of scope
- **Infrastructure only:** `false`
- **Requirement IDs:** R12, R13, R14, BR8, BR9, BR13, BR14, NFR-2, NFR-base-5

## Plain summary

Open one animal from the roster and see its complete record, including when it was last changed. If
the animal doesn't exist or was already removed, you get a clear "not found" page with a way back —
never blank fields or a crash.

## Technical summary

New route `web/src/app/animals/[id]/page.tsx`, reached from a roster row. Fetch the single animal
through the story 1 proxy — noting `GET /v1/animals/{Id}` returns `AnimalRead` **unwrapped**,
unlike the writes (BR8) — and show every recorded field.

**`LastChangedDate` is rendered verbatim** as the pre-formatted SAST text the backend sends: never
re-parsed, never handed to a date library, never converted a second time (BR13). The backend's SQL
does `FORMAT(... AT TIME ZONE 'UTC' AT TIME ZONE 'South Africa Standard Time', 'yyyy-MM-dd HH:mm:ss')`,
so the conversion has already happened. Applying another shifts every timestamp by two hours.

**`LastChangedUser` is labelled as a fixed system/deployment value**, never as per-person
attribution (BR14) — it reads the same on every record because there is no per-person identity.

Add an explicit not-found state for a missing or already-deleted id, since the backend has no clean
404 path — its Linx event is just `ReadAnimal → Return`, with no TryCatch or If branch (BR9).
**Confirm the real response while building.**

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Selecting an animal from the roster opens that animal's own page showing every recorded field for it, with a way back to the roster. | playwright |
| AC-2 | The last-changed date is shown exactly as the backend sends it, with no re-formatting and no time-zone shift applied by the app. | vitest |
| AC-3 | The last-changed name is presented and labelled as a fixed system value, never as the person who made the change. | vitest |
| AC-4 | While the record loads a loading placeholder is shown, and if it cannot be loaded a readable failure with a Retry action is shown. | vitest |
| AC-5 | Opening an animal that does not exist or was already removed shows a clear "animal not found" page with a way back to the roster — never blank fields and never a crash. | playwright |

## Manual test checklist

- ☐ Click an animal in the roster → you land on its page with all its details
- ☐ The last-changed date matches South African local time for a record you know the history of (it is not shifted by hours)
- ☐ The last-changed name is presented as a system value, not as a person who made the change
- ☐ Type an animal address that doesn't exist into the address bar → you see "animal not found", not a crash or a row of blanks
- ☐ Use the back/return link → you're on the roster again

## Notes

- The layout should leave a sensible place for Edit (story 7) and Remove (story 9) to land, but
  must not build them here.
- Unverified backend behaviour to confirm: what the single-animal read actually returns for an
  unknown Id — empty body, empty object, HTTP 500, or something else.
