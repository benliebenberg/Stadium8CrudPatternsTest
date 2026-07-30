# Story 5 — Every state correct in light, and accessibility passing in both themes

- **Epic:** `theme-switching` (Light and Dark Themes)
- **Slug:** `story-5-light-states-and-a11y`
- **Route:** `/`
- **Target file:** `web/src/components/feedback/FailureState.tsx`
- **Page action:** `modify_existing`
- **Roles:** All Users
- **Infrastructure only:** `false`
- **Requirement IDs:** R6, R8, BR5, BR7, NFR-3, NFR-5

## Plain summary

States are where an unproven theme actually breaks, because nobody looks at them — loading
placeholders, the "no animals yet" and "no matches" messages, the failed-to-load error with its Retry
button, the duplicate-name warning, the technical-failure message and the not-found screen all get
checked and fixed in light. The automated accessibility check then runs in both themes instead of only
dark.

## Technical summary

Second half of the light audit, covering every non-happy state:

- `LoadingState` skeletons against cream
- `EmptyState` on both the roster and the habitats list
- the filtered "no matches" state
- `FailureState`'s destructive alert **plus its Retry button**
- `AnimalForm`'s field-level duplicate-name warning **and** its form-level technical-failure alert
- the not-found state on the animal detail and edit screens

Then extend the epic's axe baseline to run with `colorScheme: 'light'` **as well as** `'dark'`.

Announcement roles are unchanged — the fixes are **colour only**.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | In light, the loading placeholders on the roster, an animal's detail, the habitats list and the forms are visible against the cream page rather than blending into it. | none |
| AC-2 | In light, the "no animals yet", "no habitats" and "no matches" messages are legible and still read as calm information rather than as errors. | none |
| AC-3 | In light, the failed-to-load message and its Retry button are legible and clearly read as a problem, with the Retry button obviously clickable. | none |
| AC-4 | In light, the duplicate-name warning shown against the Name box and the technical-failure message shown above the form are both clearly visible, and neither uses the brand orange for its text. | none |
| AC-5 | In light, the not-found screen for an animal that does not exist reads clearly. | none |
| AC-6 | The automated accessibility check passes with the computer set to light as well as dark, across the roster, its failed-to-load state, an animal's detail screen, the habitats list and the add form. | playwright |

## Manual test checklist

- ☐ In Light, open the roster and watch it load → the loading placeholders are clearly visible against the cream page
- ☐ In Light, view the roster with no animals recorded, and the habitats list with none → both messages read clearly and neither looks like an error
- ☐ In Light, search for something that matches nothing → the 'no matches' message is legible and clearly not an error
- ☐ In Light, stop the backend and reload → the failed-to-load message and its Retry button are clearly legible on cream
- ☐ In Light, try to save an animal with a name that already exists → the warning under the Name box is clearly visible; then force a technical failure → its message above the form is legible too
- ☐ In Light, open an animal id that does not exist → the not-found screen reads clearly

## Notes

- **AC-6 is the load-bearing automated check of the whole epic.** The both-themes axe scan is what
  actually catches orange text or icons reintroduced on a light surface — `#ff6b01` on `#fff9ec` is
  **2.7:1** and fails AA for all text sizes. `--primary` under `:root` stays the safe darker `#ad4800`.
- **The scan lives here, not on story 1.** Light is still unfixed at story 1, so a both-themes scan
  there would be red until this story lands. Epic 1's dark-only scan in
  `web/e2e/epic-zoo-animal-manager-story-2-app-shell-and-roster.spec.ts` stays where it is — extend the
  pattern, don't replace it.
- `components/feedback/{LoadingState,EmptyState,FailureState}.tsx` are the **single source** of every
  read state — fix light there once rather than per screen.
- Five of six ACs are judged by eye, for the same reason as story 4: asserting them would mean pinning
  computed colours, which policy forbids.
- Toast appearance in both themes belongs to **story 3**, deliberately excluded from this story's
  checklist so the same notification isn't eyeballed twice. R6 appears on both stories' requirement
  lists for that reason.
- Playwright emulates the OS setting via `colorScheme` — no manual OS switching in tests.
