/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/page.tsx
 * - Page Action: modify_existing
 *
 * Epic `zoo-animal-manager`, Story 2 — app shell and animal roster home screen.
 *
 * Covers the four `vitest`-tagged criteria: AC-2 (every animal shows Name, Species,
 * Age, Habitat and Diet), AC-3 (a loading placeholder — never a blank screen), AC-4
 * (an empty backend reads as a normal result, not a failure) and AC-5 (a failed load
 * is readable and retryable). AC-1 (roster-as-home-screen, shell navigation, no auth
 * chrome) and AC-6 (exactly one `main` landmark + a real-browser accessibility scan)
 * are `playwright`-tagged and live in
 * `web/e2e/epic-zoo-animal-manager-story-2-app-shell-and-roster.spec.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THE SEAM: `@/lib/api/client`, CALLED WITH THE APP'S OWN `/api/animals` ENDPOINT
 * ─────────────────────────────────────────────────────────────────────────────────
 * architecture.md Decision 1: the roster is a **client** component, and its data comes
 * from the app's OWN route handler — same-origin `/api/animals` — which is the only thing
 * that talks to Linx (it injects the server-only `X-API-Key`). The browser never learns
 * the Linx base URL, and no component calls `fetch()` itself (Critical Rule 2), so the
 * one mocked module here is `@/lib/api/client` — the fixed convention in
 * testing-policy.md, and the same seam story 3's test file pins.
 *
 * The endpoint the roster asks for is asserted below: it must be the relative
 * `/api/animals`, never an absolute Linx URL. That is the browser-side half of the
 * boundary Playwright intercepts with `page.route('**\/api\/animals**')`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THESE TESTS PIN — implement `web/src/app/page.tsx` to it
 * ─────────────────────────────────────────────────────────────────────────────────
 * 1. **`page.tsx`'s default export renders synchronously** — a client component, or a
 *    sync server component wrapping the client roster. NOT an `async` server component:
 *    a server-side read is invisible to both `page.route()` and this seam, which is the
 *    whole reason Decision 1 exists.
 * 2. **The roster's request goes through `get()` from `@/lib/api/client`, with the
 *    relative endpoint `/api/animals`.** Note the template's `buildUrl()` prefixes every
 *    endpoint with `API_BASE_URL` (the Linx base) — a browser-side call must resolve
 *    same-origin instead, so story 1's client rework has to make an `/api/*` endpoint
 *    stay relative. Getting that wrong leaks the shared key and dies on CORS at runtime
 *    while both test layers stay green (see the note returned to the orchestrator).
 * 3. **The roster is a real table** (Shadcn `table`, per the story's notes): one `row` per
 *    animal and one `cell` per field, so Name/Species/Age/Habitat/Diet are readable *per
 *    animal* rather than as five unrelated lists.
 * 4. **Loading:** an element with `role="status"` whose accessible name mentions
 *    "loading" (e.g. `<div role="status" aria-label="Loading animals">` wrapping the
 *    Shadcn skeletons). It is gone once the roster arrives.
 * 5. **Empty:** a message matching /no animals … yet/i, with NO `role="alert"` and NO
 *    retry button — an empty zoo is a legitimate success, not a failure (AC-4). Story 3's
 *    narrowed-to-nothing message must stay worded differently ("no animals match …").
 * 6. **Failure:** a `role="alert"` carrying readable failure wording, plus a button named
 *    /retry|try again/i that re-issues the load. A failed load must never fall through to
 *    the empty state — "we could not load this" and "there is nothing here" are different
 *    facts about the world.
 * 7. **A response that is not a roster is a failure, not an empty roster.** Guard on the
 *    shape (`Array.isArray(body.Animals)`), because the route handler answers a refused
 *    Linx read with a message body and no `Animals` — reporting an outage as an empty zoo
 *    is the exact all-green-all-wrong bug this test exists to close.
 *
 * These tests FAIL until the roster is implemented (TDD red): `page.tsx` currently
 * renders the starter template's welcome page.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HomePage from '@/app/page';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
// Project-wide entity factories — the single source of truth for these response bodies,
// shared with the Playwright layer. Response shapes are never hand-written here.
import {
  createAnimal,
  createAnimalList,
  createAnimals,
} from '@/mocks/data/animal';
import type { APIError } from '@/types/api';
import type { AnimalRead, AnimalReadList } from '@/types/api-generated';

import type { Mock } from 'vitest';

vi.mock('@/lib/api/client', () => ({ get: vi.fn() }));

// Cast rather than `vi.mocked`: `get` is generic (`get<T>(...) => Promise<T>`), so a
// typed mock implementation cannot return a concrete body without fighting `T`.
const mockGet = get as unknown as Mock;

/**
 * The App Router hooks, because the shell marks the current section (`/` = Animals) and
 * jsdom has no router context to read — `usePathname()` outside a router throws.
 */
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Story 2's empty-backend copy. Story 3 pins the same pattern for the state it must NOT
 * reuse, so the two files cannot drift onto one shared "nothing here" message.
 */
const NO_ANIMALS_YET = /no animals\b.*\byet\b/i;

const READABLE_FAILURE =
  /could not|couldn't|couldn’t|unable|failed|problem|went wrong/i;

const RETRY_ACTION = /retry|try again/i;

/**
 * What the API client throws when the backend cannot be reached at all — the shape R6
 * exists for (Linx down, or the shared key rejected).
 */
const CONNECTION_REFUSED: APIError = {
  message: 'Network error: Unable to connect to the API server',
  statusCode: 0,
  details: ['Please check your internet connection and try again.'],
  endpoint: '/api/animals',
};

/** A load that answered, but with a message instead of a roster (see contract note 7). */
const NOT_A_ROSTER = { Messages: ['The animal roster could not be loaded'] };

/** A load still in flight, which the test completes when it chooses to. */
function deferredRoster(): {
  promise: Promise<AnimalReadList>;
  resolve: (roster: AnimalReadList) => void;
} {
  let resolve!: (roster: AnimalReadList) => void;
  const promise = new Promise<AnimalReadList>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Every endpoint the screen asked the API client for, in order. */
function requestedEndpoints(): string[] {
  return mockGet.mock.calls.map((call) => String(call[0]));
}

/**
 * The real `ToastProvider`, because `layout.tsx` mounts it around every page and
 * `useToast()` throws outside it — mocking it would only hide a genuine wiring mistake.
 */
function renderRoster() {
  return render(
    <ToastProvider>
      <HomePage />
    </ToastProvider>,
  );
}

/**
 * Narrow a fixture field. Every field on the generated API types is optional (the spec
 * declares no `required:` arrays), but the shared factory always populates these — so an
 * absent value means the factory changed, not that the assertion should be skipped.
 */
function fixtureValue(
  value: string | number | undefined,
  field: string,
): string {
  if (value === undefined) {
    throw new Error(`the shared animal factory no longer populates ${field}`);
  }
  return String(value);
}

/**
 * Match a field's value inside a cell, tolerating surrounding presentation ("12 years",
 * "Diet: Herbivore") while still pinning the value itself.
 */
function cellPattern(
  value: string | number | undefined,
  field: string,
): RegExp {
  const escaped = fixtureValue(value, field).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  return new RegExp(`\\b${escaped}\\b`);
}

/** The roster row for one animal, found by the animal's own name. */
function rowFor(animal: AnimalRead): HTMLElement {
  return screen.getByRole('row', { name: cellPattern(animal.Name, 'Name') });
}

describe('Epic zoo-animal-manager, Story 2: animal roster home screen', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  // AC-2
  it('shows Name, Species, Age, Habitat and Diet for every animal on the roster', async () => {
    const animals = createAnimals();
    mockGet.mockResolvedValue(createAnimalList(animals));

    renderRoster();

    // Wait for the first animal, then read the rest of the roster synchronously.
    await screen.findByRole('row', {
      name: cellPattern(animals[0].Name, 'Name'),
    });

    for (const animal of animals) {
      const row = rowFor(animal);

      expect(
        within(row).getByRole('cell', {
          name: cellPattern(animal.Species, 'Species'),
        }),
      ).toBeInTheDocument();
      expect(
        within(row).getByRole('cell', { name: cellPattern(animal.Age, 'Age') }),
      ).toBeInTheDocument();
      // Read straight from the animal's own pre-joined `HabitatName` (R9/BR5) — the
      // three habitats differ across these rows, so a single hard-coded habitat name or
      // a name resolved from the wrong record cannot satisfy this.
      expect(
        within(row).getByRole('cell', {
          name: cellPattern(animal.HabitatName, 'HabitatName'),
        }),
      ).toBeInTheDocument();
      expect(
        within(row).getByRole('cell', {
          name: cellPattern(animal.Diet, 'Diet'),
        }),
      ).toBeInTheDocument();
    }

    // The whole set, plus the column-header row: nothing dropped or truncated on the
    // client. The backend already dropped anything it could not join (BR5), and it sends
    // every animal on every request (BR6).
    expect(screen.getAllByRole('row')).toHaveLength(animals.length + 1);

    // Architecture Decision 1: the roster reads the app's OWN route handler, by relative
    // path. An absolute Linx URL here would mean the shared API key reached the browser.
    const rosterEndpoint = requestedEndpoints().find((endpoint) =>
      endpoint.startsWith('/api/animals'),
    );
    expect(rosterEndpoint).toBeDefined();
  });

  // AC-2
  it('still renders an animal whose record carries no joined habitat name', async () => {
    // The backend INNER JOINs Habitat, so an animal with an unmatched `HabitatId` never
    // reaches the app at all (BR5) — this pins graceful degradation if one ever did, and
    // deliberately does NOT assert the row is filtered out, which would encode a rule
    // this screen does not own.
    const orphan = createAnimal({
      Id: 99,
      Name: 'Solo',
      Species: 'Rock Hyrax',
      Age: 3,
      HabitatId: 999,
      HabitatName: undefined,
      Diet: 'Herbivore',
    });
    mockGet.mockResolvedValue(createAnimalList([orphan]));

    renderRoster();

    const row = await screen.findByRole('row', {
      name: cellPattern(orphan.Name, 'Name'),
    });

    expect(
      within(row).getByRole('cell', {
        name: cellPattern(orphan.Species, 'Species'),
      }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('cell', { name: cellPattern(orphan.Age, 'Age') }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('cell', { name: cellPattern(orphan.Diet, 'Diet') }),
    ).toBeInTheDocument();

    // A missing habitat name is a gap, not a value to print: no `undefined`/`null`/`NaN`
    // leaking into the row, and no failure state raised over one incomplete record.
    expect(
      within(row).queryByText(/undefined|null|NaN/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // AC-3
  it('shows a loading placeholder while the roster is in flight, then replaces it with the roster', async () => {
    const inFlight = deferredRoster();
    mockGet.mockReturnValue(inFlight.promise);

    renderRoster();

    // Never a blank screen while the request is open (NFR-2).
    expect(
      await screen.findByRole('status', { name: /loading/i }),
    ).toBeInTheDocument();
    // And never the empty or failure state pre-empting a request that has not answered.
    expect(screen.queryByText(NO_ANIMALS_YET)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    inFlight.resolve(createAnimalList());

    const [first] = createAnimals();
    expect(
      await screen.findByRole('row', { name: cellPattern(first.Name, 'Name') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: /loading/i }),
    ).not.toBeInTheDocument();
  });

  // AC-4
  it('presents an empty backend as a normal result, distinct from a failure', async () => {
    mockGet.mockResolvedValue(createAnimalList([]));

    renderRoster();

    expect(await screen.findByText(NO_ANIMALS_YET)).toBeInTheDocument();
    // The distinction is the requirement: an empty zoo raises no alert and offers no
    // retry, because there is nothing to recover from.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: RETRY_ACTION }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: /loading/i }),
    ).not.toBeInTheDocument();
  });

  // AC-5
  it('offers a readable failure with a Retry action, and Retry loads the roster', async () => {
    const user = userEvent.setup();
    mockGet
      .mockRejectedValueOnce(CONNECTION_REFUSED)
      .mockResolvedValueOnce(createAnimalList());

    renderRoster();

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent(READABLE_FAILURE);
    // A failure is not an empty zoo (AC-4's state must not stand in for this one).
    expect(screen.queryByText(NO_ANIMALS_YET)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: RETRY_ACTION }));

    // The roster appearing from the SECOND response is what proves Retry re-attempted the
    // load rather than just clearing the message.
    const [first] = createAnimals();
    expect(
      await screen.findByRole('row', { name: cellPattern(first.Name, 'Name') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // AC-5
  it('treats a response that carries no roster as a failure, never as an empty roster', async () => {
    // The other half of R6: the request completes, but not with a roster — this is what
    // the route handler answers with when the Linx read is refused. Silently rendering
    // "no animals yet" here would report an outage as an empty zoo.
    mockGet.mockResolvedValue(NOT_A_ROSTER);

    renderRoster();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: RETRY_ACTION }),
    ).toBeInTheDocument();
    expect(screen.queryByText(NO_ANIMALS_YET)).not.toBeInTheDocument();
  });
});
