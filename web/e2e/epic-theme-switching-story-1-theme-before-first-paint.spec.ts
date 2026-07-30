/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/layout.tsx
 * - Page Action: modify_existing
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never
 *   uses the real `API_KEY` (testing-policy.md § "Playwright runs against mocks, never
 *   live").
 * - Interception happens on the app's OWN route handlers, via the shared helpers in
 *   `./fixtures/api-mocks` (`mockAnimals`, `mockHabitats`) and their disjoint regexes —
 *   NOT the Linx base URL (`http://localhost:10002/crud-patterns/**`), which is called from
 *   the Next.js server tier and is invisible to `page.route()` (architecture.md Decision 1,
 *   § Playwright spec conventions #4).
 * - Response bodies come from the project-wide entity factories via that fixtures module,
 *   never hand-written inline, so this layer cannot drift from the Vitest layer.
 * - No auth chain: this project has no login, session or `userinfo` endpoint (project.md
 *   §Authentication, epic 1 BR15, conventions #6). No credential fixtures, no cookie
 *   clearing.
 * - Implementation pattern this spec REQUIRES:
 *   1. The theme class on `<html>` is `dark` — the class the `.dark` token block already
 *      keys off (brief §Token wiring). Light is that class being ABSENT; there is no
 *      `light` class in this design, and this spec asserts presence/absence of `dark` only.
 *   2. The class is written by a script that the HTML parser runs BEFORE `<body>` is
 *      parsed — i.e. an inline `<script>` in `<head>` (or the very top of `<body>`, ahead of
 *      the shell). A `useEffect` / post-hydration write FAILS this spec by construction; see
 *      "How AC-2 catches a `useEffect` implementation" below.
 *   3. The stored preference lives in `localStorage` under the key `theme` (see
 *      {@link THEME_STORAGE_KEY}) with the values `light` / `dark`, and NO stored value means
 *      "follow the OS" (brief Data Model: absence ≡ `"system"`; picking System clears the
 *      key rather than storing the string `system` — this spec never asserts a `system`
 *      value, only that an absent key means OS-driven). Story 2's control must persist to
 *      that same key, and both layers should read it from one exported constant in
 *      production code once story 1 lands.
 * - No cookie or server-side storage assumptions: the preference is browser-only (BR6).
 *
 * E2E spec for Epic theme-switching, Story 1: The right theme before the page appears.
 *
 * Covers the five `playwright`-tagged criteria — AC-1, AC-2, AC-3, AC-4, AC-6. AC-5
 * (single `navigation` / `main` landmark, nav link names and `aria-current`) is
 * `vitest`-tagged and lives in the story's integration test, and the landmark/nav-link
 * invariants are additionally pinned live by epic 1's story 2 spec, so they are deliberately
 * not re-asserted here.
 *
 * This spec carries NO axe scan. Epic 1's story 2 spec owns the dark-theme baseline, and the
 * both-themes scan (R8/NFR-3) rides story 5 — light is still unfixed at this point, so a
 * light scan here would be red for reasons this story does not own (story file, header note).
 *
 * ── How AC-2 catches a `useEffect` implementation ────────────────────────────────────────
 * Asserting the final class after load proves nothing about flashing: a post-hydration write
 * settles on the right class too, just visibly late. So AC-2 does not assert the final state.
 * {@link installThemeProbe} runs at document-start (before ANY page script) and records
 * `documentElement.className` at parser-time checkpoints — when `<html>` appears, when
 * `<body>` appears, when the shell's `<main>` appears — plus every later mutation of the
 * `class` attribute and the value at `DOMContentLoaded` / `load`. The assertion
 * ({@link expectThemeAppliedBeforePaint}) then requires:
 *
 *   (a) the class is ALREADY correct at the `<body>` / `<main>` checkpoints, and
 *       `document.readyState` at those checkpoints is still `'loading'` — the parser has not
 *       finished, so React cannot have hydrated yet; and
 *   (b) the resolved theme NEVER changes from that checkpoint onwards — across every
 *       recorded `class` mutation, `DOMContentLoaded` and `load`. A flash is exactly such a
 *       change, so this fails on the flash itself rather than on a proxy for it.
 *
 * A `useEffect` implementation cannot satisfy this. The server renders one fixed class for
 * everyone (it can read neither `localStorage` nor the OS setting), so the effect must
 * correct it after hydration — after `readyState` left `'loading'`. Whichever fixed class the
 * server picks, one of the two directions asserted below breaks it: if it renders no `dark`,
 * the OS-dark case has `hasThemeClass: false` at `<main>` and then flips to `true`; if it
 * renders `dark` (today's hardcoded value), the OS-light case has `true` at `<main>` and then
 * flips to `false`. Both directions are asserted in the same test, on a first load and again
 * after a reload, so no single server-rendered default passes.
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { expect, test } from '@playwright/test';

import type { BrowserContext, Page } from '@playwright/test';

import { mockAnimals, mockHabitats } from './fixtures/api-mocks';

/**
 * The class the design tokens already key dark mode off (`.dark` in
 * `web/src/styles/design-tokens.css`). Light is its ABSENCE — there is no second class, and
 * this spec never looks at a colour or a computed style: it asserts the mechanism (is the
 * class there, and did it change?), which is what the no-flash requirement is actually about.
 */
const THEME_CLASS = 'dark';

/**
 * Matches `dark` as a whole class among the three `next/font` variable classes `<html>` also
 * carries. A bare `/dark/` would also match a font variable or a utility containing "dark".
 */
const THEME_CLASS_PATTERN = /(?:^|\s)dark(?:\s|$)/;

/**
 * The `localStorage` key the pre-paint script reads and story 2's control writes.
 *
 * The brief fixes the shape (`"light" | "dark"`, browser-only, absence ≡ follow the OS —
 * Data Model, BR6) but not the key name, so this spec pins it: `theme`, the conventional
 * name. Production code should export this constant once story 1 lands so the control, the
 * script and both test layers cannot drift apart.
 */
const THEME_STORAGE_KEY = 'theme';

/** One reading of `<html class>`, taken at a named point in the document's life. */
interface ThemeClassSnapshot {
  /** `documentElement` | `body` | `main` | `class-change` | `DOMContentLoaded` | `load`. */
  phase: string;
  /** The full class attribute, so a failure message shows what was actually there. */
  className: string;
  /** Whether {@link THEME_CLASS} was applied at that moment. */
  hasThemeClass: boolean;
  /** `'loading'` proves the reading happened while the parser was still running. */
  readyState: DocumentReadyState;
}

interface ThemeProbe {
  records: ThemeClassSnapshot[];
}

declare global {
  interface Window {
    /** Installed by {@link installThemeProbe}; read by {@link readThemeProbe}. */
    __themeProbe?: ThemeProbe;
  }
}

/**
 * Serve the reads the home screen makes, so the roster renders hermetically. The roster is
 * only ever the settle anchor in this spec — the theme is what is under test.
 */
async function mockHomeScreenReads(page: Page): Promise<void> {
  await mockAnimals(page);
  await mockHabitats(page);
}

/**
 * Record `<html class>` from document-start onwards, on every document this page loads.
 *
 * Install BEFORE the first `page.goto()`. `addInitScript` runs ahead of any script the page
 * itself ships, and re-runs on every navigation, so each load gets a fresh log — which is
 * what lets the reload half of AC-2 be asserted the same way as the first load.
 *
 * The two `MutationObserver`s are why this can see the earliest moments: `<html>` may not
 * exist yet when the init script runs, so one observer watches `document` for the parser
 * inserting `<html>`, `<body>` and the shell's `<main>`, and the other watches `<html>`'s
 * `class` attribute for every subsequent change. Observer callbacks are microtask-timed, so
 * they run between parser tokens rather than after the document is finished.
 */
async function installThemeProbe(page: Page): Promise<void> {
  await page.addInitScript((themeClass: string) => {
    const probe: ThemeProbe = { records: [] };
    window.__themeProbe = probe;

    const recordedPhases = new Set<string>();

    const record = (phase: string): void => {
      // Annotated as nullable deliberately: the DOM lib types `documentElement` as always
      // present, but at document-start it genuinely is not.
      const html: HTMLElement | null = document.documentElement;
      if (html === null) {
        return;
      }
      probe.records.push({
        phase,
        className: html.className,
        hasThemeClass: html.classList.contains(themeClass),
        readyState: document.readyState,
      });
    };

    const recordOnce = (phase: string): void => {
      if (recordedPhases.has(phase)) {
        return;
      }
      recordedPhases.add(phase);
      record(phase);
    };

    let watchingClassAttribute = false;
    const watchClassAttribute = (): void => {
      const html: HTMLElement | null = document.documentElement;
      if (watchingClassAttribute || html === null) {
        return;
      }
      watchingClassAttribute = true;
      // One record per mutation, not per callback batch: a batch that coalesced
      // dark → light → dark would otherwise look like no change at all.
      new MutationObserver((mutations) => {
        mutations.forEach(() => record('class-change'));
      }).observe(html, { attributes: true, attributeFilter: ['class'] });
    };

    const checkpoint = (): void => {
      const html: HTMLElement | null = document.documentElement;
      const body: HTMLElement | null = document.body;
      if (html !== null) {
        recordOnce('documentElement');
        watchClassAttribute();
      }
      if (body !== null) {
        recordOnce('body');
      }
      if (document.querySelector('main') !== null) {
        recordOnce('main');
      }
    };

    checkpoint();
    new MutationObserver(checkpoint).observe(document, {
      childList: true,
      subtree: true,
    });
    document.addEventListener('DOMContentLoaded', () =>
      record('DOMContentLoaded'),
    );
    window.addEventListener('load', () => record('load'));
  }, THEME_CLASS);
}

/**
 * Read the probe's log out of the current document, failing loudly if it is not there —
 * an absent probe means the assertions below would be vacuous, which must never pass.
 */
async function readThemeProbe(page: Page): Promise<ThemeClassSnapshot[]> {
  const records = await page.evaluate(() => window.__themeProbe?.records);

  if (records === undefined) {
    throw new Error(
      'The theme probe did not run in this document — installThemeProbe() must be called before the first page.goto().',
    );
  }

  return records;
}

/** The first reading taken at the given checkpoint, or a failure naming what WAS recorded. */
function snapshotAt(
  records: ThemeClassSnapshot[],
  phase: string,
): ThemeClassSnapshot {
  const snapshot = records.find((record) => record.phase === phase);

  if (snapshot === undefined) {
    throw new Error(
      `The theme probe never recorded the "${phase}" checkpoint. Recorded: ${JSON.stringify(
        records.map((record) => record.phase),
      )}`,
    );
  }

  return snapshot;
}

/**
 * Assert the no-flash contract for the document currently loaded: the theme was ALREADY
 * resolved while the parser was still running, and it never changed afterwards.
 *
 * @param themeClassApplied `true` when the correct resolution is dark (the `dark` class
 *   present), `false` when it is light (the class absent).
 */
async function expectThemeAppliedBeforePaint(
  page: Page,
  themeClassApplied: boolean,
): Promise<void> {
  const records = await readThemeProbe(page);
  const atBodyStart = snapshotAt(records, 'body');
  const atFirstContent = snapshotAt(records, 'main');

  // Both checkpoints are reached by the HTML parser, so `readyState` must still be
  // 'loading' — which is what makes them pre-hydration, and therefore what makes the
  // assertion below impossible for a `useEffect` implementation to satisfy.
  expect(atBodyStart.readyState).toBe('loading');
  expect(atFirstContent.readyState).toBe('loading');

  // Already correct when the first content appeared — not corrected afterwards.
  expect(atFirstContent.hasThemeClass).toBe(themeClassApplied);

  // ...and it stayed that way for the rest of the load: one distinct resolution across the
  // `<body>` checkpoint, the `<main>` checkpoint, every `class` mutation, DOMContentLoaded
  // and load. A flash is precisely a second value in this list. (The `documentElement`
  // checkpoint is excluded: `<html>` exists a moment before the `<head>` script runs, so a
  // correct implementation legitimately reads "not yet applied" there.)
  const fromBodyStart = records.slice(records.indexOf(atBodyStart));
  const distinctResolutions = Array.from(
    new Set(fromBodyStart.map((record) => record.hasThemeClass)),
  );
  expect(distinctResolutions).toEqual([themeClassApplied]);
}

/**
 * Assert the SETTLED resolution, for a case whose expected direction is data-driven: exactly
 * one `<html>` carrying {@link THEME_CLASS} when dark is expected, and none when light is.
 * Auto-waits, so it is about WHAT was resolved; {@link expectThemeAppliedBeforePaint} is
 * about WHEN.
 */
async function expectResolvedTheme(
  page: Page,
  themeClassApplied: boolean,
): Promise<void> {
  await expect(page.locator(`html.${THEME_CLASS}`)).toHaveCount(
    themeClassApplied ? 1 : 0,
  );
}

/**
 * Seed a stored theme preference so the next navigation looks like a RETURNING visitor's:
 * the value is written at document-start, before the app's own scripts run, exactly as a
 * previously-persisted choice would already be present.
 *
 * Note this re-runs on every navigation of the page, so it cannot be used in a test that
 * needs storage cleared mid-flight (AC-6 writes storage from the page instead).
 */
async function seedStoredThemePreference(
  target: Page | BrowserContext,
  preference: 'light' | 'dark',
): Promise<void> {
  await target.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        // Init scripts are also evaluated on the context's initial `about:blank`, where
        // storage access throws. The document that matters — the app's own origin — always
        // succeeds; if it somehow did not, the assertions would fail loudly rather than pass.
        console.warn('Could not seed the stored theme preference', error);
      }
    },
    { key: THEME_STORAGE_KEY, value: preference },
  );
}

test.describe('Epic theme-switching, Story 1: The right theme before the page appears', () => {
  // AC-1
  test('with nothing stored, the app opens light when the OS is set to light and dark when it is set to dark', async ({
    page,
  }) => {
    await mockHomeScreenReads(page);
    const html = page.locator('html');

    // Nothing has ever been chosen in the app: a fresh context has empty storage, which is
    // the "no explicit choice" state the OS setting must decide (R2 — absence is never an
    // implicit dark).
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    // Settle on loaded content first, so the light assertion below cannot pass merely
    // because the page had not rendered yet.
    await expect(page.getByRole('table')).toBeVisible();
    await expect(html).toHaveClass(THEME_CLASS_PATTERN);

    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(html).not.toHaveClass(THEME_CLASS_PATTERN);
  });

  // AC-2 — the no-flash requirement. See the header for why this fails a `useEffect`
  // implementation and why asserting the settled class would not.
  test('the theme is already applied before the page is painted and never switches afterwards, on a first load and on a reload', async ({
    page,
  }) => {
    await mockHomeScreenReads(page);
    await installThemeProbe(page);

    // Direction 1 — the OS asks for dark, so `dark` must already be on `<html>` while the
    // parser is still running. An implementation that renders no class server-side and adds
    // it after hydration fails here.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    await expectThemeAppliedBeforePaint(page, true);

    // AC-2 says "on a first load or a reload" — a reload is the case a person actually
    // watches, and the probe is re-installed on every navigation.
    await page.reload();
    await expect(page.getByRole('table')).toBeVisible();
    await expectThemeAppliedBeforePaint(page, true);

    // Direction 2 — the OS asks for light, so `<html>` must be WITHOUT `dark` from the same
    // parser-time checkpoint. An implementation that keeps today's hardcoded `dark` on the
    // server and strips it after hydration fails here. Together the two directions leave no
    // fixed server-rendered class that can pass.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    await expectThemeAppliedBeforePaint(page, false);

    await page.reload();
    await expect(page.getByRole('table')).toBeVisible();
    await expectThemeAppliedBeforePaint(page, false);
  });

  // AC-3
  test('a theme already chosen in this browser wins over the opposite OS setting on a later visit', async ({
    browser,
  }) => {
    // Both directions, so an implementation that only ever honours one stored value (or that
    // treats the stored value as a mere hint) cannot pass. A separate context per direction:
    // the seeding init script re-runs on every navigation and cannot be removed from a page.
    const visits = [
      { stored: 'dark', os: 'light', expectThemeClass: true },
      { stored: 'light', os: 'dark', expectThemeClass: false },
    ] as const;

    for (const visit of visits) {
      const context = await browser.newContext({ colorScheme: visit.os });
      const page = await context.newPage();
      await mockHomeScreenReads(page);
      await seedStoredThemePreference(page, visit.stored);
      await installThemeProbe(page);

      await page.goto('/');
      await expect(page.getByRole('table')).toBeVisible();

      // The stored choice decides the theme...
      await expectResolvedTheme(page, visit.expectThemeClass);
      // ...and, being a returning visitor's, it is applied before the page appears too — the
      // stored value is the case the server can NEVER guess, so a post-hydration read would
      // flash on every visit a preference exists.
      await expectThemeAppliedBeforePaint(page, visit.expectThemeClass);

      await context.close();
    }
  });

  // AC-4
  test('while following the OS setting, changing that setting with the app open switches the app immediately and without a reload', async ({
    page,
  }) => {
    // Counting real document loads is the no-reload proof: `emulateMedia` must be handled by
    // a live media-query listener (NFR-2), not by re-fetching the page.
    let documentLoads = 0;
    page.on('load', () => {
      documentLoads += 1;
    });

    await mockHomeScreenReads(page);
    const html = page.locator('html');

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(html).toHaveClass(THEME_CLASS_PATTERN);

    // Stamp THIS document. Any reload replaces the document and takes the marker with it, so
    // the marker surviving is a second, independent proof that no navigation happened.
    await html.evaluate((element) =>
      element.setAttribute('data-live-switch-probe', 'same-document'),
    );

    // The OS switches to light with the tab open — nothing else happens.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).not.toHaveClass(THEME_CLASS_PATTERN);
    await expect(html).toHaveAttribute(
      'data-live-switch-probe',
      'same-document',
    );

    // ...and back again, so the listener is proven to track changes rather than to have
    // fired once.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html).toHaveClass(THEME_CLASS_PATTERN);
    await expect(html).toHaveAttribute(
      'data-live-switch-probe',
      'same-document',
    );

    expect(documentLoads).toBe(1);
  });

  // AC-6
  test('clearing this browser stored data returns the app to following the OS setting rather than forcing dark', async ({
    page,
  }) => {
    await mockHomeScreenReads(page);
    await installThemeProbe(page);
    const html = page.locator('html');

    // The OS asks for light for the whole test. Dark is the app's default LOOK, which is
    // exactly why this criterion exists: with nothing stored, the OS must win anyway.
    await page.emulateMedia({ colorScheme: 'light' });

    // Start as someone who chose Dark. Written from the page rather than via an init script,
    // because the clearing step below must not be undone on the next navigation.
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    await page.evaluate(
      (key) => window.localStorage.setItem(key, 'dark'),
      THEME_STORAGE_KEY,
    );
    await page.reload();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(html).toHaveClass(THEME_CLASS_PATTERN);

    // Now the browser's stored data is cleared — the state a new browser, a cleared site or
    // a private window is in (BR6).
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.getByRole('table')).toBeVisible();

    // Back to following the OS: light, not the default dark.
    await expect(html).not.toHaveClass(THEME_CLASS_PATTERN);
    // And light from before the page appeared, with no dark flash on the way (the previous
    // load in this same test WAS dark, so an implementation that caches or persists the
    // resolved class anywhere but storage shows up here).
    await expectThemeAppliedBeforePaint(page, false);
  });
});
