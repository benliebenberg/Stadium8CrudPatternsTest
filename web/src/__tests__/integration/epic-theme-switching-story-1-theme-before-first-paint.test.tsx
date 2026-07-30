/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/layout.tsx
 * - Page Action: modify_existing
 *
 * Epic `theme-switching`, Story 1 — the right theme before the page appears.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS LAYER CAN AND CANNOT PROVE, AND WHY
 * ─────────────────────────────────────────────────────────────────────────────────
 * Story 1's actual behaviour — resolve the stored preference, fall back to
 * `prefers-color-scheme`, set the theme class BEFORE first paint, then track OS changes
 * live — is not observable in jsdom, and the planner tagged it accordingly:
 *
 * - AC-1 / AC-2 / AC-3 / AC-4 / AC-6 are `playwright`-tagged. They need a real browser,
 *   a real reload, real `localStorage` across that reload, and Playwright's `colorScheme`
 *   emulation of the OS setting. jsdom has no paint (so "no flash" is unobservable) and no
 *   working `matchMedia` (it answers `matches: false` to every query, so an OS-following
 *   test here would only be testing a stub).
 * - The pre-paint script itself cannot be exercised here either: React writes an inline
 *   `<script>` body through `innerHTML`, and jsdom never executes script content inserted
 *   that way. Asserting the script's source text would pin an implementation string, not a
 *   behaviour.
 * - AC-5 is the one `vitest`-tagged criterion. Its epic-wide half — the landmark counts and
 *   the Animals/Habitats link names and `aria-current` — lives in
 *   `epic-theme-switching-baseline.test.tsx` so stories 2–5 do not each re-assert it.
 *
 * What is left for THIS file is AC-5's `layout.tsx` half: the things that live on the exact
 * lines story 1 rewrites, and that a careless rewrite of the `<html>` element silently drops.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THIS FILE PINS — implement `web/src/app/layout.tsx` to it
 * ─────────────────────────────────────────────────────────────────────────────────
 * 1. `<html>` keeps `lang="en"`. It is the element being rewritten, and a missing `lang`
 *    is a WCAG failure that story 5's axe scan would report as a regression of this story.
 * 2. `<html>` still carries all three `next/font` variable classes —
 *    `inter.variable`, `spaceGrotesk.variable`, `robotoMono.variable`. They are the only
 *    thing that makes `--font-inter` / `--font-space-grotesk` / `--font-roboto-mono`
 *    resolvable, and `web/src/styles/design-tokens.css` builds `--font-primary`,
 *    `--font-secondary` and `--font-mono` on top of them. Drop one and the whole app
 *    silently falls back to a system face, in both themes.
 * 3. The shell composition is unchanged: the page's content renders inside the single
 *    `main`, and the section navigation stays OUTSIDE it, in the header. (Landmark *counts*
 *    are the baseline file's job; that the nav is a sibling of `main` rather than inside it
 *    is not caught by any count, so it is pinned here.)
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * NOT ASSERTED HERE, DELIBERATELY
 * ─────────────────────────────────────────────────────────────────────────────────
 * - **No colours, hex values, computed styles, or `.dark` as a fixed expectation.**
 *   `.claude/policies/styling-centralisation.md` forbids the first three, and pinning
 *   `class="dark"` would encode "this app is permanently dark" — the exact assumption this
 *   epic exists to remove. Whether the class is present is a function of the resolved
 *   preference, which only the browser can decide; that is AC-1/AC-3/AC-6's job in
 *   Playwright.
 * - **`suppressHydrationWarning`.** The story asks for it on `<html>` and the developer must
 *   add it (R3), but React treats it as a reserved prop and never writes it to the DOM in
 *   either a client render or `renderToString` — so no DOM-level assertion of it is possible
 *   at any layer. It is a code-review / `/code-review` item, not a testable attribute.
 *
 * NOTE ON TDD RED: AC-5 is a **non-regression** criterion — "the app *still* exposes…",
 * "the links *keep* their names". It is true before the change and must stay true after, so
 * this file and the baseline file are green before implementation by design. That is
 * correct for a regression pin: the failure they exist to catch is a story-1 (or 2–5) edit
 * that breaks the inherited shell. Story 1's own new behaviour has its red phase in
 * `web/e2e/epic-theme-switching-story-1-theme-before-first-paint.spec.ts`.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import RootLayout from '@/app/layout';

/**
 * The App Router hooks: the shell marks the current section from the path, and jsdom has
 * no router context to read — `usePathname()` outside a router throws.
 */
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * `next/font/google` is a build-time loader — it only works inside Next's compiler and
 * throws when imported by a test runner. Each stub echoes back the CSS variable name it was
 * asked for as its `variable` class, so what `layout.tsx` puts on `<html>` becomes visible
 * to the assertions below. (Real `next/font` returns a generated class here; the echo is a
 * stand-in that keeps the *wiring* checkable without depending on a hashed class name.)
 */
vi.mock('next/font/google', () => {
  const loader = (options: { readonly variable?: string }) => {
    const variable = options.variable ?? '--font-unrequested';
    return {
      className: 'font-stub',
      variable,
      style: { fontFamily: variable },
    };
  };
  return { Inter: loader, Space_Grotesk: loader, Roboto_Mono: loader };
});

const PAGE_SLOT_CONTENT = 'a page rendered into the shell';

/**
 * The three CSS variables `design-tokens.css` resolves `--font-primary`, `--font-secondary`
 * and `--font-mono` against. This is a cross-file contract, not a styling choice: the names
 * are written in `design-tokens.css` and requested in `layout.tsx`, and the two must agree.
 */
const BRAND_FONT_VARIABLES = [
  '--font-inter',
  '--font-space-grotesk',
  '--font-roboto-mono',
] as const;

/**
 * Composing the root layout in jsdom logs "In HTML, <html> cannot be a child of <div>" —
 * expected noise from rendering a document-level component into a test container, not a
 * defect. It is also the only way to assert on the `<html>` element story 1 rewrites.
 */
function renderShellAroundAPage(): void {
  render(
    <RootLayout>
      <p>{PAGE_SLOT_CONTENT}</p>
    </RootLayout>,
  );
}

/** The `<html>` element the layout rendered — throws rather than returning null, so a test never asserts conditionally. */
function renderedHtmlElement(): HTMLElement {
  const htmlElement = screen.getByRole('main').closest('html');

  if (!(htmlElement instanceof HTMLElement)) {
    throw new Error('the layout rendered no <html> element around its shell');
  }

  return htmlElement;
}

describe('Epic theme-switching, Story 1: the right theme before the page appears', () => {
  // AC-5
  it('keeps the page language and all three brand font variables on <html> when the theme class stops being hardcoded', () => {
    renderShellAroundAPage();

    const htmlElement = renderedHtmlElement();

    expect(htmlElement).toHaveAttribute('lang', 'en');

    // Not a styling assertion — no colour, no visual claim. These classes are the wiring
    // that makes the three brand faces resolvable at all, and they sit on the single
    // expression story 1 replaces (`className={`dark ${inter.variable} …`}`), which is
    // exactly where they get dropped by accident.
    const htmlClasses = htmlElement.getAttribute('class') ?? '';
    for (const fontVariable of BRAND_FONT_VARIABLES) {
      expect(htmlClasses).toContain(fontVariable);
    }
  });

  // AC-5
  it('renders the page inside the single main landmark, with the section navigation outside it', () => {
    renderShellAroundAPage();

    const mainLandmark = screen.getByRole('main');

    // The page's own content belongs to `main`…
    expect(
      within(mainLandmark).getByText(PAGE_SLOT_CONTENT),
    ).toBeInTheDocument();
    // …and the section nav does not. A rework that nests the nav inside `main` keeps the
    // landmark counts at one apiece, so no count catches it — but it puts the sections
    // inside the page content for anyone navigating by landmark.
    expect(within(mainLandmark).queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
