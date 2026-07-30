# Story 2 — Choose Light, Dark or System from the nav bar

- **Epic:** `theme-switching` (Light and Dark Themes)
- **Slug:** `story-2-nav-theme-control`
- **Route:** `/`
- **Target file:** `web/src/components/layout/AppNav.tsx`
- **Page action:** `modify_existing`
- **Roles:** All Users
- **Infrastructure only:** `false`
- **Requirement IDs:** R1, R4, BR1, BR2, BR3, BR6, BR7, NFR-2, NFR-4, NFR-5

## Plain summary

An icon control on the right of the nav bar lets you pick Light, Dark or System. Your pick applies at
once and is remembered for this browser; picking System hands control back to your computer's setting.
It works with the keyboard alone and says which option is active in words, not just colour.

## Technical summary

Add an icon-based theme control to `AppNav.tsx`'s **existing** `<nav aria-label="Sections">` markup —
never a second `nav` element. Wire it to the story-1 theme state:

- **Light / Dark** persist the explicit preference
- **System** clears the stored preference and re-enters live `prefers-color-scheme` tracking

The control marks the active option **textually** (a tick, or wording like "Current" — semantics, not
colour), carries an accessible name, and adds nothing resembling a sign-in, account or profile
affordance. The shell keeps its single `navigation` landmark and its two existing links.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The nav bar offers Light, Dark and System, and picking one changes the whole app's appearance immediately, on every screen. | playwright |
| AC-2 | A pick of Light or Dark is still in force after a reload and on a later visit to the app in this browser. | playwright |
| AC-3 | Picking System discards the earlier pick and returns the app to following the computer's setting, including a change made while the app is open. | playwright |
| AC-4 | The control has a clear name, and which of Light, Dark or System is active is conveyed in words rather than colour alone. | vitest |
| AC-5 | The control can be reached and used with the keyboard alone, without a mouse. | playwright |
| AC-6 | The control introduces nothing resembling a sign-in, sign-out, account or profile option, and the Animals and Habitats links are unchanged beside it. | vitest |

## Manual test checklist

- ☐ Open the app → you find the theme control on the right of the nav bar
- ☐ Pick Light → the whole app turns light straight away; move to Habitats and it is still light
- ☐ Reload → it is still light
- ☐ Pick System, then change your computer's light/dark setting with the tab open → the app follows without a reload
- ☐ Open the control and check the active option is marked by something other than colour (a tick or the word 'Current')
- ☐ Reach the control by pressing Tab, open it and change the theme without touching the mouse
- ☐ Read the control's options → nothing about signing in, an account or a profile appears anywhere

## Notes

- **AC-6 protects an epic-1 contract.** Story 2 of the previous epic asserts there is no
  sign-in/sign-out/account/profile affordance anywhere — nothing added here may have an accessible name
  matching `/sign[\s-]?(in|out|up)|log[\s-]?(in|out)|account|profile/i`.
- Shadcn `dropdown-menu` is **not** installed. Add via
  `(cd web && npx shadcn add dropdown-menu --yes)` per Critical Rule 1. Per `architecture.md`: the CLI
  may prompt to overwrite even with `--yes` — decline those — and its output is not Prettier-formatted,
  so run `prettier --write` on it (the lint gate includes `format:check`).
- A Vitest file that opens a Radix menu needs the same jsdom shims already used for `select` and
  `alert-dialog`: `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`,
  `scrollIntoView`, `ResizeObserver`.
- Nav link accessible names must stay **exactly** `Animals` and `Habitats`, and `aria-current="page"`
  must keep marking the active section — both are pinned by epic 1's specs.
- No hex literals. Icon and control colours come from tokens.
