/**
 * Per-epic baseline — Epic `theme-switching`.
 *
 * Cross-story invariants of the shared app shell, asserted ONCE here instead of being
 * re-asserted by every story's test file. Created with story 1 because story 1 is the
 * story that edits the shared surface (`epicIntroducesSharedSurface: true`; its target
 * file is `web/src/app/layout.tsx`).
 *
 * This is the epic's single `vitest`-tagged criterion, AC-5:
 *
 *   "The app still exposes exactly one navigation area and one main content area, and the
 *    Animals and Habitats links keep their names and their 'you are here' marking, in
 *    either theme."
 *
 * It is a **regression pin on an inherited surface**. Epic 1 built `AppShell.tsx` /
 * `AppNav.tsx`; this epic rewrites `layout.tsx`'s `<html>` element (story 1) and adds a
 * theme control into `AppNav.tsx`'s existing markup (story 2), then re-skins components
 * for light (stories 3–5). Every one of those edits can break the landmarks or the section
 * links, so the contract belongs to the epic rather than to any one story.
 *
 * Scope, deliberately narrow:
 * - Exactly ONE `navigation` landmark and exactly ONE `main` landmark in the composed shell.
 * - The section nav offers exactly the two links `Animals` and `Habitats`, by those exact
 *   accessible names, pointing at the routes they own.
 * - `aria-current="page"` marks the current section and only the current section, on both
 *   the roster route and the habitats route.
 *
 * NOT here, on purpose:
 * - **Colours, hex values, computed styles or the `.dark` class itself.** Forbidden by
 *   `.claude/policies/styling-centralisation.md`, and jsdom applies no stylesheet, so a
 *   colour assertion here would be both against policy and meaningless. AC-5's "in either
 *   theme" is honoured by asserting nothing that varies with the theme: these landmarks and
 *   names are theme-independent by construction. The theme's visual effect is verified by
 *   story 5's dual-`colorScheme` `@axe-core/playwright` scan and by eye at MANUAL-TEST.
 * - The OS-following / no-flash / stored-preference behaviour (AC-1, AC-2, AC-3, AC-4,
 *   AC-6) — all `playwright`-tagged, because they need a real browser, a real reload and
 *   Playwright's `colorScheme` emulation. jsdom has no working `matchMedia` and no paint.
 * - The theme control's own name, options and announced selection (story 2's ACs).
 * - `main`-wraps-the-page and the toast channel staying mounted — already pinned by
 *   `epic-zoo-animal-manager-baseline.test.tsx`, which renders this same composition. The
 *   one-line `main` count below is the AC-5 half of the pair and is the only overlap.
 *
 * Later stories in this epic must NOT re-assert these — extend this file only if they
 * introduce a genuinely new shared surface.
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RootLayout from '@/app/layout';
import { ANIMALS_ROUTE, HABITATS_ROUTE } from '@/lib/routes';

/**
 * The pathname the shell reads to decide which section is current. Held in a hoisted
 * object so a test can move the app to another route before rendering — `vi.mock` factories
 * are hoisted above the imports, so they can only close over a `vi.hoisted` value.
 */
const navState = vi.hoisted(() => ({ pathname: '/' }));

/**
 * The App Router hooks: the shell marks the current section from the path, and jsdom has
 * no router context to read — `usePathname()` outside a router throws.
 */
vi.mock('next/navigation', () => ({
  usePathname: () => navState.pathname,
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
 * throws when imported by a test runner. `layout.tsx` loads Inter, Space Grotesk and
 * Roboto Mono through it, so the layout stays importable here. Each stub echoes back the
 * CSS variable it was asked for, which is what the story-1 test file inspects.
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

/** The two sections this app has. Their accessible names are user-visible copy (BR2). */
const ANIMALS_LINK_NAME = 'Animals';
const HABITATS_LINK_NAME = 'Habitats';

/**
 * Composing the root layout in jsdom logs "In HTML, <html> cannot be a child of <div>" —
 * expected noise from rendering a document-level component into a test container, not a
 * defect. Asserting on the layout+shell composition is the only way to catch a landmark
 * that the theme rework duplicated or moved.
 */
function renderShellAroundAPage(): void {
  render(
    <RootLayout>
      <p>{PAGE_SLOT_CONTENT}</p>
    </RootLayout>,
  );
}

describe('Epic theme-switching: shared app shell baseline', () => {
  beforeEach(() => {
    navState.pathname = ANIMALS_ROUTE;
  });

  // AC-5
  it('exposes exactly one navigation landmark and exactly one main landmark', () => {
    renderShellAroundAPage();

    // One `navigation`, not two: story 2's theme control goes INTO the existing nav's
    // markup, never into a second competing nav element.
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    // One `main`: the shell owns the landmark and the reworked layout adds none of its own.
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  // AC-5
  it('offers exactly the Animals and Habitats section links, by those exact names', () => {
    renderShellAroundAPage();

    const sectionNav = screen.getByRole('navigation');

    // Exactly two links: the theme control is a control, not a third section — and BR3
    // forbids any sign-in / account / profile affordance appearing here.
    expect(within(sectionNav).getAllByRole('link')).toHaveLength(2);

    // String names match the whole accessible name, so this pins the exact wording epic
    // 1's Playwright specs also assert — a rename is a regression, not a refactor.
    expect(
      within(sectionNav).getByRole('link', { name: ANIMALS_LINK_NAME }),
    ).toHaveAttribute('href', ANIMALS_ROUTE);
    expect(
      within(sectionNav).getByRole('link', { name: HABITATS_LINK_NAME }),
    ).toHaveAttribute('href', HABITATS_ROUTE);
  });

  // AC-5
  it('marks Animals as the current section on the roster route, and only Animals', () => {
    navState.pathname = ANIMALS_ROUTE;

    renderShellAroundAPage();

    const sectionNav = screen.getByRole('navigation');

    // `aria-current="page"` is what actually tells assistive technology "you are here";
    // the background tint is the sighted equivalent, not the signal (BR1/BR2).
    expect(
      within(sectionNav).getByRole('link', { name: ANIMALS_LINK_NAME }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(sectionNav).getByRole('link', { name: HABITATS_LINK_NAME }),
    ).not.toHaveAttribute('aria-current');
  });

  // AC-5
  it('marks Habitats as the current section on the habitats route, and only Habitats', () => {
    navState.pathname = HABITATS_ROUTE;

    renderShellAroundAPage();

    const sectionNav = screen.getByRole('navigation');

    expect(
      within(sectionNav).getByRole('link', { name: HABITATS_LINK_NAME }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(sectionNav).getByRole('link', { name: ANIMALS_LINK_NAME }),
    ).not.toHaveAttribute('aria-current');
  });
});
