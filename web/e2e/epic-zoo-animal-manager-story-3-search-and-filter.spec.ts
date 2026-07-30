/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/page.tsx
 * - Page Action: modify_existing
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and
 *   never uses the real `API_KEY`
 *   (testing-policy.md § "Playwright runs against mocks, never live").
 * - Interception is via `page.route()` on the app's OWN route handlers —
 *   `**\/api\/animals**` and `**\/api\/habitats**` — through the shared interceptors in
 *   `./fixtures/api-mocks` that story 2 created (architecture.md § Playwright spec
 *   conventions #7). NEVER the Linx base URL (`http://localhost:10002/crud-patterns/**`):
 *   that call is made from the Next.js server tier, which `page.route()` cannot see, so
 *   routing it would match nothing and let this spec reach the real backend
 *   (architecture.md Decision 1).
 * - Implementation pattern this implies: the roster's fetch of `/api/animals` must happen
 *   browser-side (a client-component fetch), because `page.route()` cannot intercept a
 *   Server Action or a server-component fetch. Story 2 already establishes this.
 * - Response bodies come from the shared entity factories (`../src/mocks/data/animal`),
 *   imported by RELATIVE path — never the `@/` alias, which Playwright's runtime does not
 *   resolve — so this layer cannot drift from the Vitest layer.
 * - There is no auth chain to mock: this project has no login, no session and no userinfo
 *   endpoint (project.md §Authentication, brief BR15). No cookie clearing, no credential
 *   fixtures.
 *
 * E2E spec for Epic zoo-animal-manager, Story 3: Search and habitat filter on the roster.
 *
 * Covers the three acceptance criteria tagged `playwright` — the live interaction:
 * AC-1 (search narrows by name or species, as you type, no page reload), AC-2 (habitat
 * filter narrows, and offers only habitats present in the loaded roster) and AC-3 (search
 * and habitat filter intersect, and clearing both restores the full roster).
 * AC-4 ("no matches" wording) and AC-5 (no extra data load) are tagged `vitest` and live in
 * `web/src/__tests__/integration/epic-zoo-animal-manager-story-3-search-and-filter.test.tsx`
 * — deliberately not duplicated here.
 *
 * Implementation contract this spec asserts (read this before implementing — see also
 * `web/e2e/README.md`):
 * 1. The search input has an accessible name containing "search" (a visible `<Label>` or
 *    `aria-label`), so it is reachable by `getByLabel(/search/i)` whether it is rendered as
 *    `<input type="text">` (role `textbox`) or `<input type="search">` (role `searchbox`).
 * 2. The habitat filter exposes `role="combobox"` with an accessible name containing
 *    "habitat", and opens a list of `role="option"` items — the Shadcn `Select` shape the
 *    story mandates. Its option list contains ONLY habitat names present in the loaded
 *    roster, plus one reset option whose accessible name contains "All".
 * 3. Matching is case-insensitive substring matching on Name and Species: a user typing
 *    `tiger` finds `Bengal Tiger`.
 * 4. Narrowing is client-side over the already-loaded roster: no document load, and the
 *    typed search term survives filtering.
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { expect, test } from '@playwright/test';

import { createAnimals } from '../src/mocks/data/animal';
import { mockAnimals, mockHabitats } from './fixtures/api-mocks';

import type { Locator, Page } from '@playwright/test';

/**
 * The canonical roster: Anaya (African Elephant, Savannah), Kaya (Bengal Tiger,
 * Rainforest), Nimbus (Green Sea Turtle, Aquarium), Zuri (Scarlet Macaw, Rainforest).
 *
 * Two animals share Rainforest, which is what lets a habitat filter assert a
 * two-row result rather than the weaker single-row case.
 */
const ROSTER = createAnimals();

/**
 * Every animal's name, narrowed to `string` — the generated `AnimalRead` marks all fields
 * optional (the spec declares no `required:`), so this filter is a type narrowing, not a
 * tolerance for missing data. If a factory name ever went missing, the length assertions
 * below would fail loudly rather than silently checking fewer rows.
 */
const ROSTER_NAMES = ROSTER.map((animal) => animal.Name).filter(
  (name): name is string => typeof name === 'string',
);

/**
 * The same roster with the only Aquarium animal (Nimbus) removed.
 *
 * `Aquarium` still exists in the habitat list the backend serves — `mockHabitats()` returns
 * all three — so a filter that offers `Aquarium` here can only have got it from a habitat
 * fetch, not from the roster. That is exactly what AC-2's second half forbids.
 */
const ROSTER_WITHOUT_AQUARIUM = ROSTER.filter(
  (animal) => animal.HabitatName !== 'Aquarium',
);

/** The roster's data rows — the header row is excluded by its `columnheader` cells. */
function rosterRows(page: Page): Locator {
  return page
    .getByRole('table')
    .getByRole('row')
    .filter({ hasNot: page.getByRole('columnheader') });
}

/** The single data row for one animal, located by its name rather than by index. */
function rosterRow(page: Page, animalName: string): Locator {
  return rosterRows(page).filter({ hasText: animalName });
}

function searchBox(page: Page): Locator {
  return page.getByLabel(/search/i);
}

function habitatFilter(page: Page): Locator {
  return page.getByRole('combobox', { name: /habitat/i });
}

/** Choose a habitat through the real listbox interaction, not by setting a value. */
async function chooseHabitat(
  page: Page,
  optionName: string | RegExp,
): Promise<void> {
  await habitatFilter(page).click();
  await page.getByRole('option', { name: optionName }).click();
}

/**
 * Serve a roster, open the home screen, and wait for it to finish loading — so no
 * assertion below races the loading placeholder.
 */
async function openRoster(
  page: Page,
  animals: typeof ROSTER = ROSTER,
): Promise<void> {
  await mockAnimals(page, animals);
  // Mocked even though this story must not need it: if the filter were wrongly built from
  // a habitat fetch, this keeps the spec hermetic instead of letting it reach Linx.
  await mockHabitats(page);
  await page.goto('/');
  await expect(rosterRows(page)).toHaveCount(animals.length);
}

test.describe('Epic zoo-animal-manager, Story 3: Search and habitat filter on the roster', () => {
  // AC-1
  test('typing in the search box narrows the roster by name or species as you type, with no page reload', async ({
    page,
  }) => {
    // A full document load would push a second entry; client-side narrowing pushes none.
    const documentLoads: string[] = [];
    page.on('load', () => documentLoads.push(page.url()));

    await openRoster(page);

    // Typed character by character, with no Enter and no submit button — narrowing must
    // happen while typing. 'tiger' matches Kaya by SPECIES ('Bengal Tiger'), not by name.
    await searchBox(page).pressSequentially('tiger');

    await expect(rosterRows(page)).toHaveCount(1);
    await expect(rosterRow(page, 'Kaya')).toBeVisible();
    await expect(rosterRow(page, 'Anaya')).toHaveCount(0);
    await expect(rosterRow(page, 'Nimbus')).toHaveCount(0);
    await expect(rosterRow(page, 'Zuri')).toHaveCount(0);

    // 'nimb' matches Nimbus by NAME — the other half of "name or species".
    await searchBox(page).fill('nimb');

    await expect(rosterRows(page)).toHaveCount(1);
    await expect(rosterRow(page, 'Nimbus')).toBeVisible();
    await expect(rosterRow(page, 'Kaya')).toHaveCount(0);

    // The typed term surviving, the URL being unchanged, and no second document load are
    // three independent proofs that the narrowing happened in the browser.
    await expect(searchBox(page)).toHaveValue('nimb');
    await expect(page).toHaveURL('/');
    expect(documentLoads).toHaveLength(1);
  });

  // AC-2
  test('the habitat filter offers only the habitats present in the loaded roster, and narrows to the chosen one', async ({
    page,
  }) => {
    await openRoster(page, ROSTER_WITHOUT_AQUARIUM);

    await habitatFilter(page).click();

    await expect(page.getByRole('option', { name: 'Savannah' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Rainforest' })).toBeVisible();
    // Aquarium is in the habitat list this backend serves, but no LOADED animal lives
    // there — so it must not be offered. Choices come from the roster, which is why this
    // story needs no habitat fetch and has no dependency on story 5.
    await expect(page.getByRole('option', { name: 'Aquarium' })).toHaveCount(0);

    await page.getByRole('option', { name: 'Rainforest' }).click();

    // Rainforest holds two of the three loaded animals: Kaya and Zuri.
    await expect(rosterRows(page)).toHaveCount(2);
    await expect(rosterRow(page, 'Kaya')).toBeVisible();
    await expect(rosterRow(page, 'Zuri')).toBeVisible();
    await expect(rosterRow(page, 'Anaya')).toHaveCount(0);
  });

  // AC-3
  test('a search term and a habitat filter apply together, and clearing both restores the full roster', async ({
    page,
  }) => {
    await openRoster(page);

    // 'aya' spans two habitats — Anaya (Savannah) and Kaya (Rainforest).
    await searchBox(page).fill('aya');
    await expect(rosterRows(page)).toHaveCount(2);
    await expect(rosterRow(page, 'Anaya')).toBeVisible();
    await expect(rosterRow(page, 'Kaya')).toBeVisible();

    // Rainforest alone would leave Kaya AND Zuri; combined with the search only Kaya
    // survives — so this result is narrower than either control on its own.
    await chooseHabitat(page, 'Rainforest');
    await expect(rosterRows(page)).toHaveCount(1);
    await expect(rosterRow(page, 'Kaya')).toBeVisible();
    await expect(rosterRow(page, 'Zuri')).toHaveCount(0);
    await expect(rosterRow(page, 'Anaya')).toHaveCount(0);

    // Clear the search first: the habitat filter is still applied, so Rainforest's two
    // animals come back — not the whole roster.
    await searchBox(page).fill('');
    await expect(rosterRows(page)).toHaveCount(2);
    await expect(rosterRow(page, 'Zuri')).toBeVisible();

    // Reset the habitat filter too, and the full roster returns.
    await chooseHabitat(page, /all/i);
    await expect(rosterRows(page)).toHaveCount(ROSTER.length);
    for (const animalName of ROSTER_NAMES) {
      await expect(rosterRow(page, animalName)).toBeVisible();
    }
  });
});
