/**
 * Story Metadata:
 * - Route: /animals/[id]
 * - Target File: web/src/app/animals/[id]/page.tsx
 * - Page Action: create_new
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never
 *   uses the real `API_KEY`
 *   (testing-policy.md § "Playwright runs against mocks, never live").
 * - Interception is via `page.route()` on the app's OWN route handlers — the animal list
 *   (`/api/animals`) and the single record (`/api/animals/{Id}`) — through the shared
 *   interceptors in `./fixtures/api-mocks`, which this story extended with `mockAnimal()`,
 *   `mockAnimalEmptyResponse()` and `mockAnimalFailure()` (architecture.md § Playwright spec
 *   conventions #7). NEVER the Linx base URL
 *   (`http://localhost:10002/crud-patterns/**`): that call is made from the Next.js server
 *   tier, which `page.route()` cannot see, so routing it would match nothing and let this
 *   spec reach the real backend (architecture.md Decision 1).
 * - Implementation pattern this REQUIRES: the detail page's fetch of `/api/animals/{Id}`
 *   must happen BROWSER-side — a `"use client"` component reading through the API client
 *   layer (architecture.md Decision 1). `page.route()` cannot intercept a server-component
 *   fetch or a Server Action, and `web/src/mocks/` is data-only (no MSW handlers are
 *   wired), so a server-side read would fall through to the live backend and these tests
 *   would not pass.
 * - Response bodies come from the shared factories (`../src/mocks/data/animal`,
 *   `../src/mocks/data/write-result`) via the fixtures module, imported by RELATIVE path —
 *   never the `@/` alias, which Playwright's runtime does not resolve — so this layer
 *   cannot drift from the Vitest layer.
 * - No cookie/storage assumptions, and no auth chain to mock: this project has no login, no
 *   session and no userinfo endpoint (project.md §Authentication, brief BR15).
 *
 * E2E spec for Epic zoo-animal-manager, Story 4: Animal detail view.
 *
 * Covers the two `playwright`-tagged criteria — both are real navigation, which is why they
 * are here rather than in jsdom:
 * - AC-1 — selecting an animal FROM THE ROSTER opens that animal's own page showing every
 *   recorded field, with a way back to the roster that works.
 * - AC-5 — an animal that does not exist (or was already removed) shows a clear
 *   "not found" state with a way back — never blank fields, never a crash.
 *
 * AC-2 (`LastChangedDate` rendered verbatim, no second time-zone conversion), AC-3
 * (`LastChangedUser` labelled as a fixed system value, never per-person attribution) and
 * AC-4 (loading placeholder / retryable failure) are tagged `vitest` and live in
 * `web/src/__tests__/integration/epic-zoo-animal-manager-story-4-animal-detail.test.tsx`
 * — deliberately not duplicated here.
 *
 * The epic's axe baseline is story 2's spec (architecture.md § Playwright spec conventions
 * #8) and is not repeated for this route.
 *
 * ── Implementation contract this spec asserts (read before implementing) ──
 * 1. Each roster row contains a real anchor whose accessible name is the animal's `Name`
 *    and whose `href` is `/animals/{Id}` — a row-level `onClick` with no anchor would fail
 *    the `href` assertion, and would not be keyboard reachable.
 * 2. The detail page renders the animal's `Name` as a heading, and its remaining recorded
 *    fields as a description list: a `<dt>` label with the value in the `<dd>` that follows
 *    it. That gives every value a label to be asserted against (and reads correctly to a
 *    screen reader). The label patterns below are exactly the ones the Vitest file for this
 *    story pins — kept identical on purpose, so satisfying one layer cannot break the other:
 *    `/^species\b/i`, `/^age\b/i`, `/^habitat\b/i`, `/^diet\b/i`,
 *    `/^last (changed|updated)\b/i` (the timestamp) and `/^system\b/i` (the
 *    `LastChangedUser` value, e.g. "System source"). Each must match exactly one label. How
 *    those last two READ — a fixed system value, never per-person attribution (BR14) — is
 *    AC-3's contract in Vitest, not this spec's.
 * 3. Both the detail page and the not-found state contain exactly ONE link back to the
 *    roster inside `main`, with `href="/"` (the roster is the root route — there is no
 *    `/animals` index) and an accessible name mentioning back / roster / animals.
 * 4. **Not-found rule.** The single-animal read has no clean 404 (brief BR9/R14), so the
 *    page decides from the BODY, not the status: any response that is not a usable
 *    `AnimalRead` — an empty object, or a `DefaultResponse` envelope (it carries
 *    `MessageType`), including on HTTP 500 — is "animal not found". A successful read is an
 *    unwrapped `AnimalRead` (BR8), so an envelope on this endpoint can only mean the record
 *    was not read. Note the API client THROWS on a non-ok response, carrying `statusCode`
 *    and the envelope's `Messages` in `details` — the page must inspect what it caught
 *    rather than treating every rejection as the generic failure state.
 *    The retryable failed-to-load state (AC-4) is for transport-level failures — refused
 *    connection, unparseable body — a genuinely different state.
 * 5. The not-found state shows a heading matching /not found/i, renders NO record fields
 *    (no `<dt>`, no field labels), and never puts `undefined` / `null` / `NaN` or raw
 *    backend/database text on screen.
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { expect, test } from '@playwright/test';

import { createAnimals } from '../src/mocks/data/animal';
import { createWriteError } from '../src/mocks/data/write-result';
import {
  mockAnimal,
  mockAnimalEmptyResponse,
  mockAnimalFailure,
  mockAnimals,
} from './fixtures/api-mocks';

import type { AnimalRead } from '../src/types/api-generated';
import type { Locator, Page } from '@playwright/test';

/** The canonical four-animal roster the roster screen is served. */
const ROSTER = createAnimals();

/**
 * Pull one animal out of the canonical roster, so the row the test clicks and the record the
 * detail endpoint returns can never describe different animals. Throws rather than returning
 * `undefined`, so a fixture rename fails loudly here instead of producing a spec that
 * asserts on nothing.
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

/** Kaya — Bengal Tiger, 6, Rainforest, Carnivore, last changed 2026-07-02 13:20:05. */
const ANIMAL = animalNamed('Kaya');

/** Where that animal's row must lead. */
const DETAIL_PATH = `/animals/${String(ANIMAL.Id)}`;

/**
 * An `Id` no animal in the canonical roster has — the missing/already-removed case.
 */
const MISSING_ANIMAL_PATH = '/animals/9999';

/**
 * Kaya's recorded values, spelled out rather than read off the fixture: the generated
 * `AnimalRead` marks every field optional (the API spec declares no `required:`), so
 * threading `| undefined` into each assertion would let a missing value quietly assert
 * nothing. If the fixture ever changed, these assertions fail loudly — which is the
 * intended outcome, since the mock body IS the fixture.
 */
const EXPECTED = {
  name: 'Kaya',
  species: 'Bengal Tiger',
  habitat: 'Rainforest',
  diet: 'Carnivore',
  lastChangedUser: 'Animal Manager',
  lastChangedDate: '2026-07-02 13:20:05',
} as const;

/**
 * The raw database text the failure envelope carries. Taken from the shared fixture so it
 * cannot drift: the not-found state must never surface it (brief BR11 — raw backend text is
 * never the user-facing message).
 */
const RAW_BACKEND_MESSAGES = createWriteError().Messages;

/** Anything that would betray a missing value rendered straight into the page. */
const PLACEHOLDER_VALUE = /\b(undefined|null|NaN)\b/;

/** The roster's data rows — the header row is excluded by its `columnheader` cells. */
function rosterRows(page: Page): Locator {
  return page
    .getByRole('table')
    .getByRole('row')
    .filter({ hasNot: page.getByRole('columnheader') });
}

/**
 * The value shown against a field label in the detail view's description list.
 *
 * Located by the LABEL's own text, never by position, so re-ordering fields cannot break
 * these assertions and a wrong label-to-value pairing cannot pass. `following-sibling::dd[1]`
 * is the `<dl>` pairing rule, and holds whether each `<dt>`/`<dd>` sits flat in the list or
 * is wrapped in a per-field element — they stay siblings either way.
 */
function fieldValue(page: Page, label: RegExp): Locator {
  return page
    .getByRole('main')
    .locator('dt')
    .filter({ hasText: label })
    .locator('xpath=following-sibling::dd[1]');
}

/** The single link back to the roster, inside the page's own content. */
function backToRoster(page: Page): Locator {
  return page
    .getByRole('main')
    .getByRole('link', { name: /back|roster|animals/i });
}

/**
 * Assert the not-found state: it stayed on the requested address (a silent bounce to the
 * roster is NOT this requirement), says clearly that the animal was not found, offers the
 * way back — and renders no record at all, blank or otherwise.
 */
async function expectNotFoundState(page: Page, path: string): Promise<void> {
  const main = page.getByRole('main');

  await expect(page).toHaveURL(path);
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();

  // No record fields — the whole point of AC-5 is that this is not a row of blanks. With
  // the description-list contract, zero `<dt>` means zero field rows; the label checks
  // catch a blank record rendered some other way.
  await expect(main.locator('dt')).toHaveCount(0);
  await expect(main.getByText(/\bspecies\b/i)).toHaveCount(0);
  await expect(main.getByText(/\bdiet\b/i)).toHaveCount(0);
  await expect(main.getByText(PLACEHOLDER_VALUE)).toHaveCount(0);

  // The way back is part of the criterion, not a nicety.
  await expect(backToRoster(page)).toHaveCount(1);
  await expect(backToRoster(page)).toHaveAttribute('href', '/');
}

test.describe('Epic zoo-animal-manager, Story 4: Animal detail view', () => {
  // AC-1
  test('selecting an animal from the roster opens its own page with every recorded field, and the way back returns to the roster', async ({
    page,
  }) => {
    await mockAnimals(page, ROSTER);
    await mockAnimal(page, ANIMAL);

    // Reached FROM the roster, not by typing the address — "selected from the list" is part
    // of the requirement (R12), and it is the roster's row link that this proves exists.
    await page.goto('/');
    await expect(rosterRows(page)).toHaveCount(ROSTER.length);

    const animalLink = rosterRows(page)
      .filter({ hasText: EXPECTED.name })
      .getByRole('link', { name: EXPECTED.name });
    await expect(animalLink).toHaveAttribute('href', DETAIL_PATH);
    await animalLink.click();

    await expect(page).toHaveURL(DETAIL_PATH);

    // Every recorded field for THIS animal. Each value is scoped to its own label's `<dd>`,
    // so a value shown against the wrong field fails — and `Age` is not matched as loose
    // text anywhere on the page.
    await expect(
      page.getByRole('heading', { name: EXPECTED.name }),
    ).toBeVisible();
    await expect(fieldValue(page, /^species\b/i)).toHaveText(EXPECTED.species);
    // Tolerates presentation around the number ("6 years") while still pinning the value —
    // the same latitude the Vitest layer allows.
    await expect(fieldValue(page, /^age\b/i)).toHaveText(/\b6\b/);
    await expect(fieldValue(page, /^habitat\b/i)).toHaveText(EXPECTED.habitat);
    await expect(fieldValue(page, /^diet\b/i)).toHaveText(EXPECTED.diet);

    // The last-changed trail, asserted through its own labels so a value shown against the
    // wrong field cannot pass. WHAT the labels say — a fixed system value, never per-person
    // attribution (BR14) — is AC-3's contract in Vitest. The timestamp is the backend's
    // pre-formatted SAST text, character for character (BR13).
    await expect(fieldValue(page, /^last (changed|updated)\b/i)).toHaveText(
      EXPECTED.lastChangedDate,
    );
    await expect(fieldValue(page, /^system\b/i)).toHaveText(
      EXPECTED.lastChangedUser,
    );

    // ...and a way back that actually lands on the roster, with the roster reloaded.
    await expect(backToRoster(page)).toHaveCount(1);
    await backToRoster(page).click();

    await expect(page).toHaveURL('/');
    await expect(rosterRows(page)).toHaveCount(ROSTER.length);
  });

  // AC-5
  test('an animal that does not exist shows a not-found state with a way back, for either answer this backend can give', async ({
    page,
  }) => {
    // "Never a crash" asserted directly: any uncaught exception in the page lands here.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await mockAnimals(page, ROSTER);

    // The single-animal read has no not-found branch in the Linx solution (BR9), so which
    // of these the real backend produces is UNVERIFIED — both are exercised deliberately,
    // because the not-found state must not depend on guessing right. Confirm the real
    // response while building and keep whichever this becomes.

    // Answer 1 — HTTP 200 with an empty object: the read found nothing and said nothing.
    await mockAnimalEmptyResponse(page);
    await page.goto(MISSING_ANIMAL_PATH);
    await expectNotFoundState(page, MISSING_ANIMAL_PATH);

    // The way back works from here, not merely present.
    await backToRoster(page).click();
    await expect(page).toHaveURL('/');
    await expect(rosterRows(page)).toHaveCount(ROSTER.length);

    // Answer 2 — HTTP 500 carrying a `DefaultResponse` envelope (BR11: this backend never
    // returns a conventional 4xx). Registered after Answer 1, so it wins for the
    // single-record route. The API client throws for this response, so reaching the
    // not-found state means the page inspected what it caught instead of falling into the
    // generic failure state.
    await mockAnimalFailure(page);
    await page.goto(MISSING_ANIMAL_PATH);
    await expectNotFoundState(page, MISSING_ANIMAL_PATH);

    // The envelope's raw database text is never what the user reads.
    for (const rawMessage of RAW_BACKEND_MESSAGES) {
      await expect(page.getByText(rawMessage)).toHaveCount(0);
    }

    expect(pageErrors).toEqual([]);
  });
});
