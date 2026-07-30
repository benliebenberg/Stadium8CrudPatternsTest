/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/page.tsx
 * - Page Action: modify_existing
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never uses
 *   the real `API_KEY` (testing-policy.md § "Playwright runs against mocks, never live").
 * - Interception happens on the app's OWN route handlers — `/api/animals`,
 *   `/api/animals/{Id}`, `/api/habitats` — through the shared helpers in
 *   `./fixtures/api-mocks` and their two DISJOINT regexes, never a bare `**\/api\/animals**`
 *   glob (architecture.md § Playwright spec conventions #4: that glob's trailing `**` also
 *   swallows `/api/animals/4`, so the list and detail interceptors would overlap and the
 *   winner would depend on registration order — and this spec needs both live at once, since
 *   it walks roster → detail → edit). NEVER the Linx base URL
 *   (`http://localhost:10002/crud-patterns/**`), which is called from the Next.js server tier
 *   and is invisible to `page.route()` (architecture.md Decision 1).
 * - {@link mockEveryScreenRead} installs `abortUnmatchedApiRequests` FIRST, so any `/api/**`
 *   request the three specific interceptors do not cover fails loudly instead of travelling
 *   on to the real backend.
 * - Response bodies come from the project-wide entity factories via that fixtures module,
 *   imported by RELATIVE path — never the `@/` alias, which Playwright's runtime does not
 *   resolve — so this layer cannot drift from the Vitest layer.
 * - **This story is READ-ONLY.** It fills form entries to prove the controls still work, but
 *   it submits neither form: nothing here creates, updates or removes an animal, and no
 *   remove-confirmation dialog is opened. {@link watchForMutatingRequests} asserts that
 *   rather than assuming it, because `dataSource` is `existing-api` with no MSW runtime layer
 *   — a write that escaped would change a row in the user's real database.
 * - No auth chain: this project has no login, session or `userinfo` endpoint (project.md
 *   §Authentication, epic 1 BR15, conventions #6). No credential fixtures, no cookie clearing.
 * - No cookie or server-side storage assumptions: the theme preference is browser-only (BR6),
 *   and this spec deliberately stores NOTHING (see the precondition step).
 *
 * E2E spec for Epic theme-switching, Story 4: Every screen correct in light.
 *
 * ── ONE of this story's six criteria is automatable, and this spec covers exactly that one ──
 *
 * - **AC-5** — with the computer set to light, every screen still renders its content and its
 *   controls still work: the roster and its search box and habitat filter, an animal's detail
 *   screen, the habitats reference list, the add form and the edit form.
 *
 * **AC-1, AC-2, AC-3, AC-4 and AC-6 are `coverage: none` and are NOT attempted here — by
 * design, not by omission.** They are the by-eye judgements this story exists for: visible
 * row and table borders, cards distinguishable from the page behind them, a primary button
 * whose text is readable on its fill, a remove button that reads as destructive rather than
 * primary, headings and body text at the app's usual sizes and weights, and light reading as
 * a deliberate brand presentation rather than an inverted dark theme. None of that can be
 * asserted without pinning computed colours, which
 * `.claude/policies/styling-centralisation.md` forbids and which would break on every token
 * tweak. They are verified by a person at the manual-test gate, against the story's own
 * checklist.
 *
 * **So do not read this file as visual verification of the light theme.** A green run here
 * says every screen still WORKS in light — it says nothing whatsoever about whether light
 * LOOKS right. This spec is the guard against a styling pass that accidentally breaks a
 * screen or puts a control out of reach; it is not the audit.
 *
 * Consistent with that, this spec contains **no colour, hex or computed-style assertion of
 * any kind**. The only appearance fact it asserts is the theme MECHANISM fixed by
 * architecture.md Decision 4: `dark` on `<html>`, with light being the ABSENCE of that class
 * (there is no `light` class).
 *
 * The light-theme axe scan is **story 5's** (R8/NFR-3, architecture.md Decision 4 § Testing
 * the theme), and epic 1's dark scan stays in
 * `epic-zoo-animal-manager-story-2-app-shell-and-roster.spec.ts`. Neither is repeated here.
 *
 * ── Implementation contract this spec assumes (all of it already built) ──
 * Every locator below is epic 1's, deliberately unchanged: this story must not alter layout,
 * wording or behaviour (R5 § Out of Scope), so a change that forced a locator here to be
 * rewritten would itself be the defect. The search box is named by a visible `<Label>`
 * ("Search by name or species"); the habitat filter and the form's habitat picker are Radix
 * triggers exposing `role="combobox"` named "Habitat"; the form's five entries are labelled
 * `Name`, `Species`, `Age`, `Diet`, `Habitat`; the detail screen pairs each `<dt>` label with
 * the `<dd>` that follows it; the roster's route into the add form is a link named
 * "Add animal" and the detail screen's route into the edit form is a link named "Edit animal".
 *
 * These tests WILL FAIL until stories 1–3 have landed the theme mechanism (until then
 * `layout.tsx` hardcodes `class="dark"`, so the light precondition cannot hold).
 */
import { expect, test } from '@playwright/test';

import type { Locator, Page } from '@playwright/test';

import { createAnimals } from '../src/mocks/data/animal';
import { createHabitats } from '../src/mocks/data/habitat';
import {
  abortUnmatchedApiRequests,
  mockAnimal,
  mockAnimals,
  mockHabitats,
} from './fixtures/api-mocks';

import type { AnimalRead } from '../src/types/api-generated';

/**
 * An `<html>` carrying the dark class. Light is its ABSENCE (architecture.md Decision 4), so
 * every light assertion in this file is `toHaveCount(0)` on this selector — the same form
 * story 1's spec uses.
 *
 * A count rather than a class-name match on purpose: `<html>` also carries three `next/font`
 * variable classes, and this asks the only question the theme contract poses — is the dark
 * class on the document or not — without going anywhere near a colour.
 */
const DARK_HTML = 'html.dark';

/**
 * The `localStorage` key story 2's control writes and story 1's pre-paint script reads, fixed
 * by architecture.md Decision 4. Values are `light` / `dark` only; the key's ABSENCE is how
 * "follow the OS" is represented.
 *
 * Pinned as a literal rather than imported, matching stories 1 and 2: production code must
 * export a `THEME_STORAGE_KEY` constant, and this spec only ever READS through it — it never
 * writes, because "nothing stored" is the precondition AC-5 requires.
 */
const THEME_STORAGE_KEY = 'theme';

/** The canonical four-animal roster the mocked `/api/animals` handler serves. */
const ROSTER = createAnimals();

/** The canonical three habitats the mocked `/api/habitats` handler serves. */
const HABITATS = createHabitats();

/**
 * Every habitat's name, narrowed to `string` — the generated `HabitatRead` marks all fields
 * optional (the API spec declares no `required:`), so this filter is a type narrowing, not a
 * tolerance for missing data. Epic 1's story 5 spec narrows the same way.
 */
const HABITAT_NAMES = HABITATS.map((habitat) => habitat.Name).filter(
  (name): name is string => typeof name === 'string',
);

/**
 * Pull one animal out of the canonical roster, so the row this spec clicks and the record the
 * detail endpoint returns can never describe different animals. Throws rather than returning
 * `undefined`, so a fixture rename fails loudly here instead of producing a spec that asserts
 * on nothing.
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
 * The generated `AnimalRead` marks every field optional, so the id is narrowed once here
 * rather than threaded as `| undefined` through every path below.
 */
function idOf(animal: AnimalRead): number {
  if (typeof animal.Id !== 'number') {
    throw new Error(`The animal fixture "${String(animal.Name)}" has no Id`);
  }

  return animal.Id;
}

/** Kaya — Bengal Tiger, 6, Rainforest, Carnivore. The animal every screen here shows. */
const ANIMAL = animalNamed('Kaya');
const DETAIL_PATH = `/animals/${String(idOf(ANIMAL))}`;
const EDIT_PATH = `${DETAIL_PATH}/edit`;

/**
 * Kaya's stored values, spelled out rather than read off the fixture: every `AnimalRead` field
 * is optional, so threading `| undefined` into each assertion would let a missing value
 * quietly assert nothing. The mock body IS the fixture, so a fixture change should fail these
 * loudly. The same constants epic 1's stories 4 and 7 pin.
 */
const KAYA = {
  name: 'Kaya',
  species: 'Bengal Tiger',
  age: '6',
  habitat: 'Rainforest',
  diet: 'Carnivore',
} as const;

/** A second roster animal, used to prove the habitat filter returns more than one row. */
const ALSO_IN_RAINFOREST = 'Zuri';

/** How many animals share Kaya's habitat in the canonical roster: Kaya and Zuri. */
const RAINFOREST_ANIMALS = 2;

/**
 * A search term that matches exactly ONE animal, and by SPECIES rather than by name
 * ("Bengal Tiger") — so a narrowing that only ever looked at `Name` would fail here.
 */
const SEARCH_TERM = 'tiger';

/** Values typed into the two forms. Neither form is ever submitted (see Mocking strategy). */
const TYPED_NAME = 'Bandile';
const TYPED_AGE = '7';

/** The habitat chosen in the add form's picker — a real listbox interaction, not a write. */
const CHOSEN_HABITAT = 'Aquarium';

/** HTTP methods that change data. This read-only story must let none of them escape. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Next.js's own dev/runtime endpoints, which are not the app's API surface. */
const NEXT_INTERNAL_PATH = /^\/(?:_next|__next)/;

/**
 * Serve the reads every screen this spec walks makes — the roster, one animal, and the habitat
 * list — so each renders hermetically. The data is never what is under test; a loaded table or
 * a prefilled form is only the anchor proving the screen settled before an assertion is taken.
 *
 * `abortUnmatchedApiRequests` is registered FIRST so it becomes the last resort: Playwright
 * consults handlers in reverse registration order, so the three specific interceptors still
 * answer everything they cover, and anything they miss is aborted rather than forwarded to the
 * real Linx backend.
 */
async function mockEveryScreenRead(page: Page): Promise<void> {
  await abortUnmatchedApiRequests(page);
  await mockAnimals(page, ROSTER);
  await mockHabitats(page, HABITATS);
  await mockAnimal(page, ANIMAL);
}

/**
 * Watch for any request that would CHANGE data, and return the live list so the test can
 * assert it stayed empty.
 *
 * This story reads; it writes nothing. A mutating request therefore means either an accidental
 * submit or a control wired to the wrong action — and because there is no MSW runtime layer, a
 * request that escaped the interceptors reaches the real database (architecture.md Decision 1).
 * Requests to the page URL are watched too, not just `/api/**`: a Next.js Server Action posts
 * to the page it is on, which `abortUnmatchedApiRequests` cannot see.
 */
function watchForMutatingRequests(page: Page): string[] {
  const mutations: string[] = [];

  const record = (method: string, url: string, note: string): void => {
    if (!MUTATING_METHODS.has(method)) {
      return;
    }

    const { pathname } = new URL(url);

    if (NEXT_INTERNAL_PATH.test(pathname)) {
      return;
    }

    mutations.push(`${method} ${pathname} (${note})`);
  };

  page.on('request', (request) => {
    record(request.method(), request.url(), 'sent by the app');
  });
  page.on('requestfailed', (request) => {
    record(request.method(), request.url(), 'aborted by the safety net');
  });

  return mutations;
}

/**
 * Read the stored theme preference, or `null` when nothing is stored.
 *
 * Reading only: writing one would destroy the very precondition AC-5 sets ("with the computer
 * set to light" and no in-app choice made).
 */
async function storedThemePreference(page: Page): Promise<string | null> {
  return page.evaluate(
    (key: string) => window.localStorage.getItem(key),
    THEME_STORAGE_KEY,
  );
}

/**
 * Assert the screen currently on show is being rendered in LIGHT — the dark class is not on
 * `<html>`.
 *
 * Called once per screen rather than only at the start, because that is what makes a failure
 * name the screen: a shell that flipped back to dark on one route is a real regression a
 * single up-front check would miss. This is the theme mechanism (Decision 4), never a colour.
 */
async function expectLightTheme(page: Page): Promise<void> {
  await expect(page.locator(DARK_HTML)).toHaveCount(0);
}

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

/** The roster's search box, named by its visible `<Label>` (epic 1 story 3's locator). */
function searchBox(page: Page): Locator {
  return page.getByLabel(/search/i);
}

/**
 * A Radix `Select` trigger named "Habitat" — the roster's habitat FILTER on `/`, and the
 * habitat PICKER inside the form on the add/edit routes. Located by role because a
 * `<label for>` cannot name a button; the trigger carries its own accessible name.
 */
function habitatSelect(page: Page): Locator {
  return page.getByRole('combobox', { name: /habitat/i });
}

/** Choose from an open habitat list through the real interaction, never by setting a value. */
async function chooseHabitat(
  page: Page,
  optionName: string | RegExp,
): Promise<void> {
  await habitatSelect(page).click();
  // The option list is portalled outside the control, so it is queried on the page.
  await page.getByRole('option', { name: optionName }).click();
}

/** The shared shell's navigation, present on every screen in the app. */
function navLink(page: Page, section: 'Animals' | 'Habitats'): Locator {
  return page
    .getByRole('navigation')
    .getByRole('link', { name: section, exact: true });
}

/**
 * The value shown against a field label in the detail screen's description list.
 *
 * Located by the LABEL's own text, never by position, so a value shown against the wrong field
 * cannot pass. `following-sibling::dd[1]` is the `<dl>` pairing rule, and holds whether each
 * `<dt>`/`<dd>` sits flat in the list or is wrapped per field — they stay siblings either way.
 */
function fieldValue(page: Page, label: RegExp): Locator {
  return page
    .getByRole('main')
    .locator('dt')
    .filter({ hasText: label })
    .locator('xpath=following-sibling::dd[1]');
}

/** The roster's route into the add form. */
function addAnimalAction(page: Page): Locator {
  return page.getByRole('main').getByRole('link', { name: /add animal/i });
}

/** The detail screen's route into the edit form. */
function editAnimalAction(page: Page): Locator {
  return page.getByRole('main').getByRole('link', { name: /^edit\b/i });
}

/** The shared animal form — a real `<form>` inside the page's own content. */
function animalForm(page: Page): Locator {
  return page.getByRole('main').locator('form');
}

/**
 * One of the form's text entries, located by its label and scoped to the form, so a control
 * elsewhere on the screen can never satisfy the assertion.
 */
function formField(page: Page, label: RegExp): Locator {
  return animalForm(page).getByLabel(label);
}

/**
 * Assert the form's five entries are all on screen and all operable — visible AND enabled.
 *
 * "Enabled" is the half that matters for AC-5: a styling pass that left a control unreachable
 * or inert is exactly the regression this story guards against, and a disabled entry would
 * still be perfectly visible.
 */
async function expectFormEntriesUsable(page: Page): Promise<void> {
  for (const label of [/^name\b/i, /^species\b/i, /^age\b/i, /^diet\b/i]) {
    await expect(formField(page, label)).toBeVisible();
    await expect(formField(page, label)).toBeEnabled();
  }

  await expect(habitatSelect(page)).toBeVisible();
  await expect(habitatSelect(page)).toBeEnabled();
}

test.describe('Epic theme-switching, Story 4: Every screen correct in light', () => {
  /**
   * The OS asks for light, for every test in this file.
   *
   * Combined with storing NOTHING, this is the exact precondition AC-5 describes and
   * Decision 4 defines: absence of `localStorage['theme']` means follow the OS, so the app
   * must resolve to light with no in-app choice made. `test.use` sets it on the context, which
   * is why no `emulateMedia` call appears below.
   */
  test.use({ colorScheme: 'light' });

  // AC-5
  test('with the computer set to light, every screen renders its content and its controls still work', async ({
    page,
  }) => {
    // "Still renders" asserted at the root: any uncaught exception on any of the five screens
    // lands here rather than being inferred from a missing element.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const mutatingRequests = watchForMutatingRequests(page);

    await mockEveryScreenRead(page);

    await page.goto('/');

    await test.step('precondition: the app is really in light, with no stored preference', async () => {
      // Settle the shell first, so the two assertions below read a rendered document rather
      // than racing it.
      await expect(navLink(page, 'Animals')).toBeVisible();

      // Nothing stored — so the theme on show can only have come from the OS setting
      // `test.use` emulates. Without this, the whole test could run in DARK and prove nothing
      // about light, silently.
      expect(
        await storedThemePreference(page),
        `nothing may be stored under localStorage["${THEME_STORAGE_KEY}"]: absence of the key is how "follow the OS" is represented (architecture.md Decision 4)`,
      ).toBeNull();

      await expectLightTheme(page);
    });

    await test.step('the animal roster renders, and its search box and habitat filter narrow it', async () => {
      await expect(rosterRows(page)).toHaveCount(ROSTER.length);
      await expectLightTheme(page);

      // Both controls are present AND operable, not merely painted.
      await expect(searchBox(page)).toBeVisible();
      await expect(searchBox(page)).toBeEnabled();
      await expect(habitatSelect(page)).toBeVisible();
      await expect(habitatSelect(page)).toBeEnabled();

      // The search box actually WORKS: one match, by species.
      await searchBox(page).fill(SEARCH_TERM);
      await expect(rosterRows(page)).toHaveCount(1);
      await expect(rosterRow(page, KAYA.name)).toBeVisible();

      // ...and clearing it restores the roster, so the narrowing was the control's doing.
      await searchBox(page).fill('');
      await expect(rosterRows(page)).toHaveCount(ROSTER.length);

      // The habitat filter WORKS too, through the real listbox interaction. Two rows rather
      // than one: a habitat holding several animals is the stronger result.
      await chooseHabitat(page, KAYA.habitat);
      await expect(rosterRows(page)).toHaveCount(RAINFOREST_ANIMALS);
      await expect(rosterRow(page, KAYA.name)).toBeVisible();
      await expect(rosterRow(page, ALSO_IN_RAINFOREST)).toBeVisible();

      // ...and its reset option puts the whole roster back.
      await chooseHabitat(page, /all/i);
      await expect(rosterRows(page)).toHaveCount(ROSTER.length);
    });

    await test.step("an animal's detail screen renders its recorded fields", async () => {
      // Reached from the roster's own row link — the journey a person actually takes.
      await rosterRow(page, KAYA.name)
        .getByRole('link', { name: KAYA.name })
        .click();

      await expect(page).toHaveURL(DETAIL_PATH);
      await expect(
        page.getByRole('heading', { name: KAYA.name }),
      ).toBeVisible();
      await expectLightTheme(page);

      // Each value scoped to its own label, so a value shown against the wrong field fails.
      await expect(fieldValue(page, /^species\b/i)).toHaveText(KAYA.species);
      await expect(fieldValue(page, /^habitat\b/i)).toHaveText(KAYA.habitat);
      await expect(fieldValue(page, /^diet\b/i)).toHaveText(KAYA.diet);
      // Tolerates presentation around the number ("6 years") while still pinning the value.
      await expect(fieldValue(page, /^age\b/i)).toHaveText(
        new RegExp(`\\b${KAYA.age}\\b`),
      );
    });

    await test.step('the habitats reference list renders', async () => {
      await navLink(page, 'Habitats').click();

      await expect(page).toHaveURL('/habitats');
      // Arrival proved by the DATA: these names can only have come from the intercepted
      // `/api/habitats` response.
      for (const habitatName of HABITAT_NAMES) {
        await expect(
          page.getByRole('main').getByText(habitatName, { exact: true }),
        ).toBeVisible();
      }
      await expectLightTheme(page);
    });

    await test.step('the add form renders with entries that accept input', async () => {
      // Back to the roster and in through its own Add animal action.
      await navLink(page, 'Animals').click();
      await expect(rosterRows(page)).toHaveCount(ROSTER.length);
      await addAnimalAction(page).click();

      await expect(page).toHaveURL('/animals/new');
      await expect(animalForm(page)).toBeVisible();
      await expectLightTheme(page);
      await expectFormEntriesUsable(page);

      // Typing lands in the entry — an entry that looks fine but swallows keystrokes is
      // precisely the kind of breakage a styling pass can cause.
      await formField(page, /^name\b/i).fill(TYPED_NAME);
      await expect(formField(page, /^name\b/i)).toHaveValue(TYPED_NAME);

      // The habitat picker opens, offers every habitat, and takes a choice.
      await habitatSelect(page).click();
      for (const habitatName of HABITAT_NAMES) {
        await expect(
          page.getByRole('option', { name: habitatName }),
        ).toBeVisible();
      }
      await page.getByRole('option', { name: CHOSEN_HABITAT }).click();
      await expect(habitatSelect(page)).toContainText(CHOSEN_HABITAT);

      // The form is deliberately NOT submitted: this story is read-only (R5 § Out of Scope
      // — no behaviour change), and the create path belongs to epic 1's story 6 spec.
    });

    await test.step('the edit form renders prefilled and still accepts input', async () => {
      await page.goto(DETAIL_PATH);
      await expect(
        page.getByRole('heading', { name: KAYA.name }),
      ).toBeVisible();
      await editAnimalAction(page).click();

      await expect(page).toHaveURL(EDIT_PATH);
      await expect(animalForm(page)).toBeVisible();
      await expectLightTheme(page);
      await expectFormEntriesUsable(page);

      // Prefilled with the stored record — the edit form's content, which is what "renders
      // its content" means on this screen.
      await expect(formField(page, /^name\b/i)).toHaveValue(KAYA.name);
      await expect(formField(page, /^species\b/i)).toHaveValue(KAYA.species);
      await expect(formField(page, /^age\b/i)).toHaveValue(KAYA.age);
      await expect(formField(page, /^diet\b/i)).toHaveValue(KAYA.diet);
      await expect(habitatSelect(page)).toContainText(KAYA.habitat);

      // ...and still editable.
      await formField(page, /^age\b/i).fill(TYPED_AGE);
      await expect(formField(page, /^age\b/i)).toHaveValue(TYPED_AGE);

      // Again NOT saved — see the step above.
    });

    // No screen threw on the way through.
    expect(pageErrors).toEqual([]);

    // ...and nothing was written. Read-only asserted, not assumed: with no MSW layer, an
    // escaped write would have changed a row in the real database.
    expect(mutatingRequests).toEqual([]);
  });
});
