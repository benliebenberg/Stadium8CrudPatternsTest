# Story 1 — The right theme before the page appears

- **Epic:** `theme-switching` (Light and Dark Themes)
- **Slug:** `story-1-theme-before-first-paint`
- **Route:** `/`
- **Target file:** `web/src/app/layout.tsx`
- **Page action:** `modify_existing`
- **Roles:** All Users
- **Infrastructure only:** `false`
- **Requirement IDs:** R2, R3, BR2, BR6, BR7, NFR-1, NFR-2, NFR-5

> **Carries the epic's shared-surface baseline** — `epicIntroducesSharedSurface` is `true` and this
> story's target file is the shared `layout.tsx`. The baseline covers the landmark counts and the
> nav-link invariants. It does **not** carry the light-theme axe scan: light is still unfixed at this
> point, so a both-themes scan here would be red until story 5 lands. That scan rides **story 5**.

## Plain summary

The app works out which theme to show — Light or Dark — before anything is drawn, so you never see a
flash of the wrong one. With no choice made in the app yet, it follows your computer's own light/dark
setting and keeps following it live if you change it.

## Technical summary

Replace the hardcoded `className="dark"` on `<html>` in `layout.tsx` with a small **inline script that
runs ahead of hydration**: it reads the stored theme preference, falls back to `prefers-color-scheme`
when absent or unreadable, and sets the `.dark` class **before first paint**. Add
`suppressHydrationWarning` to `<html>` — the server cannot know the browser's stored choice.

> **`suppressHydrationWarning` is required but not assertable.** React treats it as a reserved prop and
> never writes it to the DOM (verified in React's `setProp`); `renderToString` strips it too. So it must
> be added, but no test at any layer can hold you to it — it is a **code-review** item. Do not write a
> test that appears to check it; such a test can never fail. See `architecture.md` § Decision 4.

Add the shared theme state plus a `prefers-color-scheme` change listener so a system-following app
tracks OS changes with no reload.

**No React effect owns the initial class.** That is the whole point of this story.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | With no theme ever chosen in the app, the app opens in light when the computer is set to light and in dark when it is set to dark. | playwright |
| AC-2 | The page is already in the correct theme when it first appears — the theme is never switched after the page is visible, on a first load or a reload. | playwright |
| AC-3 | A theme already chosen for this browser is used on a later visit even when the computer's setting says the opposite. | playwright |
| AC-4 | While the app is following the computer's setting, changing that setting with the app open switches the app immediately, with no reload. | playwright |
| AC-5 | The app still exposes exactly one navigation area and one main content area, and the Animals and Habitats links keep their names and their "you are here" marking, in either theme. | vitest |
| AC-6 | Clearing this browser's stored data returns the app to following the computer's setting rather than forcing dark. | playwright |

## Manual test checklist

- ☐ Set your computer to light, clear the site's stored data, open the app → it opens light, not dark
- ☐ Set your computer to dark and reload → it opens dark
- ☐ Reload several times watching closely → you never see a flash of the wrong theme before the page settles
- ☐ With no theme chosen in the app, change your computer's light/dark setting while the tab is open → the app follows straight away, without a reload
- ☐ Clear the site's stored data again → the app goes back to following your computer's setting
- ☐ Walk the roster, an animal's detail, the habitats list and the add form → everything behaves exactly as it did before

## Notes

- `layout.tsx:40` is the exact line to change: ``className={`dark ${inter.variable} ${spaceGrotesk.variable} ${robotoMono.variable}`}``.
  **Keep the three `next/font` variable classes** and the `ToastProvider` / `AppShell` /
  `ToastContainer` structure intact.
- **A `useEffect` implementation fails four of the six ACs.** The stored choice lives in the browser, so
  a post-hydration write means a visible dark→light flash on every load.
- Storage access can throw (private browsing, blocked storage) — the script must fall back to
  `prefers-color-scheme` rather than crashing the page.
- Playwright emulates the OS setting via `colorScheme: 'light' | 'dark'` (`test.use` / `newContext`) —
  that's how AC-1, AC-4 and AC-6 are exercised. No manual OS switching in tests.
- `AppShell.tsx` is a server component and `AppNav.tsx` a client component — keep that split. Only the
  control (story 2) needs client state.
- No visible control is built here. That arrives in story 2.
