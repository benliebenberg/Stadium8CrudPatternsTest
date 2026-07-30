/**
 * Story Metadata:
 * - Route: /habitats
 * - Target File: web/src/app/habitats/page.tsx
 * - Page Action: create_new
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never
 *   uses the real `API_KEY`
 *   (testing-policy.md § "Playwright runs against mocks, never live").
 * - Interception is via `page.route()` on the app's OWN route handlers —
 *   `**\/api\/habitats**` and `**\/api\/animals**` — through the shared interceptors in
 *   `./fixtures/api-mocks` (architecture.md § Playwright spec conventions #7). NEVER the
 *   Linx base URL (`http://localhost:10002/crud-patterns/**`): that call is made from the
 *   Next.js server tier, which `page.route()` cannot see, so routing it would match nothing
 *   and let this spec reach the real backend (architecture.md Decision 1). Both handlers are
 *   mocked in every test here because each test crosses BOTH screens.
 * - Implementation pattern this REQUIRES (architecture.md Decision 1): the habitats screen's
 *   fetch of `/api/habitats` must happen BROWSER-side — a `"use client"` component fetching
 *   through the API client layer — because `page.route()` cannot intercept a
 *   server-component fetch or a Server Action, and `web/src/mocks/` is data-only (no MSW
 *   handlers are wired), so a server-side read would fall through to the live backend. If
 *   `app/habitats/page.tsx` is an `async` server component, these tests will not pass.
 * - Response bodies come from the shared entity factories (`../src/mocks/data/habitat`,
 *   `../src/mocks/data/animal`), imported by RELATIVE path — never the `@/` alias, which
 *   Playwright's runtime does not resolve — so this layer cannot drift from the Vitest layer.
 * - There is no auth chain to mock: this project has no login, no session and no userinfo
 *   endpoint (project.md §Authentication, brief BR15). No cookie clearing, no credential
 *   fixtures.
 *
 * E2E spec for Epic zoo-animal-manager, Story 5: Habitats reference list (read-only).
 *
 * Covers the one criterion tagged `playwright`:
 * - AC-1 — following the Habitats navigation entry opens the habitats reference list, with
 *   Habitats marked as the current section. Asserted in both directions: the outward trip
 *   from the roster (the trip that finally makes story 2's Habitats nav entry lead
 *   somewhere), and the return trip back to Animals. The round trip is the whole point of
 *   the shared shell, and only a real browser can prove it.
 *
 * AC-2 (fields + verbatim SAST date), AC-3 (loading / no-habitats / failure-plus-retry) and
 * AC-4 (no add/edit/delete affordance anywhere) are jsdom-observable and live in
 * `web/src/__tests__/integration/epic-zoo-animal-manager-story-5-habitats-list.test.tsx`
 * — deliberately not duplicated here.
 * AC-5 (the screen reads as intentionally look-only, not unfinished) is a by-eye judgement
 * tagged `coverage: none` and is verified at the manual-test gate — it is deliberately NOT
 * automated here, in either direction.
 *
 * No axe scan here: the epic's accessibility baseline is a real-browser scan in story 2's
 * spec (architecture.md § Playwright spec conventions #8), and story 5 has no accessibility
 * criterion of its own.
 *
 * Implementation contract this spec asserts (read this before implementing):
 * 1. `/habitats` exists as a page inside the SAME shared shell as `/` — the navigation is
 *    still present after arriving.
 * 2. The current section is conveyed by `aria-current="page"` on the active nav link, the
 *    convention story 2 established, because that is what tells assistive technology "you
 *    are here" — a colour-only highlight would not. Exactly one link carries it at a time.
 * 3. Each habitat's name appears as text on the screen. This spec deliberately does NOT
 *    assert a `table` role or any other markup shape for the habitats screen: how the
 *    read-only reference is presented is AC-5's design question, and pinning it here would
 *    pre-empt that judgement.
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { expect, test } from '@playwright/test';

import { createHabitats } from '../src/mocks/data/habitat';
import { mockAnimals, mockHabitats } from './fixtures/api-mocks';

import type { Locator, Page } from '@playwright/test';

/** The canonical habitat set the mocked `/api/habitats` handler serves: three habitats. */
const HABITATS = createHabitats();

/**
 * Every habitat's name, narrowed to `string` — the generated `HabitatRead` marks all fields
 * optional (the API spec declares no `required:`), so this filter is a type narrowing, not a
 * tolerance for missing data.
 */
const HABITAT_NAMES = HABITATS.map((habitat) => habitat.Name).filter(
  (name): name is string => typeof name === 'string',
);

/** The shared shell's navigation, present on every screen in the epic. */
function nav(page: Page): Locator {
  return page.getByRole('navigation');
}

function animalsLink(page: Page): Locator {
  return nav(page).getByRole('link', { name: 'Animals', exact: true });
}

function habitatsLink(page: Page): Locator {
  return nav(page).getByRole('link', { name: 'Habitats', exact: true });
}

/**
 * One habitat, located by its name anywhere in the page content — table cell, card title or
 * definition term all satisfy this, which is the point (see contract #3 above).
 */
function habitatEntry(page: Page, habitatName: string): Locator {
  return page.getByRole('main').getByText(habitatName, { exact: true });
}

/**
 * Serve BOTH screens' data before the first navigation. Every test here crosses the roster
 * and the habitats list, so both handlers are always installed — an un-mocked one would fall
 * through to the real Linx backend.
 */
async function mockBothScreens(page: Page): Promise<void> {
  await mockAnimals(page);
  await mockHabitats(page);
}

/**
 * Assert the shared shell marks exactly one section as current: the named one carries
 * `aria-current="page"` and the other does not.
 */
async function expectCurrentSection(
  page: Page,
  section: 'Animals' | 'Habitats',
): Promise<void> {
  const current = section === 'Animals' ? animalsLink : habitatsLink;
  const other = section === 'Animals' ? habitatsLink : animalsLink;

  await expect(current(page)).toHaveAttribute('aria-current', 'page');
  await expect(other(page)).not.toHaveAttribute('aria-current', 'page');
}

test.describe('Epic zoo-animal-manager, Story 5: Habitats reference list (read-only)', () => {
  // AC-1 — the outward trip.
  test('following the Habitats navigation entry from the roster opens the habitats reference list with Habitats current', async ({
    page,
  }) => {
    await mockBothScreens(page);

    await page.goto('/');

    // Wait for the roster to finish loading before clicking, so the click lands on a
    // hydrated shell rather than racing the loading placeholder. Story 2's locator.
    await expect(
      page.getByRole('table').getByRole('cell', { name: 'Anaya' }),
    ).toBeVisible();
    // Animals is current on the way in — the state this navigation has to change.
    await expectCurrentSection(page, 'Animals');

    // The actual navigation, not a direct visit to `/habitats`: story 2 deliberately left
    // its Habitats nav entry pointing at a route that did not exist yet, so this click is
    // the thing story 5 makes work.
    await habitatsLink(page).click();

    await expect(page).toHaveURL('/habitats');

    // Arrival proved by the DATA, not just the URL: these names can only have come from the
    // intercepted `/api/habitats` response, so this also confirms the fetch is browser-side.
    for (const habitatName of HABITAT_NAMES) {
      await expect(habitatEntry(page, habitatName)).toBeVisible();
    }

    // The shell came along, and the current section moved with the navigation.
    await expect(nav(page)).toBeVisible();
    await expectCurrentSection(page, 'Habitats');
  });

  // AC-1 — the return trip. The round trip is what the shared shell exists for, and a
  // current-section indicator that sticks on Habitats is a real regression a one-way test
  // would miss entirely.
  test('following the Animals navigation entry back from the habitats screen returns to the roster with Animals current', async ({
    page,
  }) => {
    await mockBothScreens(page);

    await page.goto('/habitats');

    await expect(habitatEntry(page, 'Savannah')).toBeVisible();
    await expectCurrentSection(page, 'Habitats');

    await animalsLink(page).click();

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('table').getByRole('cell', { name: 'Anaya' }),
    ).toBeVisible();
    await expectCurrentSection(page, 'Animals');
  });
});
