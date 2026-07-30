/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/components/layout/AppNav.tsx
 * - Page Action: modify_existing
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never uses
 *   the real `API_KEY` (testing-policy.md § "Playwright runs against mocks, never live").
 * - Interception happens on the app's OWN route handlers — `/api/animals`, `/api/habitats` —
 *   through the shared helpers in `./fixtures/api-mocks` and their disjoint regexes. NEVER the
 *   Linx base URL (`http://localhost:10002/crud-patterns/**`), which is called from the Next.js
 *   server tier and is invisible to `page.route()` (architecture.md Decision 1, § Playwright spec
 *   conventions #4). {@link mockScreenReads} also installs `abortUnmatchedApiRequests` first, so
 *   any `/api/**` request these two helpers do not cover fails loudly instead of travelling on to
 *   the real backend.
 * - Response bodies come from the project-wide entity factories via that fixtures module, never
 *   hand-written inline, so this layer cannot drift from the Vitest layer.
 * - No auth chain: this project has no login, session or `userinfo` endpoint (project.md
 *   §Authentication, epic 1 BR15, conventions #6). No credential fixtures, no cookie clearing.
 * - No cookie or server-side storage assumptions: the theme preference is browser-only (BR6).
 * - Implementation patterns this spec REQUIRES (all of them from architecture.md § Decision 4 —
 *   The theme contract; none of them invented here):
 *   1. The applied class is `dark` on `<html>`, and **light is the ABSENCE of that class** —
 *      there is no `light` class. Every appearance assertion below is presence/absence of that
 *      one class; not one of them looks at a colour, a hex value or a computed style
 *      (`.claude/policies/styling-centralisation.md`).
 *   2. The stored preference is `localStorage['theme']` with the values `light` / `dark` only
 *      (see {@link THEME_STORAGE_KEY}). Production code must export a `THEME_STORAGE_KEY`
 *      constant; this spec pins the same string rather than importing it, because the module does
 *      not exist yet at generation time.
 *   3. **Choosing System CLEARS that key.** Absence of the key is how "follow the OS" is
 *      represented — there is no stored `system` string, and a stored one would be read by story
 *      1's pre-paint script as an explicit choice that is neither light nor dark.
 *   4. The OS source is `window.matchMedia('(prefers-color-scheme: dark)')`, listened to LIVE, so
 *      an OS change while the tab is open is handled without a reload (NFR-2). `page.emulateMedia`
 *      is how that is driven here.
 *   5. The control is a single `button` inside the EXISTING `<nav aria-label="Sections">`, named
 *      so that its accessible name matches `/theme/i`, and it is the only button in that nav (the
 *      two sections stay links — BR2, and pinned by epic 1's specs).
 *   6. Its options are named in words containing `Light`, `Dark` and `System`, and taking one
 *      CLOSES the menu. Whether they are `menuitemradio`s (Shadcn's `DropdownMenuRadioGroup`, the
 *      expected route) or plain `menuitem`s is deliberately not narrowed here — see
 *      {@link MENU_OPTION_SELECTOR}.
 *
 * E2E spec for Epic theme-switching, Story 2: Choose Light, Dark or System from the nav bar.
 *
 * Covers the four `playwright`-tagged criteria — AC-1, AC-2, AC-3, AC-5. AC-4 (the control's
 * accessible name and the semantic marking of the active option) and AC-6 (no sign-in / account /
 * profile affordance, and the Animals / Habitats links unchanged) are `vitest`-tagged and live in
 * `web/src/__tests__/integration/epic-theme-switching-story-2-nav-theme-control.test.tsx`. The
 * locators below deliberately agree with that file's pinned contract and add nothing to it: which
 * option MARKS itself active is asserted there, so here the options are only things to operate.
 *
 * This spec carries NO axe scan. Epic 1's story 2 spec owns the epic's dark-theme accessibility
 * baseline, and the both-themes scan (R8/NFR-3) rides story 5 — light is still unfixed at this
 * point, so a light scan here would be red for reasons this story does not own (architecture.md
 * § Playwright spec conventions #8, Decision 4 § Testing the theme).
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { expect, test } from '@playwright/test';

import type { Locator, Page } from '@playwright/test';

import {
  abortUnmatchedApiRequests,
  mockAnimals,
  mockHabitats,
} from './fixtures/api-mocks';

/**
 * Matches `dark` as a WHOLE class among the three `next/font` variable classes `<html>` also
 * carries. A bare `/dark/` would also match a font variable or a utility containing "dark".
 *
 * The same pattern story 1's spec uses, for the same reason: the mechanism (is the class there,
 * and did it change?) is what the theme contract is about — never a colour.
 */
const THEME_CLASS_PATTERN = /(?:^|\s)dark(?:\s|$)/;

/**
 * The `localStorage` key the control writes and story 1's pre-paint script reads, fixed by
 * architecture.md Decision 4. Values are `light` / `dark` only; the key's ABSENCE means "follow
 * the OS".
 *
 * Pinned as a literal rather than imported: production code must export this constant, but it does
 * not exist yet at generation time, and importing a missing module would stop this spec being
 * collected at all. Story 2's developer should point both layers at the exported constant.
 */
const THEME_STORAGE_KEY = 'theme';

/**
 * The open menu's choices, without narrowing WHICH menu-item role they use.
 *
 * The sibling Vitest file accepts either `menuitemradio` (what Shadcn's
 * `DropdownMenuRadioGroup` + `DropdownMenuRadioItem` give you, and the route Decision 4 expects)
 * or plain `menuitem`, because what AC-4 actually requires is that ONE option declares itself
 * active in semantics — an assertion that file owns. This spec only needs to *operate* the
 * options, so it matches either role rather than pinning a second, narrower contract that could
 * contradict its sibling. Not a fallback: one selector, one match set.
 */
const MENU_OPTION_SELECTOR = '[role="menuitemradio"], [role="menuitem"]';

/** Light, Dark, System — and nothing else (brief Data Model: never a third resolved value). */
const THEME_OPTION_COUNT = 3;

/**
 * How each choice is recognised, by the word in its own text — the same reading the Vitest
 * sibling's `themeOf()` does, so the two layers cannot end up driving different options.
 *
 * Word-anchored, and each option's text must name exactly ONE of the three words: extra wording
 * is fine ("Follow system"), but an option reading "Follow system (dark)" would match two of these
 * and fail Playwright's strict mode — loudly, which is the right outcome for wording that
 * ambiguous.
 */
const THEME_OPTIONS = {
  light: /\blight\b/i,
  dark: /\bdark\b/i,
  system: /\bsystem\b/i,
} as const;

/**
 * A generous ceiling on how far into the page the theme control may sit in tab order. The shell
 * puts it third (Animals, Habitats, theme), so this is headroom, not an expectation — what AC-5
 * requires is that it is reachable by Tab at all, not that it is reached in a particular number of
 * presses.
 */
const MAX_TAB_PRESSES = 12;

/**
 * Serve the reads both screens this spec visits make — the roster on `/` and the reference list on
 * `/habitats` — so each renders hermetically. The data is never what is under test here; a loaded
 * table is only the anchor that proves the screen settled before a theme assertion is taken.
 *
 * `abortUnmatchedApiRequests` is registered FIRST so it is the last resort: Playwright consults
 * handlers in reverse registration order, so the two specific interceptors still answer everything
 * they cover, and anything they miss is aborted rather than forwarded to the real Linx backend.
 */
async function mockScreenReads(page: Page): Promise<void> {
  await abortUnmatchedApiRequests(page);
  await mockAnimals(page);
  await mockHabitats(page);
}

/**
 * The theme control's trigger: a single button inside the existing `navigation` landmark, named so
 * that an icon-only control still introduces itself (Vitest sibling contract point 1).
 *
 * Scoped to the nav on purpose — that is where NFR-4 requires it to live (the shared shell, so it
 * is reachable from every screen), and a copy floated elsewhere in the header would not satisfy
 * that.
 */
function themeControl(page: Page): Locator {
  return page.getByRole('navigation').getByRole('button', { name: /theme/i });
}

/** The control's menu, present only while it is open. */
function themeMenu(page: Page): Locator {
  return page.getByRole('menu');
}

/** One choice in the open menu, identified by its own word (see {@link THEME_OPTIONS}). */
function themeOption(page: Page, option: RegExp): Locator {
  return themeMenu(page)
    .locator(MENU_OPTION_SELECTOR)
    .filter({ hasText: option });
}

/**
 * Wait until the control is open and offering all three choices.
 *
 * Waiting for the count doubles as the settle anchor: a menu still mounting its items never
 * reaches three, and the failure names the count it actually saw.
 */
async function expectThemeControlOpen(page: Page): Promise<void> {
  await expect(themeMenu(page)).toBeVisible();
  await expect(themeMenu(page).locator(MENU_OPTION_SELECTOR)).toHaveCount(
    THEME_OPTION_COUNT,
  );
}

/**
 * Taking a choice closes the menu (Vitest sibling contract point: "the menu closes when a choice
 * is taken"). Playwright's role engine ignores elements hidden from the accessibility tree, so
 * this holds whether the content unmounts or is merely hidden.
 */
async function expectThemeMenuClosed(page: Page): Promise<void> {
  await expect(themeMenu(page)).toHaveCount(0);
}

/** Open the control with the pointer. The keyboard route is AC-5's own test, not a helper. */
async function openThemeControl(page: Page): Promise<void> {
  await themeControl(page).click();
  await expectThemeControlOpen(page);
}

/** Open the control, take one of the three choices, and wait for the menu to close behind it. */
async function chooseTheme(page: Page, option: RegExp): Promise<void> {
  await openThemeControl(page);
  await themeOption(page, option).click();
  await expectThemeMenuClosed(page);
}

/**
 * The theme currently applied, asserted as the MECHANISM Decision 4 fixes: the `dark` class on
 * `<html>` is present for dark and absent for light. No colour, hex or computed style is read
 * anywhere in this spec.
 *
 * @param darkApplied `true` when dark is the expected resolution, `false` when light is.
 */
async function expectAppliedTheme(
  page: Page,
  darkApplied: boolean,
): Promise<void> {
  const html = page.locator('html');

  if (darkApplied) {
    await expect(html).toHaveClass(THEME_CLASS_PATTERN);
    return;
  }

  await expect(html).not.toHaveClass(THEME_CLASS_PATTERN);
}

/**
 * What is stored for this browser, polled so a write that lands a tick after the click is not a
 * flake.
 *
 * @param expected `'light'` / `'dark'` for an explicit choice, or `null` for "no key at all" —
 *   which is how Decision 4 represents "follow the OS". `null` here is a real assertion, not an
 *   absence of one: a control that stored the string `system` instead would fail it.
 */
async function expectStoredPreference(
  page: Page,
  expected: 'light' | 'dark' | null,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (key) => window.localStorage.getItem(key),
          THEME_STORAGE_KEY,
        ),
      {
        message: `the theme preference stored under localStorage["${THEME_STORAGE_KEY}"]`,
      },
    )
    .toBe(expected);
}

/** Is this the element the document is focused on right now? */
async function isFocused(target: Locator): Promise<boolean> {
  return target.evaluate((element) => element === document.activeElement);
}

/**
 * Walk Tab forward from wherever focus is until it lands on `target`.
 *
 * A bounded search rather than a hardcoded number of presses, so the test asserts what AC-5
 * actually asks — that the control is REACHABLE by keyboard — without also pinning its position in
 * tab order, which no criterion fixes. The assertion after the loop is unconditional: if the
 * control is never reached, that assertion is what fails, and it names the control.
 */
async function tabUntilFocused(page: Page, target: Locator): Promise<void> {
  for (let press = 0; press < MAX_TAB_PRESSES; press += 1) {
    await page.keyboard.press('Tab');

    if (await isFocused(target)) {
      return;
    }
  }

  await expect(target).toBeFocused();
}

/**
 * Move focus through the open menu with the Down arrow until it reaches one particular choice.
 *
 * Which option a freshly-opened menu focuses first is not part of any contract (and Radix's own
 * choice depends on which option is checked), so the target is arrowed TO rather than assumed to
 * be first. One full wrap plus one is the bound.
 */
async function arrowToThemeOption(page: Page, option: RegExp): Promise<void> {
  const target = themeOption(page, option);

  for (let press = 0; press < THEME_OPTION_COUNT + 1; press += 1) {
    if (await isFocused(target)) {
      return;
    }

    await page.keyboard.press('ArrowDown');
  }

  await expect(target).toBeFocused();
}

test.describe('Epic theme-switching, Story 2: Choose Light, Dark or System from the nav bar', () => {
  // AC-1
  test('a pick applies at once, in the same document, and is still in force on the next screen', async ({
    page,
  }) => {
    await mockScreenReads(page);
    const html = page.locator('html');

    // The OS asks for dark and nothing has ever been chosen, so the app opens dark (story 1) —
    // which is what makes the pick of Light below an observable change rather than a no-op.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    await expectAppliedTheme(page, true);

    // Stamp THIS document. A pick that navigated or reloaded to apply itself would lose the
    // marker, so its survival is the "immediately" half of AC-1 — not merely "eventually".
    await html.evaluate((element) =>
      element.setAttribute('data-theme-pick-probe', 'same-document'),
    );

    await chooseTheme(page, THEME_OPTIONS.light);
    await expectAppliedTheme(page, false);
    await expect(html).toHaveAttribute(
      'data-theme-pick-probe',
      'same-document',
    );

    // ...and on EVERY screen. The control lives in the shared shell (NFR-4), so moving to
    // Habitats must arrive already light rather than reverting to the app's default look.
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Habitats', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Habitats', level: 1 }),
    ).toBeVisible();
    await expectAppliedTheme(page, false);

    // The control is on this screen too, and it works in the other direction — so neither
    // direction is a one-way trip and the shell's copy is not a decoration.
    await chooseTheme(page, THEME_OPTIONS.dark);
    await expectAppliedTheme(page, true);
  });

  // AC-2
  test('a pick of Light survives a reload and a later visit, while the OS asks for dark throughout', async ({
    page,
  }) => {
    await mockScreenReads(page);

    // The OS asks for the OPPOSITE for the whole test, so no light reading below can be a
    // coincidence: every one of them has to come from the stored choice winning.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    await expectAppliedTheme(page, true);

    await chooseTheme(page, THEME_OPTIONS.light);
    await expectAppliedTheme(page, false);
    // Persisted under the key and with the value Decision 4 fixes — `light`, not `Light`, not a
    // JSON blob, not a cookie: story 1's pre-paint script reads exactly this.
    await expectStoredPreference(page, 'light');

    await page.reload();
    await expect(page.getByRole('table')).toBeVisible();
    await expectAppliedTheme(page, false);

    // "A later visit" — a brand-new document in the same browser, which is what shares
    // `localStorage` (BR6: the browser is the only store, there being no account to carry it).
    // The OS is emulated dark here too, since `colorScheme` is per-page.
    const laterVisit = await page.context().newPage();
    await mockScreenReads(laterVisit);
    await laterVisit.emulateMedia({ colorScheme: 'dark' });
    await laterVisit.goto('/');
    await expect(laterVisit.getByRole('table')).toBeVisible();
    await expectAppliedTheme(laterVisit, false);
    await expectStoredPreference(laterVisit, 'light');
    await laterVisit.close();
  });

  // AC-3
  test('picking System discards the earlier pick and follows the OS again, including a change made while the app is open', async ({
    page,
  }) => {
    // Counting real document loads is the "without a reload" proof: an OS change has to be
    // handled by a live media-query listener (NFR-2), never by re-fetching the page.
    let documentLoads = 0;
    page.on('load', () => {
      documentLoads += 1;
    });

    await mockScreenReads(page);

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();

    // Start from an explicit pick that DISAGREES with the OS, so "back to following the OS" is
    // observable as a change rather than as nothing having happened.
    await chooseTheme(page, THEME_OPTIONS.light);
    await expectAppliedTheme(page, false);
    await expectStoredPreference(page, 'light');

    await chooseTheme(page, THEME_OPTIONS.system);

    // (1) The earlier pick is DISCARDED — the key is removed, not overwritten with the string
    // `system`. Decision 4 makes absence the representation of "follow the OS", and story 1's
    // pre-paint script treats any stored value as an explicit choice, so a stored `system` would
    // resolve to neither light nor dark. This is the defect this assertion exists to catch.
    await expectStoredPreference(page, null);

    // (2) The app is following the OS again — dark, because that is what the OS asks for.
    await expectAppliedTheme(page, true);

    // (3) ...and it keeps following, live: the OS setting changes with the tab open and the app
    // follows with no reload and no further action by the user.
    await page.emulateMedia({ colorScheme: 'light' });
    await expectAppliedTheme(page, false);
    // And back again, so the listener is proven to TRACK the setting rather than to have fired
    // once on the way out of the stored preference.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectAppliedTheme(page, true);

    // One document for the whole test: the initial `goto`. Anything higher means a theme change
    // went through a page load.
    expect(documentLoads).toBe(1);
  });

  // AC-5
  test('the control can be reached and operated with the keyboard alone', async ({
    page,
  }) => {
    await mockScreenReads(page);

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    await expectAppliedTheme(page, true);

    // Reached by Tab from the top of the page. Nothing below uses `.click()`, `.focus()` or
    // `locator.press()` — the last one focuses the element for you, which would let an
    // unreachable control pass a "keyboard" test.
    await tabUntilFocused(page, themeControl(page));
    await expect(themeControl(page)).toBeFocused();

    // Opened from the keyboard...
    await page.keyboard.press('Enter');
    await expectThemeControlOpen(page);

    // ...moved through with the arrow keys, and taken with Enter.
    await arrowToThemeOption(page, THEME_OPTIONS.light);
    await page.keyboard.press('Enter');

    // OPERATED, not merely focusable: the theme actually changed, the choice was stored, and the
    // menu closed behind it — all without the mouse. Asserting focusability alone would pass on a
    // control that cannot be activated from the keyboard, which is the real AC-5 failure.
    await expectAppliedTheme(page, false);
    await expectStoredPreference(page, 'light');
    await expectThemeMenuClosed(page);
  });
});
