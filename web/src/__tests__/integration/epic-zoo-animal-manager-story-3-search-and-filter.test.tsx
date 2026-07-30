/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/page.tsx
 * - Page Action: modify_existing
 *
 * Epic `zoo-animal-manager`, Story 3 — search and habitat filter on the roster.
 *
 * The Playwright spec owns the live typing/selection interaction (AC-1, AC-2, AC-3).
 * This file owns the *matching rules* — which animals survive a term, a habitat, and
 * the two together — plus the two vitest-tagged criteria: the distinct "no matches"
 * wording (AC-4) and the guarantee that narrowing never re-loads data (AC-5).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THESE TESTS PIN — implement `web/src/app/page.tsx` to it
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * 1. **Rendered here as the page's default export.** `@/app/page` must stay renderable
 *    in jsdom — the roster screen is a **client** component fetching from the app's own
 *    `/api/animals` route handler (architecture.md Decision 1), so `page.tsx` must not
 *    become an `async` server component.
 *
 * 2. **One load, through `@/lib/api/client`.** Only that module is mocked (Critical
 *    Rule 2 — never `fetch()` in a component). The mock deliberately makes two things
 *    break the screen instead of passing silently:
 *      - a **second** `/api/animals` load rejects → so search/filter state must live in
 *        the browser over the roster already fetched (BR6, AC-5);
 *      - **any** habitats request rejects → this screen derives its habitat choices from
 *        the loaded roster and has no dependency on story 5 (the story's own note).
 *
 * 3. **Accessible names the queries rely on:**
 *      - the search control is a textbox/searchbox whose accessible name (label,
 *        `aria-label` or placeholder) mentions search / name / species;
 *      - the habitat filter is a `combobox` whose accessible name contains "habitat".
 *        Either a native `<select>` or Shadcn's Radix-backed `select` satisfies these
 *        tests — the helpers below drive both.
 *      - the filter offers a reset choice reading "All habitats" (or "Any habitat"),
 *        plus exactly one choice per **distinct habitat present in the loaded roster**.
 *
 * 4. **Two distinct messages, and this is a real requirement, not a nicety.** The
 *    empty-backend state (story 2) reads "no animals yet"; the narrowed-to-nothing state
 *    must talk about *matching* ("No animals match your search"). One shared
 *    "nothing here" message fails AC-4's test in both directions, by design.
 *
 * 5. Any debounce on the search input must stay short (≲300ms) — these tests wait for
 *    the narrowed roster rather than for a fixed delay, but they do not wait forever.
 *
 * These tests FAIL until story 3 is implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
// Project-wide entity factories — the single source of truth for these response
// bodies, shared with the Playwright layer. Response shapes are never written by hand.
import { createAnimalList, createAnimals } from '@/mocks/data/animal';
import { createHabitats } from '@/mocks/data/habitat';
import type { AnimalRead } from '@/types/api-generated';

import type { Mock } from 'vitest';

vi.mock('@/lib/api/client', () => ({ get: vi.fn() }));

// Cast rather than `vi.mocked`: `get` is generic (`get<T>(...) => Promise<T>`), so a
// typed mock implementation cannot return a concrete body without fighting `T`.
const mockGet = get as unknown as Mock;

/**
 * The App Router hooks, in case the roster screen reads the current path (active nav
 * section) or refreshes after a write in a later story. Harmless when unused — but
 * without them a component calling `usePathname()` outside a router throws in jsdom.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * The canonical roster (`createAnimals()`) every test below narrows. Ordered by `Name`,
 * as `GET /v1/animals` always returns it:
 *
 *   Anaya    African Elephant    Savannah      Herbivore
 *   Kaya     Bengal Tiger        Rainforest    Carnivore
 *   Nimbus   Green Sea Turtle    Aquarium      Omnivore
 *   Zuri     Scarlet Macaw       Rainforest    Herbivore
 *
 * Two animals share Rainforest, which is what makes the habitat filter a genuine
 * discriminator rather than a one-row lookup.
 */
function nameOf(animal: AnimalRead): string {
  if (!animal.Name) {
    throw new Error(
      'the shared animal factory produced an animal with no Name',
    );
  }
  return animal.Name;
}

const ALL_ANIMAL_NAMES = createAnimals().map(nameOf);

/**
 * A habitat the backend really has, which no animal in `ROSTER_WITHOUT_AQUARIUM`
 * occupies — so its absence from the filter's choices is evidence about where those
 * choices come from. Verified against the shared habitat factory at import time rather
 * than asserted in a test, so fixture drift breaks the suite loudly instead of quietly
 * hollowing out that evidence.
 */
const UNOCCUPIED_HABITAT = ((name: string): string => {
  if (!createHabitats().some((habitat) => habitat.Name === name)) {
    throw new Error(
      `${name} is no longer a habitat in web/src/mocks/data/habitat.ts — pick another habitat that the roster below leaves unoccupied`,
    );
  }
  return name;
})('Aquarium');

const ROSTER_WITHOUT_AQUARIUM = createAnimals().filter(
  (animal) => animal.HabitatName !== UNOCCUPIED_HABITAT,
);

const RAINFOREST = /^rainforest$/i;
const SAVANNAH = /^savannah$/i;
/** The filter's reset choice — "All habitats" / "Any habitat". */
const EVERY_HABITAT = /^(all|any)\b/i;

/**
 * Story 2's empty-backend copy ("no animals yet") and story 3's narrowed-to-nothing
 * copy (which must talk about *matching*). Each state asserts the presence of its own
 * message AND the absence of the other's — a single shared message cannot satisfy both
 * halves, which is the whole point of AC-4.
 */
const NO_ANIMALS_YET = /no animals\b.*\byet\b/i;
const NO_MATCHES = /match/i;

const HABITATS_MUST_NOT_BE_FETCHED =
  'This screen must not load habitats: its habitat choices come from the roster it already has (story 3 has no dependency on story 5).';
const ROSTER_MUST_NOT_RELOAD =
  'The roster was loaded a second time. Searching and filtering must narrow the roster already in the browser — the backend accepts no search/filter/sort/paging parameters (BR6, AC-5).';

/**
 * Serve the roster exactly once, and make every other request a failure the screen
 * cannot hide: a refetch or a habitats call surfaces as the story-2 failure state,
 * which the assertions below explicitly rule out. This is why no test here counts mock
 * calls — the forbidden extra load is expressed as something the *user* would see.
 */
function serveRosterOnce(animals: AnimalRead[]): void {
  let alreadyServed = false;

  mockGet.mockImplementation((endpoint: unknown) => {
    const path = String(endpoint);

    if (/habitat/i.test(path)) {
      return Promise.reject(new Error(HABITATS_MUST_NOT_BE_FETCHED));
    }
    if (!/animal/i.test(path)) {
      return Promise.reject(new Error(`Unexpected request to ${path}`));
    }
    if (alreadyServed) {
      return Promise.reject(new Error(ROSTER_MUST_NOT_RELOAD));
    }

    alreadyServed = true;
    return Promise.resolve(createAnimalList(animals));
  });
}

function renderRoster(animals: AnimalRead[] = createAnimals()) {
  serveRosterOnce(animals);

  // The real provider, because `useToast()` throws outside it and `layout.tsx` mounts
  // it around every page — mocking it would only hide a genuine wiring mistake.
  return render(
    <ToastProvider>
      <Home />
    </ToastProvider>,
  );
}

type UserEventInstance = ReturnType<typeof userEvent.setup>;

/**
 * `<input type="search">` exposes role `searchbox`, a plain input `textbox` — either is
 * a correct implementation, so probe for the narrower one first (`queryBy ?? getBy`,
 * never a `||` chain, which would never reach its right-hand side).
 */
function searchBox(): HTMLElement {
  const name = /search|name|species/i;
  return (
    screen.queryByRole('searchbox', { name }) ??
    screen.getByRole('textbox', { name })
  );
}

function habitatFilter(): HTMLElement {
  return screen.getByRole('combobox', { name: /habitat/i });
}

/** The habitat labels the filter offers, in the order it offers them. */
async function habitatChoices(user: UserEventInstance): Promise<string[]> {
  const filter = habitatFilter();

  if (filter instanceof HTMLSelectElement) {
    return within(filter)
      .getAllByRole('option')
      .map((option) => (option.textContent ?? '').trim());
  }

  await user.click(filter);
  const options = await screen.findAllByRole('option');
  return options.map((option) => (option.textContent ?? '').trim());
}

async function chooseHabitat(
  user: UserEventInstance,
  choice: RegExp,
): Promise<void> {
  const filter = habitatFilter();

  if (filter instanceof HTMLSelectElement) {
    await user.selectOptions(
      filter,
      within(filter).getByRole('option', { name: choice }),
    );
    return;
  }

  await user.click(filter);
  await user.click(await screen.findByRole('option', { name: choice }));
}

/**
 * The animals currently on screen, read by name.
 *
 * Testing Library matches an element's *own* text, so a name wrapped in a row link
 * (`<td><a>Anaya</a></td>`, which story 4 will introduce) still resolves to exactly one
 * element — and this stays agnostic about table-vs-card markup.
 */
function animalsOnScreen(): string[] {
  return ALL_ANIMAL_NAMES.filter(
    (name) => screen.queryAllByText(name).length > 0,
  );
}

/** Nothing in this story may surface the story-2 failure state. */
function expectNoLoadFailure(): void {
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /retry|try again/i }),
  ).not.toBeInTheDocument();
}

describe('Epic zoo-animal-manager, Story 3: search and habitat filter', () => {
  beforeAll(() => {
    // jsdom implements neither pointer capture, `Element.scrollIntoView`, nor
    // `ResizeObserver` — all three are used by Radix's Select (what Shadcn's `select`
    // primitive wraps) the moment its listbox opens. These are missing-browser-API
    // shims, not stubs of anything under test: a native `<select>` is unaffected, and
    // the Radix control becomes operable instead of throwing.
    const element = window.Element.prototype as unknown as Record<
      string,
      unknown
    >;
    element.hasPointerCapture ??= () => false;
    element.setPointerCapture ??= () => undefined;
    element.releasePointerCapture ??= () => undefined;
    element.scrollIntoView ??= () => undefined;

    if (!('ResizeObserver' in globalThis)) {
      class ResizeObserverShim implements ResizeObserver {
        observe(): void {
          return undefined;
        }
        unobserve(): void {
          return undefined;
        }
        disconnect(): void {
          return undefined;
        }
      }
      (
        globalThis as { ResizeObserver?: typeof ResizeObserver }
      ).ResizeObserver = ResizeObserverShim;
    }
  });

  beforeEach(() => {
    mockGet.mockReset();
  });

  // AC-1 — the matching rule behind "type to search"; the live keystroke-by-keystroke
  // narrowing is asserted in the Playwright spec.
  it('narrows to animals whose name contains the term, ignoring case', async () => {
    const user = userEvent.setup();
    renderRoster();
    await waitFor(() => expect(animalsOnScreen()).toEqual(ALL_ANIMAL_NAMES));

    // Upper-case and a fragment of a longer name: matching is case-insensitive and
    // substring-based, not an exact or prefix match.
    await user.type(searchBox(), 'AYA');

    await waitFor(() => expect(animalsOnScreen()).toEqual(['Anaya', 'Kaya']));
    expectNoLoadFailure();
  });

  // AC-1
  it('matches on species as well as name', async () => {
    const user = userEvent.setup();
    renderRoster();
    await waitFor(() => expect(animalsOnScreen()).toEqual(ALL_ANIMAL_NAMES));

    // 'macaw' appears in no animal's name — only in Zuri's species, "Scarlet Macaw".
    await user.type(searchBox(), 'macaw');

    await waitFor(() => expect(animalsOnScreen()).toEqual(['Zuri']));
    expectNoLoadFailure();
  });

  // AC-2
  it('narrows to the chosen habitat', async () => {
    const user = userEvent.setup();
    renderRoster();
    await waitFor(() => expect(animalsOnScreen()).toEqual(ALL_ANIMAL_NAMES));

    await chooseHabitat(user, RAINFOREST);

    // Both Rainforest animals, and only those.
    await waitFor(() => expect(animalsOnScreen()).toEqual(['Kaya', 'Zuri']));
    expectNoLoadFailure();
  });

  // AC-2 — the choices come from the loaded roster, not from a habitat fetch. Aquarium
  // is a real habitat in the shared fixtures but occupies no animal here, so a filter
  // built from `GET /api/habitats` (or a hard-coded list) offers it and fails this.
  it('offers only the habitats present in the loaded roster', async () => {
    const user = userEvent.setup();
    renderRoster(ROSTER_WITHOUT_AQUARIUM);
    await waitFor(() =>
      expect(animalsOnScreen()).toEqual(ROSTER_WITHOUT_AQUARIUM.map(nameOf)),
    );

    const choices = await habitatChoices(user);

    expect(choices).toEqual(expect.arrayContaining(['Savannah', 'Rainforest']));
    expect(choices).not.toContain(UNOCCUPIED_HABITAT);
    expectNoLoadFailure();
  });

  // AC-3
  it('applies a search term and a habitat together, keeping only animals matching both', async () => {
    const user = userEvent.setup();
    renderRoster();
    await waitFor(() => expect(animalsOnScreen()).toEqual(ALL_ANIMAL_NAMES));

    await user.type(searchBox(), 'AYA');
    await chooseHabitat(user, RAINFOREST);

    // 'AYA' alone keeps Anaya + Kaya; Rainforest alone keeps Kaya + Zuri. The
    // intersection is Kaya — a union would leave all three on screen.
    await waitFor(() => expect(animalsOnScreen()).toEqual(['Kaya']));
    expectNoLoadFailure();
  });

  // AC-3
  it('restores the full roster when the search is cleared and the habitat filter reset', async () => {
    const user = userEvent.setup();
    renderRoster();
    await waitFor(() => expect(animalsOnScreen()).toEqual(ALL_ANIMAL_NAMES));

    await user.type(searchBox(), 'macaw');
    await chooseHabitat(user, SAVANNAH);
    await waitFor(() => expect(animalsOnScreen()).toEqual([]));

    await user.clear(searchBox());
    await chooseHabitat(user, EVERY_HABITAT);

    await waitFor(() => expect(animalsOnScreen()).toEqual(ALL_ANIMAL_NAMES));
    expectNoLoadFailure();
  });

  // AC-4
  it('says "nothing matched" for a fruitless search, worded differently from "no animals yet"', async () => {
    const user = userEvent.setup();

    // A genuinely empty backend: story 2's empty state, which is a normal result.
    const emptyBackend = renderRoster([]);
    expect(await screen.findByText(NO_ANIMALS_YET)).toBeVisible();
    expect(screen.queryByText(NO_MATCHES)).not.toBeInTheDocument();
    emptyBackend.unmount();

    // A populated roster narrowed to nothing: a different situation, and the user is
    // told a different thing — their term is the reason, not an empty zoo.
    renderRoster();
    await waitFor(() => expect(animalsOnScreen()).toEqual(ALL_ANIMAL_NAMES));
    await user.type(searchBox(), 'quetzal');

    await waitFor(() => expect(animalsOnScreen()).toEqual([]));
    expect(screen.getByText(NO_MATCHES)).toBeVisible();
    expect(screen.queryByText(NO_ANIMALS_YET)).not.toBeInTheDocument();
    expectNoLoadFailure();
  });

  // AC-5
  it('narrows without loading the roster again', async () => {
    const user = userEvent.setup();
    renderRoster();
    await waitFor(() => expect(animalsOnScreen()).toEqual(ALL_ANIMAL_NAMES));

    // A second `/api/animals` request rejects (see `serveRosterOnce`), so a screen that
    // re-fetches on keystroke or on filter change collapses into the story-2 failure
    // state — losing the roster it was showing. Both narrowing steps below therefore
    // stand as evidence that the narrowing happened over data already in the browser.
    await user.type(searchBox(), 'AYA');
    await waitFor(() => expect(animalsOnScreen()).toEqual(['Anaya', 'Kaya']));

    await chooseHabitat(user, RAINFOREST);
    await waitFor(() => expect(animalsOnScreen()).toEqual(['Kaya']));

    expectNoLoadFailure();
  });
});
