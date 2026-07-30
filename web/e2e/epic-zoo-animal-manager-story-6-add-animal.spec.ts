/**
 * Story Metadata:
 * - Route: /animals/new
 * - Target File: web/src/app/animals/new/page.tsx
 * - Page Action: create_new
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never uses
 *   the real `API_KEY` (testing-policy.md § "Playwright runs against mocks, never live").
 * - Interception is via `page.route()` on the app's OWN route handlers, through the shared
 *   interceptors in `./fixtures/api-mocks` (architecture.md § Playwright spec conventions #7):
 *   `mockAnimals()` + `mockHabitats()` for the reads, and `mockAnimalCreate()` — added by this
 *   story — for `POST /api/animals`. NEVER the Linx base URL
 *   (`http://localhost:10002/crud-patterns/**`): that call is made from the Next.js server
 *   tier, which `page.route()` cannot see, so routing it would match nothing
 *   (architecture.md Decision 1).
 * - `abortUnmatchedApiRequests()` is installed FIRST in every test as a safety net: anything
 *   under `/api/**` that the specific interceptors miss is aborted rather than travelling on
 *   to the real backend. THIS MATTERS MORE HERE THAN IN ANY EARLIER SPEC. Stories 1–5 only
 *   read; this is the first spec that WRITES, and the project has `dataSource: existing-api`
 *   with no MSW runtime layer — so a missed interception does not fail harmlessly, it inserts
 *   a row into the user's real database. A false-green write spec is data, not just a bad test.
 * - Implementation pattern this REQUIRES (architecture.md Decision 1): the create must be a
 *   BROWSER-side request through the API client to the app's own `/api/animals` route — a
 *   `"use client"` form. A **Next.js Server Action would defeat every protection above**:
 *   `page.route()` cannot intercept it (it posts to the page URL, not `/api/**`, so even the
 *   safety net misses it), the Linx call would happen Node-side, and the row would really be
 *   created. `watchForUnmockedWrites()` below therefore fails the test if ANY mutating request
 *   goes anywhere other than the mocked `/api/animals`.
 * - Response bodies come from the shared factories (`../src/mocks/data/animal`,
 *   `../src/mocks/data/habitat`, `../src/mocks/data/write-result`) via the fixtures module,
 *   imported by RELATIVE path — never the `@/` alias, which Playwright's runtime does not
 *   resolve — so this layer cannot drift from the Vitest layer.
 * - No auth chain, no cookies, no credential fixtures: this project has no login, no session
 *   and no userinfo endpoint (project.md §Authentication, brief BR15).
 *
 * E2E spec for Epic zoo-animal-manager, Story 6: Add an animal.
 *
 * Covers the two criteria tagged `playwright` — both need a real browser round trip:
 * - AC-1 — an "Add animal" action ON THE ROSTER opens a form with exactly the five writable
 *   entries (Name, Species, Age, Habitat, Diet) and no change-tracking or identifier fields.
 *   Reached by clicking through from `/`, because "from the roster" is part of the requirement.
 * - AC-4 — saving a valid animal shows the BACKEND'S OWN confirmation wording and the new
 *   animal is visible in the roster without a manual reload; the request that went on the wire
 *   carried exactly the five writable fields and no `LastChangedUser`.
 *
 * AC-2 (habitat mandatory, no habitat-creation shortcut), AC-3 (field-level validation, Age a
 * whole number ≥ 0) and AC-5 (a refused save keeps the user's input and does not navigate
 * away) are jsdom-observable and live in
 * `web/src/__tests__/integration/epic-zoo-animal-manager-story-6-add-animal.test.tsx`
 * — deliberately not duplicated here.
 *
 * No axe scan here: the epic's accessibility baseline is a real-browser scan in story 2's spec
 * (architecture.md § Playwright spec conventions #8).
 *
 * ── Implementation contract this spec asserts (read before implementing) ──
 * 1. The roster carries exactly ONE "Add animal" affordance inside `main`, and it is a real
 *    anchor with `href="/animals/new"` — a button that calls `router.push()` would not be
 *    keyboard-reachable as a link, openable in a new tab, or deep-linkable.
 * 2. `/animals/new` renders a real `<form>` element inside `main` holding exactly FIVE
 *    labelled entries. Each label STARTS with the field's name — `Name`, `Species`, `Age`,
 *    `Habitat`, `Diet` — the same convention story 4 pinned for the detail view's `<dt>`
 *    labels, so both specs read the same way. "Exactly five" is asserted as a label count:
 *    the writable surface is five fields and nothing else (R17).
 * 3. Name, Species, Age and Diet are labelled inputs, reachable by `getByLabel()`. **Diet is
 *    free text, not a picker** — the API declares no diet enum and the backend validates
 *    nothing (R19), so a select here would invent a contract the backend does not have.
 * 4. The habitat picker is Shadcn's `select` (the story's notes mandate the CLI primitive, not
 *    a hand-rolled control): it exposes `role="combobox"` with an accessible name containing
 *    "habitat" (e.g. a placeholder "Select a habitat", or an explicit `aria-label` — a
 *    `<label for>` alone does NOT name a Radix trigger button), and clicking it opens
 *    `role="option"` items named by habitat name. This is story 3's convention for the
 *    roster's habitat filter, reused. A *native* `<select>` would satisfy the jsdom layer but
 *    not this one — Playwright cannot click an `<option>` inside a closed native dropdown, so
 *    the Radix-backed listbox is the shape both layers are written against.
 * 5. The submit control is a `button` inside that form whose accessible name contains "save",
 *    "create" or "add".
 * 6. Submitting issues a browser-side `POST` to the app's own `/api/animals` with a JSON body
 *    of EXACTLY `{ Name, Species, Age, HabitatId, Diet }` — `Age` and `HabitatId` as numbers,
 *    not the strings a form control hands you — and no `LastChangedUser`, which is a header
 *    injected by the server tier (story 1 / R5 / BR3) and never a body field.
 * 7. On `MessageType: "Success"` the app shows the backend's own `Messages[0]` through the
 *    shared toast channel (`role="region"` named "Notifications" → `role="status"`, the
 *    template's existing `ToastContainer`, per NFR-5 and the epic baseline test) and lands the
 *    user back on the roster (`/`) with the roster re-fetched, via client-side navigation —
 *    no full document load anywhere in the flow (R23).
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { expect, test } from '@playwright/test';

import { createAnimal, createAnimals } from '../src/mocks/data/animal';
import { createHabitats } from '../src/mocks/data/habitat';
import { createWriteSuccess } from '../src/mocks/data/write-result';
import {
  abortUnmatchedApiRequests,
  mockAnimalCreate,
  mockAnimals,
  mockHabitats,
} from './fixtures/api-mocks';

import type { AnimalWrite } from '../src/types/api-generated';
import type { Locator, Page } from '@playwright/test';

/** The roster the backend serves before the create: the canonical four animals. */
const ROSTER = createAnimals();

/**
 * The animal this spec adds — and, because it is typed `Required<AnimalWrite>`, the exact
 * writable surface the generated API type declares. Every field is non-optional here, so the
 * assertions below never thread `| undefined` (the spec declares no `required:`, so
 * `AnimalWrite`'s own fields are all optional), and a spec change that adds or removes a
 * writable field breaks this line at compile time.
 */
const NEW_ANIMAL: Required<AnimalWrite> = {
  Name: 'Bandile',
  Species: 'Nile Crocodile',
  Age: 4,
  HabitatId: 3,
  Diet: 'Carnivore',
};

/**
 * The habitat name the picker must be given, resolved from the SAME fixture the mocked
 * `/api/habitats` response is built from — so the option this spec clicks and the `HabitatId`
 * it expects on the wire can never describe different habitats. Throws rather than returning
 * `undefined`, so a fixture change fails loudly here instead of silently asserting nothing.
 */
function habitatNameFor(habitatId: number): string {
  const habitat = createHabitats().find((entry) => entry.Id === habitatId);

  if (!habitat?.Name) {
    throw new Error(
      `No habitat with Id ${String(habitatId)} in the canonical habitat fixture`,
    );
  }

  return habitat.Name;
}

/** 'Aquarium' — habitat 3 in the canonical set. */
const NEW_ANIMAL_HABITAT = habitatNameFor(NEW_ANIMAL.HabitatId);

/** The envelope the backend answers a successful create with (R17). */
const CREATE_SUCCESS = createWriteSuccess();

/**
 * The backend's OWN confirmation wording — "Animal successfully created" — taken from the
 * shared fixture so the two test layers cannot drift onto different text.
 *
 * Note the word order: an invented message would almost certainly read "Animal created
 * successfully", so asserting this exact string is what distinguishes "showed the backend's
 * message" from "showed our own" (R23).
 */
const BACKEND_SUCCESS_MESSAGE = CREATE_SUCCESS.Messages[0];

/**
 * The created record as the backend would return it afterwards, carrying the `Id` the create
 * response reported. `createAnimal` derives `HabitatName` from `HabitatId`, so the roster row
 * shows the habitat the picker chose.
 */
const CREATED_ANIMAL = createAnimal({
  Id: CREATE_SUCCESS.Id,
  ...NEW_ANIMAL,
  LastChangedDate: '2026-07-29 09:41:03',
});

/**
 * The roster once the animal exists — five animals, sorted by `Name`, because
 * `GET /v1/animals` always returns the complete set sorted by `Name` and accepts no sort
 * parameters (BR6). 'Bandile' therefore lands second, after 'Anaya'.
 */
const ROSTER_AFTER_CREATE = [...ROSTER, CREATED_ANIMAL].sort((left, right) =>
  String(left.Name).localeCompare(String(right.Name)),
);

/**
 * The fixed deployment value every record's `LastChangedUser` carries (BR14). The form must
 * never show it: the user neither supplies nor sees it (R17), so its appearance anywhere in
 * the form would mean the change-tracking surface leaked into the write surface.
 */
const FIXED_LAST_CHANGED_USER = 'Animal Manager';

/** The backend's pre-formatted `'yyyy-MM-dd HH:mm:ss'` timestamp shape (BR13). */
const SAST_TIMESTAMP = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

/**
 * Labels that must NOT exist on this form: the record's identifier, the joined habitat name,
 * and the change-tracking trail. All four are server- or backend-derived (R17) — a field for
 * any of them means the form is offering to write something the client never writes.
 */
const FORBIDDEN_FIELD_LABEL =
  /\bid\b|identifier|habitat\s*name|last\s*(changed|updated)|changed\s*by/i;

/** HTTP methods that change data. A spec of this story must let none of them escape. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Next.js's own dev/runtime endpoints, which are not the app's API surface. */
const NEXT_INTERNAL_PATH = /^\/(?:_next|__next)/;

/** The one write path this spec mocks; anything else is an escape. */
const MOCKED_WRITE_PATH = '/api/animals';

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

/** The roster's route to this story's form. */
function addAnimalAction(page: Page): Locator {
  return page.getByRole('main').getByRole('link', { name: /add animal/i });
}

/** The add-animal form itself — a real `<form>` inside the page's own content. */
function animalForm(page: Page): Locator {
  return page.getByRole('main').locator('form');
}

/**
 * One text entry, located by its label. Scoped to the form so a control elsewhere on the
 * screen (the roster's search box, say) can never satisfy these assertions.
 */
function formField(page: Page, label: RegExp): Locator {
  return animalForm(page).getByLabel(label);
}

/**
 * The habitat picker, located by ROLE rather than by label: a `<label for>` does not name a
 * Radix `SelectTrigger` button in the accessibility tree, so the trigger's own accessible
 * name has to carry "habitat" (contract #4). Story 3 pinned the same shape for the roster's
 * habitat filter.
 */
function habitatPicker(page: Page): Locator {
  return animalForm(page).getByRole('combobox', { name: /habitat/i });
}

function saveButton(page: Page): Locator {
  return animalForm(page).getByRole('button', { name: /save|create|add/i });
}

/**
 * The write confirmation, scoped to the shared toast channel the whole epic reports write
 * outcomes through (NFR-5; the epic baseline test pins that this infrastructure stays
 * mounted). A success toast is `role="status"` inside the container's `role="region"` named
 * "Notifications".
 */
function confirmationToast(page: Page): Locator {
  return page
    .getByRole('region', { name: /notification/i })
    .getByRole('status');
}

/**
 * Watch for any mutating request that this spec did not mock, and return the live list of
 * them so a test can assert it stayed empty.
 *
 * This closes the one hole `abortUnmatchedApiRequests()` cannot: that net only covers
 * `/api/**`, but a Next.js Server Action posts to the PAGE url (`/animals/new`), so a form
 * implemented that way would sail past every interceptor, reach the Linx backend server-side,
 * and create a real row. Detection is not prevention — but it names the exact failure instead
 * of leaving a mysteriously-green-yet-wrong spec, and it also reports a POST that the safety
 * net had to abort because it went to an unexpected path.
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

test.describe('Epic zoo-animal-manager, Story 6: Add an animal', () => {
  // AC-1
  test('the Add animal action on the roster opens a form with exactly the five writable entries and no change-tracking or identifier fields', async ({
    page,
  }) => {
    // Installed FIRST so every later interceptor takes precedence and anything they miss is
    // aborted rather than reaching the real backend.
    await abortUnmatchedApiRequests(page);
    const unmockedWrites = watchForUnmockedWrites(page);
    await mockAnimals(page, ROSTER);
    await mockHabitats(page);

    await page.goto('/');

    // Wait for the roster to finish loading, so the click lands on a hydrated screen rather
    // than racing the loading placeholder (story 2's locator).
    await expect(
      page.getByRole('table').getByRole('cell', { name: 'Anaya' }),
    ).toBeVisible();

    // Reached FROM the roster — "on the roster" is part of AC-1, and the `href` is what makes
    // this a real, deep-linkable route rather than an in-page mode switch.
    await expect(addAnimalAction(page)).toHaveCount(1);
    await expect(addAnimalAction(page)).toHaveAttribute('href', '/animals/new');
    await addAnimalAction(page).click();

    await expect(page).toHaveURL('/animals/new');

    const form = animalForm(page);
    await expect(form).toBeVisible();

    // The five entries the brief allows, and each one located through its own label so a
    // control shown under the wrong label cannot pass.
    await expect(formField(page, /^name\b/i)).toBeVisible();
    await expect(formField(page, /^species\b/i)).toBeVisible();
    await expect(formField(page, /^age\b/i)).toBeVisible();
    await expect(formField(page, /^diet\b/i)).toBeVisible();
    await expect(habitatPicker(page)).toBeVisible();

    // ...and NOTHING else. Five labelled entries, exactly — the writable surface is five
    // fields (R17), so a sixth entry of any kind is a defect, not an extra.
    await expect(form.locator('label')).toHaveCount(5);

    // Named specifically, because these four are the ones a CRUD form is most likely to grow
    // by accident: the identifier, the joined habitat name, and the change-tracking pair.
    await expect(
      form.locator('label').filter({ hasText: FORBIDDEN_FIELD_LABEL }),
    ).toHaveCount(0);

    // Their VALUES are absent too, not merely their labels: no fixed deployment user name,
    // no backend timestamp displayed as read-only decoration.
    await expect(
      form.getByText(FIXED_LAST_CHANGED_USER, { exact: true }),
    ).toHaveCount(0);
    await expect(form.getByText(SAST_TIMESTAMP)).toHaveCount(0);

    // Opening a form is not a write: nothing mutating may have left the browser.
    expect(unmockedWrites).toEqual([]);
  });

  // AC-4
  test('saving a valid animal shows the backend own confirmation wording and the new animal appears in the roster without a manual reload', async ({
    page,
  }) => {
    // A full document load pushes a `load` event; client-side navigation pushes none. One
    // load for the whole roster → form → save → roster journey is the proof that the user
    // never had to reload to see the new animal.
    const documentLoads: string[] = [];
    page.on('load', () => documentLoads.push(page.url()));

    await abortUnmatchedApiRequests(page);
    const unmockedWrites = watchForUnmockedWrites(page);
    await mockAnimals(page, ROSTER);
    await mockHabitats(page);
    // Registered AFTER `mockAnimals` so the POST reaches it first and roster GETs still fall
    // through; from the create onward the roster it serves contains the new animal, which is
    // what makes the refresh below an observable CHANGE (four rows → five) rather than a
    // pre-seeded answer.
    const creates = await mockAnimalCreate(
      page,
      CREATE_SUCCESS,
      200,
      ROSTER_AFTER_CREATE,
    );

    await page.goto('/');
    await expect(rosterRows(page)).toHaveCount(ROSTER.length);
    await expect(rosterRow(page, NEW_ANIMAL.Name)).toHaveCount(0);

    await addAnimalAction(page).click();
    await expect(page).toHaveURL('/animals/new');

    await formField(page, /^name\b/i).fill(NEW_ANIMAL.Name);
    await formField(page, /^species\b/i).fill(NEW_ANIMAL.Species);
    await formField(page, /^age\b/i).fill(String(NEW_ANIMAL.Age));
    await formField(page, /^diet\b/i).fill(NEW_ANIMAL.Diet);

    // The habitat is chosen through the real listbox interaction — the option list is
    // portalled outside the form, so it is queried on the page.
    await habitatPicker(page).click();
    await page.getByRole('option', { name: NEW_ANIMAL_HABITAT }).click();

    await saveButton(page).click();

    // The backend's own wording, asserted first because the toast auto-dismisses.
    await expect(confirmationToast(page)).toContainText(
      BACKEND_SUCCESS_MESSAGE,
    );

    // The user lands back on the roster — not left on a form, and not on a screen that
    // looks unchanged (R23) — with the new animal there and the row count grown by one.
    await expect(page).toHaveURL('/');
    await expect(rosterRow(page, NEW_ANIMAL.Name)).toBeVisible();
    await expect(rosterRow(page, NEW_ANIMAL.Name)).toContainText(
      NEW_ANIMAL.Species,
    );
    await expect(rosterRows(page)).toHaveCount(ROSTER_AFTER_CREATE.length);

    // ...and it took no manual reload: one document load for the entire journey.
    expect(documentLoads).toHaveLength(1);

    // What actually went on the wire. `toEqual` is exact for objects, so this pins BOTH
    // halves of R17: the five writable fields WITH `Age` and `HabitatId` as numbers (a form
    // control hands you strings, and this backend stores whatever it is sent), and no sixth
    // field — above all no `LastChangedUser`, which the server tier injects as a header
    // (R5/BR3) and the client must never put in the body. A single entry also means one
    // create, so a double-submit that made two animals fails here.
    expect(creates.map((create) => create.body)).toEqual([
      {
        Name: NEW_ANIMAL.Name,
        Species: NEW_ANIMAL.Species,
        Age: NEW_ANIMAL.Age,
        HabitatId: NEW_ANIMAL.HabitatId,
        Diet: NEW_ANIMAL.Diet,
      },
    ]);

    // Hermeticity, asserted rather than assumed: the only mutating request the browser made
    // was the mocked POST to `/api/animals`. Anything else would mean a write reached the
    // real database (see the Mocking strategy note on Server Actions).
    expect(unmockedWrites).toEqual([]);
  });
});
