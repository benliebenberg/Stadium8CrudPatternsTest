# Story 5 — Habitats reference list (read-only)

- **Epic:** `zoo-animal-manager` (Zoo Animal Manager)
- **Slug:** `story-5-habitats-list`
- **Route:** `/habitats`
- **Target file:** `web/src/app/habitats/page.tsx`
- **Page action:** `create_new`
- **Roles:** N/A — single user type, roles out of scope
- **Infrastructure only:** `false`
- **Requirement IDs:** R15, R16, BR7, BR13, NFR-2, NFR-base-5

## Plain summary

A look-only habitats reference reached from the navigation, showing each habitat's name and when it
was last changed. Habitats cannot be added, edited or removed anywhere in this app — the screen is
designed to read as deliberately complete, not as an unfinished editor missing its buttons.

## Technical summary

New route `web/src/app/habitats/page.tsx` fetching habitats through the story 1 proxy, with its own
loading / no-habitats / failed-to-load-plus-retry states and the same **verbatim SAST date rule** as
story 4 (BR13).

Completes the Habitats navigation entry introduced with the shell in story 2, and marks it as the
current section.

**Ships no add/edit/delete affordance** — no buttons, no context menus, no "coming soon"
placeholders, no disabled-but-present controls — because the operations genuinely do not exist on
the backend (BR7). The framing must not imply a role or permission could unlock them: this is a
**backend capability limit**, not a permission rule.

Also supplies the habitat data the story 6 form's picker consumes.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Following the Habitats navigation opens the habitats reference list, with Habitats marked as the current section. | playwright |
| AC-2 | Each habitat shows its Name and its last-changed details, with the date shown exactly as the backend sends it. | vitest |
| AC-3 | The screen has separate loading, no-habitats, and failed-to-load states, the last with a Retry action that re-attempts the load. | vitest |
| AC-4 | No add, edit or delete control for habitats appears anywhere on the screen — including greyed-out controls, context menus, or "coming soon" placeholders. | vitest |
| AC-5 | The screen reads as an intentionally look-only, complete reference rather than an unfinished editor, and nothing suggests some other user could edit habitats. | none |

## Manual test checklist

- ☐ Click Habitats in the navigation → you see the habitats list and Habitats is highlighted
- ☐ Each habitat shows its name and when it was last changed
- ☐ The last-changed dates read in South African local time
- ☐ There is no Add, Edit or Delete control anywhere on this screen — not even a greyed-out one
- ☐ The screen reads as deliberately read-only, not as an unfinished screen missing its buttons
- ☐ Stop the backend and reload the habitats screen → you see a readable failure with a Retry button

## Notes

- **AC-5 is the core design problem of this story** and is deliberately not test-covered — it is a
  judgement call verified by eye at the manual-test gate. Making read-only feel intentional rather
  than unfinished usually means: no empty "Actions" column, no disabled buttons, and framing the
  screen as a reference rather than a management table.
- `HabitatRead` = `{ Id: int64, Name: string, LastChangedDate: string?, LastChangedUser: string? }`
  — the last two are nullable.
