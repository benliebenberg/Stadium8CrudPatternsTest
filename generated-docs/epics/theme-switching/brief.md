# Epic: Light and Dark Themes

Inherits roles, auth, data source, compliance, and styling from project.md.

---

## Goal

Let people choose Light, Dark or System from the nav bar, and make the light theme genuinely good —
every screen, every state, checked and fixed.

This is the project's **second** epic (`dependsOn: [zoo-animal-manager]`). Epic 1 (`zoo-animal-manager`,
COMPLETE, merged to `main`) delivered the whole animal-management app, permanently dark. That dependency
is already satisfied — this epic builds on the existing, merged code rather than waiting on anything.
project.md §Styling & Branding is being revised in parallel to make light a first-class theme; the facts
recorded here (token locations, contrast rules, brand constraints) are authoritative for this epic
regardless of how that revision lands.

---

## Data Model

This epic introduces no backend entity — it is a client-only preference with no server-side or
per-user persistence (there is no login and no user store in this project; see project.md
§Authentication).

| Entity | Shape | Notes |
|---|---|---|
| `ThemePreference` | `"light" \| "dark" \| "system"` | The person's explicit in-app choice, persisted in the browser only (e.g. `localStorage`). `"system"` means "no explicit choice — follow `prefers-color-scheme`, live." Absence of a stored value is equivalent to `"system"` (R2). |
| Resolved theme | `"light" \| "dark"` | The value actually applied to `<html class>` at any moment — derived from `ThemePreference`, and from the OS media query when the preference is `"system"` or absent. Never a third value; the app renders exactly one of these two at a time. |

No new API calls, no new response types, no change to any `AnimalRead`/`HabitatRead`/`DefaultResponse`
shape from epic 1.

---

## Functional Requirements

**R1. Choose Light, Dark or follow the system.** A control in the shared nav bar (`AppShell.tsx` /
`AppNav.tsx`) offers three choices — Light, Dark, and System. Choosing Light or Dark applies that theme
immediately and remembers it for this browser. Choosing System returns to following the operating
system's own light/dark setting, and the app then tracks changes to that setting live — someone
switching their OS to dark at sunset sees the app follow, with no reload and no user action beyond the
OS switch itself.

**R2. First visit respects the machine's setting.** Someone who has never chosen a theme in this app
gets the theme their OS asks for (`prefers-color-scheme`). Dark remains the app's default *look* and its
brand presentation (project.md §Styling), but the app must not override a preference the person has
already expressed at OS level without being asked. Only an explicit in-app choice (R1) overrides the OS
signal; absence of a stored choice is never treated as an implicit "dark."

**R3. No flash of the wrong theme.** The correct theme is applied before first paint. A page load must
never show a flash of dark before switching to light, or vice versa. The stored choice lives in the
browser (`localStorage`), which the server cannot see, so the theme class must be set by a small script
that runs before the app renders — not in a `useEffect` after hydration. `web/src/app/layout.tsx`
currently hardcodes `className="dark"` on `<html>`; that becomes dynamic, and `<html>` will need
`suppressHydrationWarning` because the server genuinely cannot know the browser's stored choice ahead of
that script running.

**R4. The control is usable by keyboard and screen reader.** The theme control is reachable and
operable by keyboard, has a clear accessible name, and announces which option is currently active — not
colour alone. It sits on the right-hand side of the existing nav bar as an icon-based control. It must
not disturb the existing nav: the shell still exposes exactly one `navigation` landmark and exactly one
`main` landmark (both owned today by `AppShell.tsx`), and the Animals/Habitats links keep their exact
accessible names (`Animals`, `Habitats`) and their `aria-current="page"` behaviour, all pinned by epic
1's Playwright specs.

**R5. Every screen looks right in light.** The light theme has never actually rendered — it is defined
in tokens (`web/src/styles/design-tokens.css` `:root`) but unproven. Walk every screen in light and fix
what looks wrong: the animal roster (including the search box and habitat filter), an animal's detail
page, the habitats reference list, the add form, the edit form, and the remove confirmation dialog.
"Looks right" means legible, with visible borders and surfaces, and consistent with the brand rather
than a washed-out inversion of the dark design.

**R6. Every state looks right in light.** States are where an unproven theme usually breaks, because
they are rarely looked at. Check and fix, in light: loading placeholders (`LoadingState`), the "no
animals yet" and "no habitats" empty states (`EmptyState`), the "no matches" filtered-roster state, the
failed-to-load error with its Retry button (`FailureState`), the duplicate-name warning against the Name
field (`AnimalForm`'s `Warning` path), the technical-failure message on the form (`AnimalForm`'s `Error`
path), the not-found page, and the toast notifications for a successful save and a failed one.

**R7. Notifications use the theme's colours.** The template's toast components
(`web/src/components/toast/Toast.tsx` and `ToastContainer.tsx`) style themselves with raw Tailwind
colour utilities (`bg-white`, `border-red-500`, `text-green-500`, `text-gray-900`) instead of the design
tokens — recorded as cross-epic debt in `generated-docs/architecture.md`. That is invisible while the
app is permanently dark, but it means notifications render wrongly in light mode. Bring them onto the
token set (`--card`, `--destructive`, `--success`, `--warning`) so they follow whichever theme is
active. Their behavioural contract must not change: an error variant renders `role="alert"`, every
other variant renders `role="status"` — epic 1's tests depend on exactly that; this is a re-skin, not a
re-implementation.

**R8. Accessible contrast in both themes, not just dark.** The automated accessibility scan (epic 1's
story 2 axe baseline) currently runs only in dark. It must run in **both** themes. The specific rule
that makes this necessary: brand orange `#ff6b01` on cream `#fff9ec` is 2.7:1 and **fails AA** for all
text sizes, so on any light surface the orange must not be used for text or icons. `--primary` under
`:root` is already the safe darker `#ad4800` — that is deliberate and must not be "corrected" back to
`#ff6b01`. Orange stays fine as a filled-button background with near-black text on it, and fine as link
text on the dark background (6.9:1). Verify no component reintroduces orange text on a light surface.

---

## Business Rules

**BR1.** The theme control's accessible name and the announced current selection must not rely on
colour alone — screen-reader users must be able to tell Light/Dark/System apart and know which is
active.

**BR2.** The shell continues to expose exactly one `navigation` landmark and exactly one `main`
landmark, and the Animals/Habitats nav links keep their exact accessible names and `aria-current="page"`
behaviour — pinned by epic 1's Playwright specs and not to be altered by this epic.

**BR3.** No sign-in, account, or profile affordance may be introduced anywhere, including by the theme
control itself — epic 1's story 2 spec asserts none exists, and a theme control is not an identity
control.

**BR4.** Toast variants keep their existing role contract: `error` → `role="alert"`; every other variant
(`success`, etc.) → `role="status"`. Re-skinning onto tokens (R7) must not change this.

**BR5.** Orange (`#ff6b01`) must never appear as text or icon colour on a light/cream surface — only
`--color-brand-primary-dark` (`#ad4800`) or the ink neutral are used for that purpose on light. The
destructive colour is never the brand orange in either theme (light destructive is `#c93a3e`).

**BR6.** The theme preference is stored in the browser only (e.g. `localStorage`) — there is no
per-user or server-side persistence, no login, and no session in this project (project.md
§Authentication). A different browser or a cleared storage returns to R2's OS-driven default.

**BR7.** No hex literals may appear in any component file (`.claude/policies/styling-centralisation.md`)
— light and dark are both expressed purely through the existing token set and the `.dark` class swap on
`<html>`; the toggle must not introduce a second, parallel colour system.

**BR8.** Only weights 400 and 500 are used, in both themes — the brand uses no bold — and in-app
headings continue to render at the smaller end of the type scale (`--text-h3`/`--text-h4`), matching
epic 1's convention. This epic does not change type scale or weight usage; it only proves it in light.

---

## Key Workflows

1. **First visit, no stored preference, OS is dark.** Page loads → before first paint, the theme script
   reads no stored value → falls back to `prefers-color-scheme: dark` → `.dark` class applied → app
   renders dark, matching the brand default, with no flash.
2. **First visit, no stored preference, OS is light.** Same as above, but the OS asks for light → the
   pre-paint script applies light (no `.dark` class) → the app must not silently override this back to
   dark.
3. **Explicit choice: Light.** User opens the nav theme control → picks Light → theme applies
   immediately, `ThemePreference` is stored as `"light"` → a later visit (any OS setting) still opens
   in light, because an explicit choice was made.
4. **Explicit choice: Dark.** Symmetric to workflow 3.
5. **Explicit choice: System.** User picks System → any previously stored explicit choice is cleared →
   the app now tracks `prefers-color-scheme` live: if the OS setting changes while the tab is open (e.g.
   OS switches to dark at sunset), the app follows without a reload.
6. **Keyboard/screen-reader use of the control.** User tabs to the theme control, operates it via
   keyboard alone, and a screen reader announces its name and which of Light/Dark/System is currently
   active.
7. **Light-mode screen walkthrough.** With light active, each of the roster, animal detail, habitats
   list, add form, edit form, and remove-confirmation dialog is visually checked and any washed-out or
   illegible spot is fixed against the existing tokens.
8. **Light-mode state walkthrough.** With light active, each of loading, empty (animals/habitats/filtered
   "no matches"), failed-to-load + Retry, duplicate-name warning, technical-failure message, not-found,
   and both toast variants is checked and fixed.
9. **Accessibility scan in both themes.** The epic's axe baseline runs once with `colorScheme: 'dark'`
   and once with `colorScheme: 'light'` (Playwright's `colorScheme` option), catching any orange-on-cream
   or other contrast regression before merge.

---

## Feature NFRs

- **NFR-1 (no-flash-of-wrong-theme):** the theme class on `<html>` must be resolved and applied before
  the first paint, via a script that runs ahead of React hydration — not a `useEffect`. This is the
  epic's sharpest technical constraint; a hydration-timed fix is a defect, not an acceptable delay.
- **NFR-2 (live system tracking):** while `ThemePreference` is `"system"`, a change to the OS's
  `prefers-color-scheme` must be reflected in the running app without a reload, via a media-query
  change listener.
- **NFR-3 (contrast in both themes):** the automated accessibility scan (axe, epic 1's story 2 baseline)
  runs against both `colorScheme: 'dark'` and `colorScheme: 'light'` and must pass AA in both, with
  particular attention to orange-on-cream text (R8/BR5).
- **NFR-4 (control discoverability):** the theme control is reachable from every screen in the app,
  because it lives in the shared `AppNav.tsx` shell rather than a per-page element.
- **NFR-5 (no regression to epic 1's pinned contracts):** the 97 Vitest tests and 9 Playwright specs
  from epic 1 keep passing unmodified in intent — landmark counts, nav link names, `aria-current`,
  toast roles, and the "no sign-in affordance" assertion are treated as regressions if broken, not as
  tests to be loosened.

---

## Out of Scope

- Any per-user or server-side persistence of the theme preference — there is no login and no user
  store in this project (BR6).
- Any change to the brand palette itself, or to the font substitution scheme (Inter / Space Grotesk /
  Roboto Mono stay as-is).
- Additional themes beyond light and dark — no high-contrast mode, no custom accent picking.
- Re-designing any screen. This epic makes the existing screens correct in light; it does not change
  their layout, wording, or behaviour.
- Any change to the animal/habitat functionality or the backend integration delivered in epic 1.

---

## Notes & Caveats

- **`web/src/app/layout.tsx` currently hardcodes `className="dark"` on `<html>`.** This is the exact
  line R3 makes dynamic; the pre-paint script becomes the sole owner of that class, and
  `suppressHydrationWarning` is expected on `<html>` because the server cannot know the browser's stored
  choice.
- **Toast styling debt (epic 1, recorded in `generated-docs/architecture.md` §Cross-epic debt):**
  `Toast.tsx`/`ToastContainer.tsx` use raw Tailwind palette classes instead of tokens. R7 closes this
  debt as part of making light mode correct — re-skin onto the existing token set; do not add a second
  notification system, and do not change the `role="alert"`/`role="status"` contract (BR4).
- **Hard contrast rule carried from project.md:** orange `#ff6b01` on cream `#fff9ec` = 2.7:1, fails AA.
  `--primary` under `:root` already resolves to the safe `#ad4800` for this reason — this is a
  deliberate, previously-reviewed choice, not a bug to "fix" back to `#ff6b01`. Light status colours
  (`--destructive: #c93a3e`, `--success: #4d7c22`, `--warning: #8a6d1a`) already exist in
  `design-tokens.css` for the same reason — they are darker than their dark-theme counterparts because
  they sit on cream. None of these need re-deriving; the work is applying and verifying them, not
  choosing them.
- **Token wiring:** tokens flow through `@theme` / `@theme inline` in `web/src/app/globals.css`, which
  imports `web/src/styles/design-tokens.css`. Dark is the `.dark` class on `<html>`; light is the bare
  `:root` values already present. Switching themes is a class swap — no token duplication is needed for
  this epic.
- **Testing the OS-driven behaviour:** Playwright's `colorScheme` option emulates the OS setting and
  should be used both for the follow-the-system workflows (5, and first-visit workflows 1–2) and for the
  light-theme accessibility scan (workflow 9) — no manual OS switching is required to test this epic.
- **Shadcn primitives:** `button`, `card`, `input`, `label`, `table`, `skeleton`, `alert`, `form`,
  `select`, `alert-dialog` already exist from epic 1. This epic's icon-based theme control likely needs
  `dropdown-menu` (or `toggle-group`) added via the Shadcn CLI (Critical Rule 1) — remember the CLI's
  output is not Prettier-formatted and the lint gate includes a format check, so run
  `prettier --write` on generated files before committing.
- **`web/src/components/layout/AppShell.tsx` / `AppNav.tsx`** are the exact files that own today's
  single `navigation`/`main` landmarks and the Animals/Habitats links (BR2) — the theme control is added
  to `AppNav.tsx`'s existing markup, not a new competing nav element.
