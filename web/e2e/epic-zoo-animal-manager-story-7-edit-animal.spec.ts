/**
 * Story Metadata:
 * - Route: /animals/[id]/edit
 * - Target File: web/src/app/animals/[id]/edit/page.tsx
 * - Page Action: create_new
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never
 *   uses the real `API_KEY` (testing-policy.md § "Playwright runs against mocks, never
 *   live").
 * - **This is a WRITE spec, and that raises the stakes.** `dataSource` is `existing-api`
 *   with no MSW runtime layer, so a single missed interception does not just fail a test —
 *   the PUT travels through the app's own route handler to Linx and MODIFIES A ROW IN THE
 *   USER'S REAL DATABASE. Three defences, all mandatory:
 *   1. `abortUnmatchedApiRequests(page)` is installed FIRST in every test here. Playwright
 *      matches handlers in reverse registration order, so it becomes the last resort: any
 *      `/api/**` request the specific interceptors miss is aborted loudly instead of
 *      reaching the backend.
 *   2. `mockAnimalUpdate()` intercepts `PUT /api/animals/{Id}` — the app's OWN detail route,
 *      matched on `method === 'PUT'` — and passes every other method on with
 *      `route.fallback()`, so a GET can never be answered with a write envelope (brief BR8).
 *   3. The Linx base URL (`http://localhost:10002/crud-patterns/**`) is NEVER routed. That
 *      call is made from the Next.js server tier, which `page.route()` cannot see, so
 *      routing it would match nothing and produce a spec that silently hits production data
 *      (architecture.md Decision 1).
 * - Interception is via `page.route()` on the app's own route handlers, through the shared
 *   interceptors in `./fixtures/api-mocks` (architecture.md § Playwright spec conventions
 *   #7), which this story extended with `mockAnimalUpdate()` and
 *   `abortUnmatchedApiRequests()`.
 * - Implementation pattern this REQUIRES (architecture.md Decision 1): both the single-animal
 *   read that prefills the form AND the PUT that saves it must happen BROWSER-side — a
 *   `"use client"` component going through the API client layer. `page.route()` cannot
 *   intercept a Server Action or a server-component fetch, so a Server Action save would
 *   escape every defence above and write to the real database. **Do not implement this save
 *   as a Server Action.**
 * - Response bodies come from the shared factories (`../src/mocks/data/animal`,
 *   `../src/mocks/data/habitat`, `../src/mocks/data/write-result`) by RELATIVE import —
 *   never the `@/` alias, which Playwright's runtime does not resolve — so this layer cannot
 *   drift from the Vitest layer.
 * - No auth chain, no cookie clearing, no credential fixtures: this project has no login, no
 *   session and no userinfo endpoint (project.md §Authentication, brief BR15).
 *
 * E2E spec for Epic zoo-animal-manager, Story 7: Edit an animal.
 *
 * Covers the two criteria tagged `playwright` — both are cross-screen round trips only a real
 * browser can prove:
 * - AC-1 — choosing Edit ON AN ANIMAL (entered from the detail view, which is part of the
 *   requirement) opens the shared form prefilled with that animal's current Name, Species,
 *   Age, Habitat and Diet.
 * - AC-3 — saving shows the BACKEND'S OWN confirmation wording, and the updated values appear
 *   on the animal's page and in the roster with no manual reload. Also pins what went on the
 *   wire: exactly the five writable fields, and no `LastChangedUser` (BR3 — it is a
 *   server-injected header, never a body field and never browser-supplied).
 *
 * AC-2 (the same required-field and Age rules as add), AC-4 (Cancel is non-destructive) and
 * AC-5 (identifier / habitat name / change-tracking values are never editable entries) are
 * jsdom-observable and live in
 * `web/src/__tests__/integration/epic-zoo-animal-manager-story-7-edit-animal.test.tsx`
 * — deliberately not duplicated here.
 *
 * No axe scan: the epic's accessibility baseline is a real-browser scan in story 2's spec
 * (architecture.md § Playwright spec conventions #8), and this story has no accessibility
 * criterion of its own.
 *
 * ── Implementation contract this spec asserts (read before implementing) ──
 * 1. **The Edit entry point on the detail page (story 4's screen) is a real anchor.** Inside
 *    `main` there is exactly ONE link whose accessible name starts with "Edit" and whose
 *    `href` is `/animals/{Id}/edit`. A button with an `onClick` router push would fail the
 *    `href` assertion and would not be deep-linkable or middle-clickable.
 *    **Naming constraint:** story 4's spec pins `main` to exactly one link matching
 *    `/back|roster|animals/i`, so the Edit control must NOT be called "Edit animals" or
 *    anything containing "roster"/"back". "Edit" or "Edit animal" is safe.
 * 2. **The form's five entries are reachable by their labels**, with accessible names
 *    starting `Name`, `Species`, `Age`, `Diet` (each a value-bearing control, so
 *    `toHaveValue` reads its prefill) and `Habitat`. `Diet` is a free-text entry, not a
 *    picker: the backend declares no enum for it (`AnimalWrite.Diet` is a plain string), so
 *    inventing a fixed option list would reject values the backend accepts.
 * 3. **The habitat picker is the only picker**, exposing `role="combobox"` with an accessible
 *    name containing "habitat" and opening `role="option"` items — the Shadcn/Radix `Select`
 *    shape story 6 mandates and story 3 already pinned for the roster filter. Its CURRENT
 *    selection must be conveyed through the listbox: on open, the chosen option is the
 *    selected one (`aria-selected="true"`), which Radix's `Select` gives you for free (it
 *    focuses the selected item on open) and a native `<select>` gives implicitly. A picker
 *    that only colours the current row conveys nothing to assistive technology and fails
 *    here.
 * 4. **The save control** is a button whose accessible name starts with "Save" or "Update".
 * 5. **Landing destination after a successful save is the animal's own page**
 *    (`/animals/{Id}`), showing the saved values — per R23 ("refresh the affected
 *    list/detail so the change is immediately visible") and the story's manual checklist
 *    ("Change the habitat and save → ... the animal's page shows the new habitat").
 * 6. **The confirmation is the backend's own `Messages[0]`, shown through the existing
 *    ToastContext** (NFR-5 — no second notification system). A success toast renders with
 *    `role="status"`; a success reported as `role="alert"` fails here, and correctly so.
 * 7. **Every transition is client-side.** The detail page is opened once with a document
 *    load; reaching the form, saving, returning to the animal's page and navigating back to
 *    the roster must add NO further document loads. That is what "without a manual reload"
 *    means, and this spec counts the `load` events to prove it.
 * 8. **The PUT goes to the app's own `/api/animals/{Id}`** with a JSON body of exactly
 *    `Name`, `Species`, `Age`, `HabitatId`, `Diet` — `Age` and `HabitatId` as JSON numbers.
 *    No `Id`, no `HabitatName`, no `LastChangedDate`, and no `LastChangedUser` in the body or
 *    in any browser-set header (BR3/R21: the server tier injects it).
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { expect, test } from '@playwright/test';

import { createAnimal, createAnimals } from '../src/mocks/data/animal';
import { createHabitats } from '../src/mocks/data/habitat';
import { createWriteSuccess } from '../src/mocks/data/write-result';
import {
  abortUnmatchedApiRequests,
  mockAnimal,
  mockAnimalUpdate,
  mockAnimals,
  mockHabitats,
} from './fixtures/api-mocks';

import type { AnimalRead } from '../src/types/api-generated';
import type { Locator, Page } from '@playwright/test';

/** The canonical four-animal roster the roster screen is served. */
const ROSTER = createAnimals();

/**
 * Pull one animal out of the canonical roster, so the record the detail endpoint returns, the
 * row the roster shows and the values this spec types can never describe different animals.
 * Throws rather than returning `undefined`, so a fixture rename fails loudly here instead of
 * producing a spec that asserts on nothing.
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
 * The generated `AnimalRead` marks every field optional (the API spec declares no
 * `required:`), so the id is narrowed once here rather than threading `| undefined` into
 * every path and assertion below.
 */
function idOf(animal: AnimalRead): number {
  if (typeof animal.Id !== 'number') {
    throw new Error(`The animal fixture "${String(animal.Name)}" has no Id`);
  }

  return animal.Id;
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

/** Kaya — Bengal Tiger, 6, Rainforest, Carnivore. The animal being edited. */
const ANIMAL = animalNamed('Kaya');
const ANIMAL_ID = idOf(ANIMAL);

const DETAIL_PATH = `/animals/${String(ANIMAL_ID)}`;
const EDIT_PATH = `${DETAIL_PATH}/edit`;

/**
 * Kaya's stored values, spelled out rather than read off the fixture: every `AnimalRead`
 * field is optional, so threading `| undefined` into each assertion would let a missing value
 * quietly assert nothing. If the shared factory ever changed these, the prefill assertions
 * fail loudly — which is the intended outcome, since the mock body IS the fixture.
 */
const CURRENT = {
  name: 'Kaya',
  species: 'Bengal Tiger',
  age: '6',
  habitat: 'Rainforest',
  diet: 'Carnivore',
} as const;

/**
 * The edit the user makes: Age, Habitat and Diet change; Name and Species are left alone.
 *
 * Leaving two fields untouched is deliberate — they must still be sent, which is what makes
 * the "exactly five writable fields" assertion meaningful rather than a check that only the
 * edited fields go on the wire. All three changed values are visible on BOTH the animal's
 * page and the roster (which shows Name, Species, Age, Habitat, Diet), so one save proves
 * both refreshes.
 */
const EDITED = {
  age: '7',
  habitat: 'Savannah',
  diet: 'Omnivore',
} as const;

const EDITED_AGE = 7;
const EDITED_HABITAT_ID = habitatIdFor(EDITED.habitat);

/**
 * The record the backend serves once the save has landed.
 *
 * Built field by field rather than by spreading `ANIMAL`, because `createAnimal()` only
 * derives `HabitatName` from `HabitatId` when the overrides do not already carry a
 * `HabitatName` — spreading Kaya would have kept "Rainforest" against the Savannah id and
 * produced a pairing the backend's INNER JOIN could never return (brief BR5).
 * `LastChangedDate` moves too: the backend stamps it on every write, and it is the one field
 * that changes without the user touching it.
 */
const UPDATED_ANIMAL = createAnimal({
  Id: ANIMAL_ID,
  Name: CURRENT.name,
  Species: CURRENT.species,
  Age: EDITED_AGE,
  HabitatId: EDITED_HABITAT_ID,
  Diet: EDITED.diet,
  LastChangedDate: '2026-07-30 09:41:12',
});

/** The roster after the save. Name is unchanged, so the backend's Name ordering holds. */
const UPDATED_ROSTER = ROSTER.map((animal) =>
  animal.Id === ANIMAL_ID ? UPDATED_ANIMAL : animal,
);

/**
 * The backend's own reply to a successful update (R21, story notes): `MessageType: "Success"`
 * with `"Animal updated successfully"`, echoing the affected record's `Id`.
 *
 * The asserted confirmation text is read back out of this envelope rather than written a
 * second time, so the spec cannot end up asserting wording the mock never sent — which is
 * exactly the "invented text" failure AC-3 forbids.
 */
const UPDATE_RESPONSE = createWriteSuccess({
  Id: ANIMAL_ID,
  Messages: ['Animal updated successfully'],
});
const UPDATE_CONFIRMATION = UPDATE_RESPONSE.Messages[0];

/** The body the browser must PUT: the five writable fields, nothing else. */
const EXPECTED_PUT_BODY = {
  Name: CURRENT.name,
  Species: CURRENT.species,
  Age: EDITED_AGE,
  HabitatId: EDITED_HABITAT_ID,
  Diet: EDITED.diet,
};

/** Those five field names, sorted, for the "exactly these and no others" assertion. */
const WRITABLE_FIELDS = Object.keys(EXPECTED_PUT_BODY).sort();

/**
 * `LastChangedUser` is injected by the server tier from a single fixed configuration value
 * (BR3/R5). The browser must never send it — not in the body, and not as a header of its own.
 * Playwright lower-cases captured header names.
 */
const LAST_CHANGED_USER_HEADER = 'lastchangeduser';

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

/**
 * A value inside one roster cell, tolerating presentation around it ("7 years") while still
 * pinning the value — the same latitude the Vitest layer allows for story 2's roster.
 */
function cellPattern(value: string): RegExp {
  return new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
}

/** The one link on the detail page that leads to this animal's edit form (contract #1). */
function editLink(page: Page): Locator {
  return page.getByRole('main').getByRole('link', { name: /^edit\b/i });
}

/**
 * A form entry, located by its own accessible name. Anchored at the start so `Name` cannot
 * match a "Habitat name" label, and left open at the end so a required marker ("Name *")
 * still matches.
 */
function field(page: Page, label: RegExp): Locator {
  return page.getByLabel(label);
}

/** The habitat picker — story 3's locator, the same Shadcn `Select` shape (contract #3). */
function habitatPicker(page: Page): Locator {
  return page.getByRole('combobox', { name: /habitat/i });
}

function saveButton(page: Page): Locator {
  return page.getByRole('button', { name: /^(save|update)\b/i });
}

/**
 * The value shown against a field label in the detail view's description list — story 4's
 * locator and story 4's `<dt>`/`<dd>` contract, reused deliberately so the two specs cannot
 * pin different shapes for the same screen.
 */
function detailFieldValue(page: Page, label: RegExp): Locator {
  return page
    .getByRole('main')
    .locator('dt')
    .filter({ hasText: label })
    .locator('xpath=following-sibling::dd[1]');
}

/** The shared shell's Animals navigation entry (stories 2 and 5). */
function animalsNavLink(page: Page): Locator {
  return page
    .getByRole('navigation')
    .getByRole('link', { name: 'Animals', exact: true });
}

/**
 * Assert the habitat picker's CURRENT selection through the listbox itself.
 *
 * Opening it and reading which option is selected is the one assertion that holds for both
 * the Radix `Select` story 6 mandates and a plain native `<select>`: Radix focuses the
 * selected item on open (so `aria-selected` resolves true on it) and a native `<option>`
 * exposes its selected state implicitly. Reading the trigger's text instead would pass for
 * Radix and silently pass for a native select regardless of what is chosen.
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

  // Close it again, so the listbox cannot swallow the next click.
  await page.keyboard.press('Escape');
  await expect(habitatPicker(page)).toBeVisible();
}

/** Choose a habitat through the real listbox interaction, not by setting a value. */
async function chooseHabitat(page: Page, habitatName: string): Promise<void> {
  await habitatPicker(page).click();
  await page.getByRole('option', { name: habitatName, exact: true }).click();
}

/**
 * Assert the form is prefilled with one animal's stored values.
 *
 * Every entry is read through its own label, so a value rendered against the wrong field
 * fails — and the habitat is checked as a SELECTION, not as text that happens to be present.
 */
async function expectFormPrefilledWith(
  page: Page,
  values: typeof CURRENT,
): Promise<void> {
  await expect(field(page, /^name\b/i)).toHaveValue(values.name);
  await expect(field(page, /^species\b/i)).toHaveValue(values.species);
  await expect(field(page, /^age\b/i)).toHaveValue(values.age);
  await expect(field(page, /^diet\b/i)).toHaveValue(values.diet);
  await expectHabitatSelected(page, values.habitat);
}

test.describe('Epic zoo-animal-manager, Story 7: Edit an animal', () => {
  // AC-1
  test("choosing Edit on an animal opens the form prefilled with that animal's current details", async ({
    page,
  }) => {
    // Installed FIRST so it is consulted LAST: anything the interceptors below miss is
    // aborted rather than reaching the real backend.
    await abortUnmatchedApiRequests(page);
    await mockAnimals(page, ROSTER);
    await mockAnimal(page, ANIMAL);
    await mockHabitats(page);

    // Entered from the animal's own page — "choosing Edit on an animal" is part of the
    // requirement (R21: prefilled from the single-animal read, reached from the detail view),
    // so typing the edit address directly would skip the thing under test.
    await page.goto(DETAIL_PATH);
    await expect(
      page.getByRole('heading', { name: CURRENT.name }),
    ).toBeVisible();

    await expect(editLink(page)).toHaveCount(1);
    await expect(editLink(page)).toHaveAttribute('href', EDIT_PATH);
    await editLink(page).click();

    await expect(page).toHaveURL(EDIT_PATH);

    // The five entries, each carrying THIS animal's stored value. These can only have come
    // from the intercepted single-animal read, which also confirms the prefill fetch is
    // browser-side.
    await expectFormPrefilledWith(page, CURRENT);

    // The picker offers the other habitats too — a prefilled value the user cannot change
    // would satisfy "shows the current habitat" while breaking the story.
    await habitatPicker(page).click();
    await expect(page.getByRole('option', { name: 'Savannah' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Aquarium' })).toBeVisible();
  });

  // AC-3
  test("saving changes shows the backend's own confirmation, and the new values appear on the animal's page and in the roster without a reload", async ({
    page,
  }) => {
    // Every client-side transition adds no document load; a full reload adds one. Recorded as
    // paths so the failure message says WHERE the unexpected load happened (contract #7).
    const documentLoads: string[] = [];
    page.on('load', () => documentLoads.push(new URL(page.url()).pathname));

    await abortUnmatchedApiRequests(page);
    await mockAnimals(page, ROSTER);
    await mockAnimal(page, ANIMAL);
    await mockHabitats(page);

    await page.goto(DETAIL_PATH);
    await editLink(page).click();
    await expect(page).toHaveURL(EDIT_PATH);
    // The prefill has landed before anything is re-mocked below — so the reads swapped in
    // next cannot race the form's own fetch. AC-1 pins the prefill in full; here it is only
    // the starting point the edit is made from.
    await expect(field(page, /^age\b/i)).toHaveValue(CURRENT.age);

    // From this point the backend serves the SAVED record: the detail read and the roster
    // both answer with the updated values, which is what makes the post-save refresh
    // observable. Registered before the save so no re-registration races the refresh fetch.
    await mockAnimal(page, UPDATED_ANIMAL);
    await mockAnimals(page, UPDATED_ROSTER);
    // Registered LAST, so the PUT handler is consulted before the read handler on the shared
    // detail path; it passes GETs on with `route.fallback()`.
    const writes = await mockAnimalUpdate(page, UPDATE_RESPONSE);

    await field(page, /^age\b/i).fill(EDITED.age);
    await field(page, /^diet\b/i).fill(EDITED.diet);
    await chooseHabitat(page, EDITED.habitat);

    await saveButton(page).click();

    // (1) The BACKEND'S wording, read straight back out of the mocked `Messages[0]` — and
    // carried by the existing toast infrastructure as a success (`role="status"`), not as an
    // alert. Asserted first because a success toast auto-dismisses after a few seconds.
    await expect(
      page.getByRole('status').filter({ hasText: UPDATE_CONFIRMATION }),
    ).toBeVisible();

    // (2) The animal's own page, showing the saved values. Each is scoped to its own `<dt>`
    // label, so a value rendered against the wrong field fails.
    await expect(page).toHaveURL(DETAIL_PATH);
    await expect(detailFieldValue(page, /^age\b/i)).toHaveText(
      cellPattern(EDITED.age),
    );
    await expect(detailFieldValue(page, /^habitat\b/i)).toHaveText(
      EDITED.habitat,
    );
    await expect(detailFieldValue(page, /^diet\b/i)).toHaveText(EDITED.diet);

    // (3) ...and the roster, reached through the shared shell. Kaya's row carries the new
    // values, and the roster still holds every animal — a refresh that dropped the rest of
    // the roster would otherwise pass.
    await animalsNavLink(page).click();
    await expect(page).toHaveURL('/');
    await expect(rosterRows(page)).toHaveCount(UPDATED_ROSTER.length);

    const updatedRow = rosterRow(page, CURRENT.name);
    await expect(
      updatedRow.getByRole('cell', { name: cellPattern(EDITED.age) }),
    ).toBeVisible();
    await expect(
      updatedRow.getByRole('cell', { name: cellPattern(EDITED.habitat) }),
    ).toBeVisible();
    await expect(
      updatedRow.getByRole('cell', { name: cellPattern(EDITED.diet) }),
    ).toBeVisible();
    // The old habitat is gone from that row, not merely joined by the new one.
    await expect(
      updatedRow.getByRole('cell', { name: cellPattern(CURRENT.habitat) }),
    ).toHaveCount(0);

    // (4) What actually went on the wire. One `toEqual` over the captured bodies pins both
    // "exactly one PUT was sent" (a double submit writes two audit rows) and "these five
    // fields with these values" — including the two the user never touched, which must still
    // be sent, and `Age`/`HabitatId` as JSON numbers rather than strings.
    expect(writes.map((write) => write.body)).toEqual([EXPECTED_PUT_BODY]);
    // Stated separately as field NAMES, because "exactly the five writable fields, and no
    // `LastChangedUser`" is the criterion's own wording: no `Id`, no `HabitatName`, no
    // `LastChangedDate`, no `LastChangedUser`.
    expect(writes.map((write) => Object.keys(write.body).sort())).toEqual([
      WRITABLE_FIELDS,
    ]);
    // Addressed to the app's OWN route handler, with the record id in the path.
    expect(writes.map((write) => new URL(write.url).pathname)).toEqual([
      `/api/animals/${String(ANIMAL_ID)}`,
    ]);
    // `LastChangedUser` is not smuggled in as a browser-set header either (BR3).
    for (const write of writes) {
      expect(Object.keys(write.headers)).not.toContain(
        LAST_CHANGED_USER_HEADER,
      );
    }

    // (5) One document load for the whole journey — the initial visit. Reaching the form,
    // saving, landing back on the animal's page and returning to the roster were all
    // client-side, which is what "without a manual reload" means.
    expect(documentLoads).toEqual([DETAIL_PATH]);
  });
});
