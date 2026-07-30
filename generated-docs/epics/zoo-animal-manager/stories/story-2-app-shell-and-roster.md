# Story 2 — App shell and animal roster home screen

- **Epic:** `zoo-animal-manager` (Zoo Animal Manager)
- **Slug:** `story-2-app-shell-and-roster`
- **Route:** `/`
- **Target file:** `web/src/app/page.tsx`
- **Page action:** `modify_existing`
- **Roles:** N/A — single user type, roles out of scope
- **Infrastructure only:** `false`
- **Requirement IDs:** R7, R8, R9, R10, R6, BR5, BR15, NFR-2, NFR-base-1, NFR-base-3, NFR-base-5

> **Carries the epic's accessibility baseline scan.** `epicIntroducesSharedSurface` is `true` and
> this is the shared-surface story (story 1 is non-routable and cannot carry a Playwright baseline).

## Plain summary

The app's real home screen: a shared frame with navigation between Animals and Habitats, and the
full animal roster showing each animal's Name, Species, Age, Habitat and Diet. It fully replaces
the starter template's welcome page, and handles loading, "no animals yet", and "couldn't load —
retry" properly.

## Technical summary

Replace `web/src/app/page.tsx` (the template welcome page) and rework `web/src/app/layout.tsx` so
the app shell owns the **single** `<main>` landmark — the shell replaces layout's `<main>` wrapper
rather than nesting a second one inside it, while keeping `ToastProvider` / `ToastContainer`
mounted (Critical Rule 6).

Fetch the roster through the story 1 server proxy and render Name, Species, Age, Habitat (from the
pre-joined `HabitatName` — no second call) and Diet, with distinct skeleton / empty /
error-plus-retry states.

The nav's Habitats entry points at `/habitats`, whose screen arrives in **story 5** — do **not**
stub that route here. This story's ACs assert nav presence and the active section only; they must
not follow the Habitats link.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Opening the app shows the animal roster as the home screen inside a shared frame with Animals and Habitats navigation and Animals marked as the current section — the starter template's welcome page is gone, and there is no sign-in, account or sign-out affordance anywhere. | playwright |
| AC-2 | Each animal shows its Name, Species, Age, Habitat and Diet, with the habitat name taken straight from the animal's own record. | vitest |
| AC-3 | While the roster is loading, a loading placeholder is shown — the screen is never blank. | vitest |
| AC-4 | When the backend holds no animals, a plain "no animals yet" message is shown as a normal result, visually distinct from a failure. | vitest |
| AC-5 | When the roster cannot be loaded, a readable failure message with a Retry action is shown, and Retry re-attempts the load. | vitest |
| AC-6 | The home screen exposes exactly one main region and passes an accessibility scan in a real browser. | playwright |

## Manual test checklist

- ☐ Open the app at the root address → you see the animal roster, not the template welcome page
- ☐ The frame shows Animals and Habitats navigation, with Animals highlighted as the current section
- ☐ Each animal shows Name, Species, Age, Habitat and Diet
- ☐ Reload the page → you briefly see a loading placeholder, never a blank screen
- ☐ Stop the backend and reload → you see a readable failure message with a Retry button
- ☐ Restart the backend and click Retry → the roster loads
- ☐ Narrow the window to phone width → the roster stays readable

## Notes

- An animal whose `HabitatId` doesn't match a real habitat **never appears in the list at all** —
  the backend uses an INNER JOIN, which drops it (BR5). Not a bug in this screen.
- Shadcn `table` and `skeleton` are not yet installed — add via the CLI, don't hand-roll.
- All colours/fonts/spacing come from `globals.css` tokens; no hex literals in components.
