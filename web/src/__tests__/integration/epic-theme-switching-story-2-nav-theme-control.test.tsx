/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/components/layout/AppNav.tsx
 * - Page Action: modify_existing
 *
 * Epic `theme-switching`, Story 2 — the Light / Dark / System control in the nav bar.
 *
 * The Playwright spec owns everything that needs a real browser: the theme actually
 * changing on screen (AC-1), surviving a reload (AC-2), System handing control back to
 * `prefers-color-scheme` live (AC-3), and keyboard-only operation (AC-5). This file owns
 * the two jsdom-observable criteria — the control's *semantics* (AC-4) and the promise
 * that it smuggles in no identity affordance and disturbs no existing nav link (AC-6).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THESE TESTS PIN — the Playwright spec must agree with it verbatim
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * 1. **The trigger is a single `button` whose accessible name contains "theme"**
 *    (`Theme` is the obvious choice; `Change theme` / `Theme: Dark` also satisfy it).
 *    R4 asks for an *icon* control, so the icon carries no name of its own — the button
 *    must be named by `aria-label` (or visually-hidden text). An icon-only button with
 *    no accessible name is exactly the BR1 failure.
 *    It lives **inside the existing `<nav aria-label="Sections">`** and is the only
 *    `button` in it: the two sections stay links, the theme control joins them.
 *
 * 2. **Opening it reveals exactly three options**, whose accessible names contain the
 *    words `Light`, `Dark` and `System` respectively. Wording around them is free
 *    ("Follow system" is fine); a swatch or an icon with no word is not — BR1 forbids
 *    conveying the choice by colour alone.
 *
 * 3. **Exactly one option marks itself as the active one, in semantics rather than
 *    colour** (AC-4, BR1). Any of these satisfies it:
 *      - `aria-checked="true"` — what Shadcn's `DropdownMenuRadioGroup` +
 *        `DropdownMenuRadioItem` give you for free, and the expected implementation;
 *      - `aria-current` (any value but `"false"`) or `aria-selected="true"`;
 *      - the option's own text saying so ("Current", "Selected", "Active").
 *    A highlight, a tint, or a bare `<Check/>` icon with no ARIA state does **not**
 *    satisfy it: a decorative SVG is invisible to a screen reader, which is the whole
 *    point of AC-4. Note the flip side of the text route — the words *current* /
 *    *selected* / *active* must NOT appear in the two inactive options' text, or they
 *    read as active too.
 *
 * 4. **`localStorage` is the only store** (BR6) and this file clears it between tests,
 *    so the control must tolerate an empty store — with nothing stored the preference is
 *    `"system"` (R2). Which option is marked in that state is deliberately NOT asserted
 *    here (marking `System`, the preference, and marking the resolved theme are both
 *    defensible); what *is* asserted is that exactly one is marked, and that after an
 *    explicit choice of Dark the marking is on **Dark**.
 *
 * 5. **Rendered through `RootLayout`**, not `AppNav` in isolation — deliberately, so this
 *    file is agnostic about *how* story 1 exposes the shared theme state. A `ThemeProvider`
 *    mounted in `layout.tsx` and a provider-free `useTheme()` hook both satisfy these
 *    tests; a control that needs a provider it cannot find would not.
 *
 * 6. **No colour, hex, class or computed-style assertion appears below.** The theme class
 *    swap on `<html>` is story 1's business and the visible result is the Playwright
 *    spec's; here the contract is purely semantic.
 *
 * NOT here (and must not be duplicated): the landmark counts and `aria-current="page"`
 * marking (story 1's AC-5 and epic 1's pinned specs), and the accessibility scan (a
 * real-browser `@axe-core/playwright` scan — epic 1's story 2 baseline, extended to both
 * themes by this epic's story 5).
 *
 * These tests FAIL until story 2 is implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import RootLayout from '@/app/layout';

/**
 * The app-router hooks: `AppNav` reads the current path to mark the current section, and
 * jsdom has no router context to read it from.
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
 * throws when a test runner imports it. The root layout loads all three brand fonts
 * through it, so it is stubbed to keep the layout importable (same stub as epic 1's
 * baseline file).
 */
vi.mock('next/font/google', () => {
  const font = () => ({
    className: 'font-stub',
    variable: '--font-stub',
    style: { fontFamily: 'font-stub' },
  });
  return { Inter: font, Space_Grotesk: font, Roboto_Mono: font };
});

/** The theme control's trigger — an icon button that must still carry a name (see 1). */
const THEME_CONTROL_NAME = /theme/i;

/** The three choices, as the option-name words this file recognises (see 2). */
const THEME_CHOICES = ['dark', 'light', 'system'] as const;

/**
 * Any affordance implying a sign-in / sign-out / account / profile surface. This project
 * has none — no login, no user store, no session (project.md §Authentication, brief BR3)
 * — and epic 1's story-2 spec asserts that absence, so a theme control that quietly adds
 * an "Account" entry to a menu would break a pinned contract. Same expression epic 1 uses.
 */
const AUTH_AFFORDANCE =
  /sign[\s-]?(in|out|up)|log[\s-]?(in|out)|account|profile/i;

/**
 * Wording that claims "this is the one in force". Only consulted when the option carries
 * no ARIA state at all — see contract point 3.
 */
const ACTIVE_IN_WORDS = /\b(current|currently|selected|active|in use)\b/i;

type UserEventInstance = ReturnType<typeof userEvent.setup>;

function renderShell() {
  return render(
    <RootLayout>
      <p>a page rendered into the shell</p>
    </RootLayout>,
  );
}

/**
 * A `DropdownMenuRadioGroup` exposes its choices as `menuitemradio`; plain
 * `DropdownMenuItem`s expose them as `menuitem`. Both are legitimate implementations, so
 * probe for the narrower one first — never a `||` chain, whose right-hand side would be
 * unreachable.
 */
function optionRole(): 'menuitemradio' | 'menuitem' {
  return screen.queryAllByRole('menuitemradio').length > 0
    ? 'menuitemradio'
    : 'menuitem';
}

/** Every choice the open control offers, in the order it offers them. */
function themeOptions(): HTMLElement[] {
  return screen.getAllByRole(optionRole());
}

function themeOption(name: RegExp): HTMLElement {
  return screen.getByRole(optionRole(), { name });
}

/**
 * Which of the three an option is, read from its own words. Robust to extra marking text
 * ("Dark  Current") and to surrounding wording ("Follow system"), and it names the
 * failure when an option is worded so that none of the three words appears — which is
 * itself an AC-4 failure, not a test bug.
 */
function themeOf(option: HTMLElement): string {
  const text = option.textContent ?? '';

  if (/\bsystem\b/i.test(text)) return 'system';
  if (/\bdark\b/i.test(text)) return 'dark';
  if (/\blight\b/i.test(text)) return 'light';

  return `an option naming none of Light/Dark/System: "${text.trim()}"`;
}

/** Does this option say — in semantics or in words, never in colour — that it is active? */
function marksItselfActive(option: HTMLElement): boolean {
  if (option.getAttribute('aria-checked') === 'true') return true;
  if (option.getAttribute('aria-selected') === 'true') return true;

  const ariaCurrent = option.getAttribute('aria-current');
  if (ariaCurrent !== null && ariaCurrent !== 'false') return true;

  return ACTIVE_IN_WORDS.test(option.textContent ?? '');
}

function activeThemeChoices(): string[] {
  return themeOptions().filter(marksItselfActive).map(themeOf);
}

async function openThemeControl(user: UserEventInstance): Promise<void> {
  await user.click(screen.getByRole('button', { name: THEME_CONTROL_NAME }));

  // Waiting for all three doubles as the "three choices are offered" wait: an open menu
  // with two options never settles, and the failure names the count it saw.
  await waitFor(() => {
    expect(themeOptions()).toHaveLength(THEME_CHOICES.length);
  });
}

/**
 * Taking a choice closes the menu (Radix's default, and the behaviour a menu is expected
 * to have). Waiting for that before reopening keeps the reopen click from being read as a
 * close click. `hidden: true` so this tracks real removal rather than the `aria-hidden`
 * a modal dropdown puts over the rest of the page while it is open.
 */
async function waitForControlToClose(): Promise<void> {
  await waitFor(() => {
    expect(
      screen.queryAllByRole('menuitemradio', { hidden: true }),
    ).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { hidden: true })).toHaveLength(0);
  });
}

/**
 * Nothing anywhere on the shell — closed chrome or open menu — may look like an identity
 * control. `hidden: true` deliberately looks past the `aria-hidden` a modal dropdown
 * applies to the rest of the page, so an offending control cannot escape by being behind
 * the open menu.
 */
function expectNoAuthAffordance(): void {
  const roles = [
    'link',
    'button',
    'menuitem',
    'menuitemradio',
    'menuitemcheckbox',
  ] as const;

  for (const role of roles) {
    expect(
      screen.queryAllByRole(role, { name: AUTH_AFFORDANCE, hidden: true }),
    ).toHaveLength(0);
  }

  // Non-interactive copy too: a menu heading reading "Account" would be just as wrong as
  // a button.
  expect(screen.queryAllByText(AUTH_AFFORDANCE)).toHaveLength(0);
}

describe('Epic theme-switching, Story 2: Light / Dark / System control in the nav bar', () => {
  beforeAll(() => {
    // Missing-browser-API shims, not stubs of anything under test.
    //
    // jsdom implements neither pointer capture, `Element.scrollIntoView` nor
    // `ResizeObserver`, and Radix's dropdown-menu (what Shadcn's `dropdown-menu` wraps)
    // uses all of them the moment its content opens — the same set epic 1's `select` and
    // `alert-dialog` tests shim.
    const element = window.Element.prototype as unknown as Record<
      string,
      unknown
    >;
    element.hasPointerCapture ??= () => false;
    element.setPointerCapture ??= () => undefined;
    element.releasePointerCapture ??= () => undefined;
    element.scrollIntoView ??= () => undefined;

    if (!('ResizeObserver' in globalThis)) {
      class ResizeObserverShim implements ResizeObserver {
        observe(): void {
          return undefined;
        }
        unobserve(): void {
          return undefined;
        }
        disconnect(): void {
          return undefined;
        }
      }
      (
        globalThis as { ResizeObserver?: typeof ResizeObserver }
      ).ResizeObserver = ResizeObserverShim;
    }

    // jsdom has no `matchMedia` at all, and story 1's theme state reads
    // `prefers-color-scheme` through it — without this the shell throws on render. It
    // reports "no preference expressed" (`matches: false`) and never fires a change:
    // OS-driven switching is Playwright's job via its `colorScheme` option, so nothing
    // here depends on what this returns.
    const view = window as unknown as Record<string, unknown>;
    view.matchMedia ??= (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    });
  });

  beforeEach(() => {
    // A preference stored by one test must not decide the next test's starting state
    // (BR6 — the browser is the only store).
    window.localStorage.clear();
    // The theme class is applied to `<html>`, which outlives a render; drop it so each
    // test starts from the same place. Cleanup only — nothing below asserts on it.
    document.documentElement.classList.remove('dark');
  });

  // AC-4 — the accessible name, the three named choices, and "which one is active" told
  // in semantics rather than colour.
  it('names the control, offers Light, Dark and System, and says in words which one is active', async () => {
    const user = userEvent.setup();
    renderShell();

    // An icon control still has to introduce itself.
    expect(
      screen.getByRole('button', { name: THEME_CONTROL_NAME }),
    ).toBeVisible();

    await openThemeControl(user);

    // Three choices, each identified by a word. A colour swatch per choice would leave
    // `themeOf` unable to name it and fail here — which is the point of BR1.
    expect([...themeOptions().map(themeOf)].sort()).toEqual([...THEME_CHOICES]);

    // Exactly one claims to be in force. Which one, with nothing stored, is left open
    // (see contract point 4) — that one *and only one* does is the invariant.
    expect(activeThemeChoices()).toHaveLength(1);

    // After an explicit choice the claim must be accurate and must have moved: a control
    // that reads its state once at mount, or marks by highlight alone, fails here.
    await user.click(themeOption(/dark/i));
    await waitForControlToClose();
    await openThemeControl(user);

    expect(activeThemeChoices()).toEqual(['dark']);
  });

  // AC-6 — the control introduces no identity affordance, and the sections beside it are
  // untouched.
  it('adds no sign-in, sign-out, account or profile affordance, and leaves the Animals and Habitats links exactly as they were', async () => {
    const user = userEvent.setup();
    renderShell();

    // The control joins the existing navigation landmark rather than adding a second one
    // (BR2 — pinned by epic 1's specs).
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    const nav = screen.getByRole('navigation');

    // The two sections, by their exact accessible names, and nothing else linked beside
    // them. A string `name` is matched in full, so a renamed or decorated link fails.
    expect(within(nav).getByRole('link', { name: 'Animals' })).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Habitats' })).toBeVisible();
    expect(within(nav).getAllByRole('link')).toHaveLength(2);

    // The theme control is the one thing that joined them, and it is in this nav — not
    // floated somewhere else in the header (NFR-4: one control, reachable from every
    // screen because it lives in the shared shell).
    expect(within(nav).getAllByRole('button')).toHaveLength(1);
    expect(
      within(nav).getByRole('button', { name: THEME_CONTROL_NAME }),
    ).toBeVisible();

    // Nothing on the closed shell resembles an identity control...
    expectNoAuthAffordance();

    // ...nor inside the control once open, which is the new surface this story adds and
    // the one epic 1's spec could not have checked.
    await openThemeControl(user);
    expectNoAuthAffordance();

    // And the menu is not a second navigation landmark. `hidden: true` because a modal
    // dropdown marks the rest of the page `aria-hidden` while it is open.
    expect(screen.getAllByRole('navigation', { hidden: true })).toHaveLength(1);
  });
});
