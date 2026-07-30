/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/components/feedback/FailureState.tsx
 * - Page Action: modify_existing
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never uses
 *   the real `API_KEY` (testing-policy.md § "Playwright runs against mocks, never live").
 * - Interception happens on the app's OWN route handlers — `/api/animals`, `/api/animals/{Id}`,
 *   `/api/habitats` — through the shared helpers in `./fixtures/api-mocks` and their disjoint
 *   regexes. NEVER the Linx base URL (`http://localhost:10002/crud-patterns/**`), which is
 *   called from the Next.js server tier and is invisible to `page.route()` (architecture.md
 *   Decision 1, § Playwright spec conventions #4). {@link mockScreenReads} installs
 *   `abortUnmatchedApiRequests` FIRST on every page, so any `/api/**` request the specific
 *   interceptors do not cover fails loudly instead of travelling on to the real backend.
 * - Response bodies come from the project-wide entity factories via that fixtures module, never
 *   hand-written inline, so this layer cannot drift from the Vitest layer.
 * - **Read-only.** No form is submitted and no write interceptor is installed anywhere in this
 *   spec: it opens five screens, waits for each to settle, and scans. `dataSource` is
 *   `existing-api` with no MSW runtime layer, so not issuing a write at all is the strongest
 *   guarantee that a scan of the add form cannot create a row.
 * - No auth chain: this project has no login, session or `userinfo` endpoint (project.md
 *   §Authentication, epic 1 BR15, conventions #6). No credential fixtures, no cookie clearing.
 * - Implementation patterns this spec REQUIRES (all from architecture.md § Decision 4 — the
 *   theme contract; none invented here):
 *   1. The applied class is `dark` on `<html>`, and **light is the ABSENCE of that class** —
 *      there is no `light` class.
 *   2. "Follow the OS" is represented by the ABSENCE of `localStorage['theme']`. This spec never
 *      stores a preference, so every scan below runs in the theme the emulated OS asked for.
 *   3. The OS source is `window.matchMedia('(prefers-color-scheme: dark)')`, read before first
 *      paint — so an emulated `colorScheme` decides the theme of the very first render, which is
 *      the render axe measures.
 *   4. Every screen's data is read BROWSER-side through the API client (Decision 1), or these
 *      interceptors match nothing and the scans run against failure states nobody asked for.
 *
 * E2E spec for Epic theme-switching, Story 5: Every state correct in light, and accessibility
 * passing in both themes.
 *
 * ── What this spec covers, and what it deliberately does not ─────────────────────────────────
 *
 * AC-6 — the only `playwright`-tagged criterion, and **the load-bearing automated check of the
 * whole epic**. Brand orange `#ff6b01` on cream `#fff9ec` is **2.7:1** and fails WCAG AA for all
 * text sizes (brief R8/BR5). An axe colour-contrast scan taken in LIGHT is the only thing in this
 * project that catches orange text or icons reintroduced on a light surface — no unit test can
 * see a computed colour, and no other spec runs in light. `--primary` under `:root` is
 * deliberately the darker `#ad4800`; if a later "fix" corrects it back to the brand orange, the
 * light half of this scan is what turns red.
 *
 * AC-1..AC-5 are `coverage: none` and are **deliberately not attempted here**. They are about how
 * the read states (loading placeholders, the two empty states, the "no matches" state, the
 * failed-to-load message and its Retry button, the duplicate-name warning, the technical-failure
 * alert, the not-found screen) *look* against cream — legible, visible against the page, calm
 * rather than alarming. Asserting any of that would mean pinning computed colours or hex values,
 * which `.claude/policies/styling-centralisation.md` forbids and which would pass or fail on
 * styling decisions no criterion fixes. They are judged by eye at the manual-test gate, from the
 * story's own checklist. Nothing in this file reads a colour, a hex value or a computed style;
 * the axe scan is the entire colour check, and it is a scan rather than an assertion about a
 * specific colour.
 *
 * ── Why the scan is parameterised, and what each half proves ─────────────────────────────────
 *
 * One body, two tests — `light` and `dark` — each walking the five surfaces AC-6 names. The dark
 * half is not redundant with epic 1's baseline: that one scans the roster and its failure state
 * only, so an animal's detail screen, the habitats list and the add form have never been scanned
 * in either theme.
 *
 * Epic 1's dark-only baseline in `epic-zoo-animal-manager-story-2-app-shell-and-roster.spec.ts`
 * is extended here, never replaced, and is left untouched. Worth knowing while building this
 * story: that spec emulates no `colorScheme`, and Playwright's default is `'light'` — so once
 * story 1 makes the theme OS-driven, epic 1's scan starts measuring the LIGHT roster. That is a
 * useful extra signal rather than a problem, and it is one more reason the light fixes must
 * actually land: it is not a licence to edit that spec.
 *
 * Each surface is opened on its OWN page so its interceptors are installed fresh. The
 * failed-to-load surface registers `mockAnimalsFailure` over the success interceptor, and on a
 * shared page that override would leak into every surface visited afterwards; a page per surface
 * removes the ordering dependency entirely. It also means each scan is a cold deep-link to the
 * route, not a screen reached through another one.
 *
 * The theme of every scan is asserted BEFORE it is taken ({@link expectOsDrivenTheme}) —
 * `<html>` carries `dark` in the dark half and does not in the light half, and nothing is stored.
 * Without that precondition a light scan could silently run in dark (or against a screen that
 * persisted a default on load) and report a false pass, which is the one failure mode that would
 * make this whole file worthless.
 *
 * Failures are reported per (theme, surface) pair: each scan is a **soft** assertion labelled
 * with the theme and the screen, so one run names every combination that failed and the rules it
 * failed on, rather than stopping at the first of ten and reporting "axe found violations".
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import type { Page } from '@playwright/test';

import type { AnimalRead } from '../src/types/api-generated';
import {
  abortUnmatchedApiRequests,
  mockAnimal,
  mockAnimals,
  mockAnimalsFailure,
  mockHabitats,
} from './fixtures/api-mocks';
import { createAnimals } from '../src/mocks/data/animal';

/**
 * WCAG 2.1 Level AA — exactly the bar `NFR-base-1` sets, and the same tag list epic 1's
 * baseline uses. Axe's defaults ALSO run best-practice rules, which would fail this spec on
 * issues outside the agreed standard.
 */
const WCAG_21_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Matches `dark` as a WHOLE class among the three `next/font` variable classes `<html>` also
 * carries. A bare `/dark/` would also match a font variable or a utility containing "dark".
 *
 * The same pattern stories 1 and 2 use: the mechanism (is the class there?) is what the theme
 * contract is about — never a colour.
 */
const THEME_CLASS_PATTERN = /(?:^|\s)dark(?:\s|$)/;

/**
 * The `localStorage` key an explicit in-app choice is stored under, fixed by architecture.md
 * Decision 4. This spec only ever asserts its ABSENCE: absence is how "follow the OS" is
 * represented, and it is what makes the emulated `colorScheme` below the thing that decides each
 * scan's theme.
 *
 * Pinned as a literal rather than imported: production code must export a `THEME_STORAGE_KEY`
 * constant, but it does not exist yet at generation time, and importing a missing module would
 * stop this spec being collected at all.
 */
const THEME_STORAGE_KEY = 'theme';

/** The canonical roster both test layers share. */
const ROSTER = createAnimals();

/**
 * Pull one animal out of the canonical roster, so the row that anchors the roster scan and the
 * record the detail scan opens are the same animal. Throws rather than returning `undefined`, so
 * a fixture rename fails loudly here instead of producing a scan of an empty screen.
 */
function animalNamed(name: string): AnimalRead {
  const match = ROSTER.find((animal) => animal.Name === name);

  if (!match) {
    throw new Error(
      `No animal named "${name}" in the canonical roster fixture`,
    );
  }

  return match;
}

/**
 * A fixture value that every scan's settle anchor depends on, as a definite string.
 *
 * `AnimalRead` marks every field optional (the API spec declares no `required:`), so threading
 * `| undefined` into a locator would let a fixture that lost its `Name` produce a locator that
 * matches everything. Throwing here fails the spec at collection, with the field named.
 */
function required(value: string | number | undefined, field: string): string {
  if (value === undefined) {
    throw new Error(`The roster fixture animal has no ${field}`);
  }

  return String(value);
}

/** Anaya — the roster row that anchors the roster scans and the record the detail scans open. */
const ANIMAL = animalNamed('Anaya');
const ANIMAL_NAME = required(ANIMAL.Name, 'Name');
const ANIMAL_DETAIL_PATH = `/animals/${required(ANIMAL.Id, 'Id')}`;

/** One theme to scan in, and the class state that proves the app resolved to it. */
interface ThemeCase {
  /** How the theme is named in a test title and in a failure label. */
  readonly name: string;
  /** What the operating system is emulated as asking for. */
  readonly colorScheme: 'light' | 'dark';
  /** Whether `<html>` must then carry the `dark` class (Decision 4: light is its absence). */
  readonly darkApplied: boolean;
}

/**
 * The two themes AC-6 requires — "light as well as dark". There is no third resolved value
 * (brief Data Model), so this list is exhaustive rather than representative.
 */
const THEME_CASES: readonly ThemeCase[] = [
  { name: 'light', colorScheme: 'light', darkApplied: false },
  { name: 'dark', colorScheme: 'dark', darkApplied: true },
];

/** One screen to scan: how to reach it, and how to know it has settled. */
interface Surface {
  /** Named as it appears in a failure label, including its route. */
  readonly name: string;
  /** Install this screen's interceptors, navigate to it, and wait for it to settle. */
  readonly open: (page: Page) => Promise<void>;
}

/**
 * Serve the reads every screen in this spec makes, hermetically.
 *
 * `abortUnmatchedApiRequests` is registered FIRST so it is the last resort: Playwright consults
 * handlers in reverse registration order, so the specific interceptors still answer everything
 * they cover, and anything they miss is aborted rather than forwarded to the real Linx backend.
 *
 * Both the animal and habitat handlers go on every page even where a screen reads only one of
 * them — an interception that is never used costs nothing, while a missing one would put the
 * screen into a failure state and the scan would measure the wrong thing.
 */
async function mockScreenReads(page: Page): Promise<void> {
  await abortUnmatchedApiRequests(page);
  await mockAnimals(page, ROSTER);
  await mockHabitats(page);
}

/** The animal roster — the home screen, loaded with the canonical four animals. */
async function openRoster(page: Page): Promise<void> {
  await mockScreenReads(page);

  await page.goto('/');

  // Settle on a real row from the mocked response, so the scan measures the LOADED roster
  // rather than the skeleton that precedes it.
  await expect(
    page.getByRole('table').getByRole('cell', { name: ANIMAL_NAME }),
  ).toBeVisible();
}

/**
 * The roster's failed-to-load state — `FailureState`'s destructive alert plus its Retry button.
 *
 * This surface matters disproportionately: error text and a Retry control are exactly where
 * contrast problems hide, and epic 1's baseline found the same. `mockAnimalsFailure` is
 * registered AFTER the success interceptor so it overrides it (reverse registration order) and
 * answers the screen's very first fetch — no reload needed, and on a page of its own the
 * override cannot leak into any other surface.
 */
async function openRosterFailure(page: Page): Promise<void> {
  await mockScreenReads(page);
  await mockAnimalsFailure(page);

  await page.goto('/');

  // The Retry control is the settle anchor only. The failure BEHAVIOUR is epic 1's story 2
  // (Vitest AC-5); nothing here re-asserts it.
  await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
}

/** One animal's detail screen, opened as a cold deep-link to that record's own address. */
async function openAnimalDetail(page: Page): Promise<void> {
  await mockScreenReads(page);
  // The detail interceptor's regex is disjoint from the list one, so both stay active.
  await mockAnimal(page, ANIMAL);

  await page.goto(ANIMAL_DETAIL_PATH);

  // The heading IS the animal's name once the record arrives (epic 1 story 4), so this waits
  // out both the loading placeholder and any wrong-record render.
  await expect(page.getByRole('heading', { name: ANIMAL_NAME })).toBeVisible();
}

/** The habitats reference list. */
async function openHabitats(page: Page): Promise<void> {
  await mockScreenReads(page);

  await page.goto('/habitats');

  // The reference table only exists once the list has loaded — the heading appears immediately,
  // so it would not be a settle anchor.
  await expect(page.getByRole('main').getByRole('table')).toBeVisible();
}

/**
 * The add-animal form. Opened directly rather than through the roster's action: this spec scans
 * routes, and one fewer navigation is one fewer thing that can settle late.
 */
async function openAddAnimalForm(page: Page): Promise<void> {
  await mockScreenReads(page);

  await page.goto('/animals/new');

  // `AnimalForm` renders its five entries only once `useHabitats()` has answered, and the
  // habitat picker is the last of them to become nameable (its accessible name carries
  // "habitat" because a `<label for>` cannot name a Radix trigger). Waiting for it is therefore
  // the proof that the whole form has painted. Nothing is typed and nothing is submitted.
  await expect(
    page.getByRole('main').getByRole('combobox', { name: /habitat/i }),
  ).toBeVisible();
}

/**
 * The five screens AC-6 names, in the order it names them.
 *
 * Each is a distinct rendered state rather than a data variation, which is why all five are
 * scanned rather than one being taken as representative: axe violations are state-specific, and
 * the states here differ in what they put on the page (a table, a destructive alert, a
 * description list, a form).
 */
const SURFACES: readonly Surface[] = [
  { name: 'the animal roster (/)', open: openRoster },
  {
    name: 'the roster failed-to-load state, with Retry (/)',
    open: openRosterFailure,
  },
  {
    name: `an animal's detail screen (${ANIMAL_DETAIL_PATH})`,
    open: openAnimalDetail,
  },
  { name: 'the habitats list (/habitats)', open: openHabitats },
  { name: 'the add-animal form (/animals/new)', open: openAddAnimalForm },
];

/**
 * The violations axe reports, typed off the builder itself so this spec needs no direct
 * `axe-core` import.
 */
type AxeViolations = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'];

/**
 * Turn axe's violation objects into readable one-liners.
 *
 * A raw `expect(violations).toEqual([])` prints an enormous nested diff that buries the useful
 * part; this keeps the rule id, its severity, how many elements failed, where the first one is
 * and the rule's help URL — which is what someone fixing a contrast failure actually needs.
 * `color-contrast` is the rule R8/BR5 exists for, and it will name the offending element.
 */
function summariseViolations(violations: AxeViolations): string[] {
  return violations.map((violation) => {
    const firstTarget =
      violation.nodes[0]?.target.join(' ') ?? 'unknown element';

    return `${violation.id} [${violation.impact ?? 'unknown impact'}] ${violation.nodes.length} element(s), first: ${firstTarget} — ${violation.help} (${violation.helpUrl})`;
  });
}

/**
 * Assert the scan is about to happen in the theme this test thinks it is.
 *
 * Two things, both preconditions rather than the criterion itself:
 *
 * 1. **Nothing is stored.** Absence of `localStorage['theme']` is how Decision 4 represents
 *    "follow the OS", so this is what makes the emulated `colorScheme` the thing that decided
 *    the theme. It also catches an implementation that persists a resolved default on first load
 *    — which would leave the second and later pages in this test on the stored value instead of
 *    the emulated one.
 * 2. **The resolved theme matches.** `dark` on `<html>` for the dark half, and absent for the
 *    light half. Without this, a light scan could quietly run in dark and report a false pass on
 *    the one contrast rule this whole file exists to enforce.
 *
 * Presence/absence of one class is the entire assertion — no colour, hex value or computed style
 * is read here or anywhere else in this spec.
 */
async function expectOsDrivenTheme(
  page: Page,
  theme: ThemeCase,
): Promise<void> {
  const storedPreference = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    THEME_STORAGE_KEY,
  );
  expect(
    storedPreference,
    `no theme may be stored under localStorage["${THEME_STORAGE_KEY}"]: this scan must be decided by the emulated OS setting (${theme.colorScheme}), not by a persisted choice`,
  ).toBeNull();

  const html = page.locator('html');

  if (theme.darkApplied) {
    await expect(html).toHaveClass(THEME_CLASS_PATTERN);
    return;
  }

  await expect(html).not.toHaveClass(THEME_CLASS_PATTERN);
}

test.describe('Epic theme-switching, Story 5: Every state correct in light, and accessibility passing in both themes', () => {
  for (const theme of THEME_CASES) {
    // AC-6 — one body, run once per theme, so a failure names the theme in its title.
    test(`every screen and the failed-to-load state pass the WCAG 2.1 AA scan with the operating system set to ${theme.name}`, async ({
      browser,
    }) => {
      // Five cold route loads plus five axe runs; generous headroom rather than an expectation,
      // and it keeps a slow first compile in dev from reading as an accessibility failure.
      test.slow();

      // The OS setting is emulated at CONTEXT level, and the context starts with empty storage —
      // together, exactly the "nothing chosen in this app, follow the machine" state Decision 4
      // says to test the themes through.
      const context = await browser.newContext({
        colorScheme: theme.colorScheme,
      });

      try {
        for (const surface of SURFACES) {
          // A page per surface: interceptors are installed fresh (so the failure override cannot
          // leak forward), and each screen is reached as a cold deep-link.
          const page = await context.newPage();

          try {
            await surface.open(page);
            await expectOsDrivenTheme(page, theme);

            const { violations } = await new AxeBuilder({ page })
              .withTags(WCAG_21_AA_TAGS)
              .analyze();

            // Soft, and labelled with the theme AND the screen: one run then reports every
            // failing combination and the rules it failed, instead of stopping at the first.
            expect
              .soft(
                summariseViolations(violations),
                `accessibility violations in ${theme.name} on ${surface.name}`,
              )
              .toEqual([]);
          } finally {
            await page.close();
          }
        }
      } finally {
        await context.close();
      }
    });
  }
});
