/**
 * Story Metadata:
 * - Route: /animals/new
 * - Target File: web/src/components/animals/AnimalForm.tsx
 * - Page Action: modify_existing
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never uses
 *   the real `API_KEY` (testing-policy.md § "Playwright runs against mocks, never live").
 * - **This is a WRITE spec.** `dataSource` is `existing-api` with no MSW runtime layer, so a
 *   single missed interception does not merely fail a test — the POST travels through the app's
 *   own route handler to Linx and INSERTS A ROW INTO THE USER'S REAL DATABASE. Three defences,
 *   all mandatory and all copied from stories 6 and 7 rather than reinvented:
 *   1. `abortUnmatchedApiRequests(page)` is installed FIRST. Playwright matches handlers in
 *      reverse registration order, so registering it first makes it the LAST resort: anything
 *      under `/api/**` that the specific interceptors miss is aborted loudly instead of
 *      reaching the backend.
 *   2. `mockAnimalCreate()` intercepts `POST /api/animals` — the app's own list route, matched
 *      on `method === 'POST'` — and passes every other method on with `route.fallback()`, so a
 *      roster GET can never be answered with a write envelope (brief BR8).
 *   3. The Linx base URL (`http://localhost:10002/crud-patterns/**`) is NEVER routed. That call
 *      is made from the Next.js server tier, which `page.route()` cannot see, so routing it
 *      would match nothing and produce a spec that silently mutates production data
 *      (architecture.md Decision 1).
 *   `watchForUnmockedWrites()` below closes the one hole those three cannot: a Next.js Server
 *   Action posts to the PAGE url (`/animals/new`), not `/api/**`, so a form implemented that way
 *   would sail past every interceptor and really create the row. It is detection rather than
 *   prevention, but it names the failure instead of leaving a green-yet-wrong spec.
 * - **The refusal is served with HTTP 200, not 500 — this is deliberate and binding**
 *   (architecture.md Decision 3). The app's own route handler always answers a write with HTTP
 *   200 carrying the `DefaultResponse` envelope verbatim, whatever status Linx used, because
 *   Linx returns 500 for business rejections, technical failures *and* sometimes success, so its
 *   status carries no information (Decision 2). Passing it through would make the API client
 *   *throw*, and the caller would have to dig the envelope out of an error object to tell a
 *   fixable duplicate name from a database fault. So on the browser side the write promise
 *   **resolves** and the caller branches on `MessageType`. `mockAnimalCreate(page, DUPLICATE)`
 *   with the helper's default status 200 is therefore correct; passing 500 would test a contract
 *   this app does not have.
 * - Implementation pattern this REQUIRES (architecture.md Decision 1): the create must be a
 *   BROWSER-side request through the API client to the app's own `/api/animals` route — a
 *   `"use client"` form. **Do not implement this save as a Server Action.**
 * - Response bodies come from the shared factories (`../src/mocks/data/animal`,
 *   `../src/mocks/data/habitat`, `../src/mocks/data/write-result`) via the fixtures module, by
 *   RELATIVE import — never the `@/` alias, which Playwright's runtime does not resolve — so
 *   this layer cannot drift from the Vitest layer. The asserted warning wording is read back out
 *   of the fixture rather than typed a second time, so this spec cannot assert text the mock
 *   never sent.
 * - No auth chain, no cookie clearing, no credential fixtures: this project has no login, no
 *   session and no userinfo endpoint (project.md §Authentication, brief BR15).
 *
 * E2E spec for Epic zoo-animal-manager, Story 8: Handling refused saves.
 *
 * Covers the ONE criterion tagged `playwright`:
 * - AC-1 — saving an animal whose name already exists shows a recoverable warning against the
 *   Name field, keeps every value the user typed, and neither navigates away nor clears the
 *   form. It is here rather than in jsdom because it is a whole-journey property: roster → form
 *   → refused write → still on the form with the work intact, with no document load anywhere.
 *
 * AC-2 (the identical warning when editing), AC-3 (a duplicate reads as a business rejection,
 * distinct from a technical failure), AC-4 (a technical failure shows a readable primary message
 * rather than raw backend text, with retry) and AC-5 (retry resubmits without re-typing) are
 * jsdom-observable and live in
 * `web/src/__tests__/integration/epic-zoo-animal-manager-story-8-refused-saves.test.tsx`
 * — deliberately not duplicated here.
 *
 * No axe scan: the epic's accessibility baseline is a real-browser scan in story 2's spec
 * (architecture.md § Playwright spec conventions #8).
 *
 * ── Implementation contract this spec asserts (read before implementing) ──
 * 1. **The write promise RESOLVES with the envelope; branch on `MessageType`** in the backend's
 *    own casing — `Success` / `Warning` / `Error` — never on HTTP status (Decision 2/3, story 6
 *    contract #8). Only `Success` navigates.
 * 2. **A `Warning` is reported against the NAME entry, using the same wiring stories 6 and 7
 *    pinned for validation messages:** the Name control carries `aria-invalid="true"` and the
 *    message is that control's accessible description (`aria-describedby`). With react-hook-form
 *    + Shadcn's `FormControl`/`FormMessage` this is `setError('Name', { message })` — no new
 *    field-error mechanism, and not *only* a floating toast, which conveys no field association.
 * 3. **The wording is the backend's own `Messages[0]`** — "Animal already exists" — shown to the
 *    user, not replaced by invented text. (A technical `Error` is the opposite case: AC-4 forbids
 *    the raw database string as the primary message. The two branches read differently on
 *    purpose; that contrast is AC-3's, and lives in the Vitest file.)
 * 4. **Nothing the user typed is lost and nothing navigates.** No `router.push`/`router.replace`,
 *    no form reset, no swapping the form out for a full-page error screen. The user stays on
 *    `/animals/new` with all five entries as they left them, including the chosen habitat.
 * 5. **The submit control is enabled again** once the refusal comes back, so the user can fix the
 *    name and retry (NFR-2, story 6 contract #9 — a refused save must not leave a dead form).
 * 6. **Nothing is added to any client-side roster cache on a refusal.** The animal was not
 *    created, so returning to the roster must show the same rows as before — an optimistic
 *    append that is never rolled back fails the row-count assertion at the end of this test.
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { expect, test } from '@playwright/test';

import { createAnimals } from '../src/mocks/data/animal';
import { createHabitats } from '../src/mocks/data/habitat';
import { createDuplicateWarning } from '../src/mocks/data/write-result';
import {
  abortUnmatchedApiRequests,
  mockAnimalCreate,
  mockAnimals,
  mockHabitats,
} from './fixtures/api-mocks';

import type { Locator, Page } from '@playwright/test';

/** The canonical four-animal roster the backend serves — before and after the refusal alike. */
const ROSTER = createAnimals();

/**
 * Read a populated field off a shared fixture, throwing rather than returning `undefined`.
 *
 * Every field on the generated API types is optional (the spec declares no `required:` arrays),
 * but the shared factories always populate these — so an absent value means the factory changed,
 * and this spec should fail loudly there instead of quietly asserting on nothing.
 */
function fixtureText(value: string | undefined, field: string): string {
  if (value === undefined) {
    throw new Error(`the shared factory no longer populates ${field}`);
  }

  return value;
}

/** Resolve a habitat's id from the shared habitat factory — never a magic number. */
function habitatIdFor(habitatName: string): number {
  const match = createHabitats().find(
    (habitat) => habitat.Name === habitatName,
  );

  if (typeof match?.Id !== 'number') {
    throw new Error(`No habitat named "${habitatName}" in the shared factory`);
  }

  return match.Id;
}

/**
 * A name that ALREADY EXISTS on the roster, taken from the roster fixture itself rather than
 * invented — so the scenario the mocked rejection describes ("Animal already exists") is one the
 * served data actually supports, and the row-count check at the end has a real duplicate to
 * detect. 'Anaya' is the first of the canonical four.
 */
const EXISTING_NAME = fixtureText(ROSTER[0].Name, 'Animals[0].Name');

/**
 * What the user types. Everything except the Name is deliberately DIFFERENT from the existing
 * animal's stored values, so "all five entries survived the refusal" is proved against values
 * that could only have come from this user's typing — not from a form that quietly re-prefilled
 * itself from the roster.
 */
const TYPED = {
  name: EXISTING_NAME,
  species: 'Nile Crocodile',
  age: '4',
  habitat: 'Aquarium',
  diet: 'Carnivore',
} as const;

/**
 * The body the browser must POST: exactly the five writable fields, with `Age` and `HabitatId` as
 * JSON numbers rather than the strings a form control hands you (R17), and no `LastChangedUser`
 * — the server tier injects that as a header (BR3/R5).
 */
const EXPECTED_POST_BODY = {
  Name: TYPED.name,
  Species: TYPED.species,
  Age: Number(TYPED.age),
  HabitatId: habitatIdFor(TYPED.habitat),
  Diet: TYPED.diet,
};

/**
 * The backend's refusal: `MessageType: 'Warning'`, `Messages: ['Animal already exists']`, `Id: 0`
 * because no record was written (BR10). Served with the helper's DEFAULT status 200 — see the
 * Mocking strategy note on Decision 3.
 */
const DUPLICATE = createDuplicateWarning();

/** The backend's OWN wording, read back out of the fixture so the two can never diverge. */
const BACKEND_WARNING = DUPLICATE.Messages[0];

/** HTTP methods that change data. This spec must let none of them escape. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Next.js's own dev/runtime endpoints, which are not the app's API surface. */
const NEXT_INTERNAL_PATH = /^\/(?:_next|__next)/;

/** The one write path this spec mocks; anything else is an escape. */
const MOCKED_WRITE_PATH = '/api/animals';

/**
 * Match a fixture string inside a longer piece of presented text, escaping any regex
 * metacharacters it contains. Used for the accessible description, so the app may add its own
 * guidance around the backend's wording ("Animal already exists — try another name") without
 * failing, while still proving the backend's wording is what the user is shown.
 */
function containing(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/** The roster's data rows — the header row is excluded by its `columnheader` cells. */
function rosterRows(page: Page): Locator {
  return page
    .getByRole('table')
    .getByRole('row')
    .filter({ hasNot: page.getByRole('columnheader') });
}

/** One roster row, located by the animal's name rather than by index. */
function rosterRow(page: Page, animalName: string): Locator {
  return rosterRows(page).filter({ hasText: animalName });
}

/** The roster's route to the add-animal form (story 6's locator). */
function addAnimalAction(page: Page): Locator {
  return page.getByRole('main').getByRole('link', { name: /add animal/i });
}

/** The shared shell's Animals navigation entry (stories 2, 5 and 7). */
function animalsNavLink(page: Page): Locator {
  return page
    .getByRole('navigation')
    .getByRole('link', { name: 'Animals', exact: true });
}

/** The animal form itself — a real `<form>` inside the page's own content (story 6). */
function animalForm(page: Page): Locator {
  return page.getByRole('main').locator('form');
}

/**
 * One text entry, located by its label and scoped to the form, so a control elsewhere on the
 * screen can never satisfy these assertions. Anchored at the start so `Name` cannot match a
 * "Habitat name" label, and left open at the end so a required marker ("Name *") still matches.
 */
function formField(page: Page, label: RegExp): Locator {
  return animalForm(page).getByLabel(label);
}

/**
 * The habitat picker, located by ROLE rather than by label: a `<label for>` does not name a Radix
 * `SelectTrigger` button in the accessibility tree, so the trigger's own accessible name has to
 * carry "habitat" (story 6 contract #4, story 3's roster-filter convention).
 */
function habitatPicker(page: Page): Locator {
  return animalForm(page).getByRole('combobox', { name: /habitat/i });
}

/** The submit control — story 6 names it "Add animal", story 7 "Save changes". */
function submitButton(page: Page): Locator {
  return animalForm(page).getByRole('button', { name: /save|create|add/i });
}

/** The Name control, which the duplicate warning must be attached to. */
function nameField(page: Page): Locator {
  return formField(page, /^name\b/i);
}

/**
 * Assert the habitat picker's CURRENT selection through the listbox itself, then close it again.
 *
 * Opening it and reading which option is selected is the one assertion that holds for both the
 * Radix `Select` story 6 mandates and a plain native `<select>`: Radix focuses the selected item
 * on open (so `aria-selected` resolves true on it) and a native `<option>` exposes its selected
 * state implicitly. Reading the trigger's text instead would pass for a native select regardless
 * of what is actually chosen. Story 7 pinned this same helper.
 */
async function expectHabitatSelected(
  page: Page,
  habitatName: string,
): Promise<void> {
  await expect(habitatPicker(page)).toBeVisible();
  await habitatPicker(page).click();

  const selectedOption = page.getByRole('option', { selected: true });
  await expect(selectedOption).toHaveCount(1);
  await expect(selectedOption).toHaveAccessibleName(habitatName);

  // Close it again, so the listbox cannot swallow a later click.
  await page.keyboard.press('Escape');
  await expect(habitatPicker(page)).toBeVisible();
}

/** Choose a habitat through the real listbox interaction, not by setting a value (story 7). */
async function chooseHabitat(page: Page, habitatName: string): Promise<void> {
  await habitatPicker(page).click();
  await page.getByRole('option', { name: habitatName, exact: true }).click();
}

/**
 * Watch for any mutating request this spec did not mock, and return the live list of them so the
 * test can assert it stayed empty.
 *
 * Story 6's spec carries the same watcher; it is repeated here rather than hoisted into
 * `fixtures/api-mocks.ts` mid-BUILD, because that module is shared by seven specs and this is a
 * per-spec safety assertion rather than an interceptor. It reports both a write that went
 * somewhere unexpected (a Server Action posting to the page url) and one the safety net had to
 * abort.
 */
function watchForUnmockedWrites(page: Page): string[] {
  const escapes: string[] = [];

  page.on('request', (request) => {
    if (!MUTATING_METHODS.has(request.method())) {
      return;
    }

    const { pathname } = new URL(request.url());

    if (NEXT_INTERNAL_PATH.test(pathname) || pathname === MOCKED_WRITE_PATH) {
      return;
    }

    escapes.push(`${request.method()} ${pathname} (not mocked by this spec)`);
  });

  page.on('requestfailed', (request) => {
    if (!MUTATING_METHODS.has(request.method())) {
      return;
    }

    const { pathname } = new URL(request.url());
    escapes.push(`${request.method()} ${pathname} (aborted by the safety net)`);
  });

  return escapes;
}

test.describe('Epic zoo-animal-manager, Story 8: Handling refused saves', () => {
  // AC-1
  test('saving an animal whose name already exists warns against the Name field, keeps every typed value, and neither navigates away nor clears the form', async ({
    page,
  }) => {
    // A full document load pushes a `load` event; client-side navigation pushes none. Recorded
    // as paths so a failure says WHERE the unexpected load happened. Exactly one — the initial
    // visit — is the proof that the refusal neither navigated nor produced a full-page error
    // screen.
    const documentLoads: string[] = [];
    page.on('load', () => documentLoads.push(new URL(page.url()).pathname));

    // Installed FIRST so it is consulted LAST: anything the interceptors below miss is aborted
    // rather than reaching the real backend and inserting a row.
    await abortUnmatchedApiRequests(page);
    const unmockedWrites = watchForUnmockedWrites(page);
    await mockAnimals(page, ROSTER);
    await mockHabitats(page);
    // Registered AFTER `mockAnimals` so the POST reaches it first while roster GETs still fall
    // through. No `rosterAfterCreate` is passed, deliberately: the create is REFUSED, so the
    // backend's roster never changes, and the row-count check at the end is meaningful.
    // Status is the helper's default 200 (Decision 3) — the promise resolves, carrying a
    // `Warning` envelope, and the form branches on `MessageType`.
    const creates = await mockAnimalCreate(page, DUPLICATE);

    // The whole journey, starting where the user starts.
    await page.goto('/');
    await expect(rosterRows(page)).toHaveCount(ROSTER.length);

    await addAnimalAction(page).click();
    await expect(page).toHaveURL('/animals/new');

    // All five entries, filled the way a user fills them.
    await nameField(page).fill(TYPED.name);
    await formField(page, /^species\b/i).fill(TYPED.species);
    await formField(page, /^age\b/i).fill(TYPED.age);
    await formField(page, /^diet\b/i).fill(TYPED.diet);
    await chooseHabitat(page, TYPED.habitat);

    await submitButton(page).click();

    // ── (1) The backend's OWN wording is shown ──────────────────────────────────────────────
    // Read straight back out of the mocked envelope, so invented text cannot pass. `.first()`
    // tolerates the app ALSO announcing it through the shared toast channel — AC-1 requires the
    // message to be attached to the Name field, not that it appear only once.
    await expect(page.getByText(BACKEND_WARNING).first()).toBeVisible();

    // ── (2) ...against the NAME entry, not as a floating message ────────────────────────────
    // The same wiring stories 6 and 7 pinned for validation messages: the offending control is
    // marked invalid and the message is ITS accessible description. A toast alone would satisfy
    // (1) and fail here, correctly — it tells the user nothing about which field to fix.
    await expect(nameField(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(nameField(page)).toHaveAccessibleDescription(
      containing(BACKEND_WARNING),
    );

    // ── (3) Every value the user typed is still there ───────────────────────────────────────
    // Each read through its own label, so a value re-rendered against the wrong field fails.
    // The habitat is checked as a SELECTION, not as text that happens to be on screen.
    await expect(nameField(page)).toHaveValue(TYPED.name);
    await expect(formField(page, /^species\b/i)).toHaveValue(TYPED.species);
    await expect(formField(page, /^age\b/i)).toHaveValue(TYPED.age);
    await expect(formField(page, /^diet\b/i)).toHaveValue(TYPED.diet);
    await expectHabitatSelected(page, TYPED.habitat);

    // ── (4) Nowhere was navigated and no full-page error replaced the form ──────────────────
    await expect(page).toHaveURL('/animals/new');
    await expect(animalForm(page)).toBeVisible();
    // One document load for the whole journey: the initial visit to the roster. A hard
    // navigation or an error page swap would add a second.
    expect(documentLoads).toEqual(['/']);

    // ── (5) The refusal is recoverable: the user can fix the name and try again ─────────────
    // Story 6 pinned that the submit control disables while the write is open (NFR-2); leaving
    // it disabled after a refusal would strand the user on a dead form.
    await expect(submitButton(page)).toBeEnabled();

    // ── (6) What actually went on the wire ──────────────────────────────────────────────────
    // One `toEqual` over the captured bodies pins both "exactly one POST was sent" — no retry
    // storm and no double submit off the back of the refusal — and "these five fields with
    // these values", with `Age` and `HabitatId` as JSON numbers and no `LastChangedUser`. It
    // also proves the warning came from the RESPONSE rather than from client-side validation
    // that never sent anything.
    expect(creates.map((create) => create.body)).toEqual([EXPECTED_POST_BODY]);

    // Hermeticity, asserted rather than assumed: the only mutating request the browser made was
    // the mocked POST to `/api/animals`. Anything else means a write reached the real database
    // (see the Mocking strategy note on Server Actions).
    expect(unmockedWrites).toEqual([]);

    // ── (7) ...and no animal was created ────────────────────────────────────────────────────
    // Leaving the form is the user's own choice, made only after everything above is asserted.
    // The roster is unchanged: the same four rows, and still exactly ONE row for the name that
    // was rejected. An optimistic append that is never rolled back fails both counts.
    await animalsNavLink(page).click();
    await expect(page).toHaveURL('/');
    await expect(rosterRows(page)).toHaveCount(ROSTER.length);
    await expect(rosterRow(page, EXISTING_NAME)).toHaveCount(1);
  });
});
