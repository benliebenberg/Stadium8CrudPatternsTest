/**
 * Story Metadata:
 * - Route: /animals/[id]
 * - Target File: web/src/app/animals/[id]/page.tsx
 * - Page Action: create_new
 *
 * Epic `zoo-animal-manager`, Story 4 — one animal's full record.
 *
 * Covers the three `vitest`-tagged criteria — AC-2 (`LastChangedDate` rendered verbatim,
 * never converted a second time), AC-3 (`LastChangedUser` framed as a fixed system value,
 * never as per-person attribution) and AC-4 (loading placeholder, and a readable failure
 * with Retry) — plus the substance of AC-1 (every recorded field is on the page), which is
 * cheap at this layer. AC-1's navigation-from-the-roster half and AC-5 (the not-found page)
 * are `playwright`-tagged and live in
 * `web/e2e/epic-zoo-animal-manager-story-4-animal-detail.spec.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THE SEAM: `@/lib/api/client`, CALLED WITH THE APP'S OWN `/api/animals/{Id}` ENDPOINT
 * ─────────────────────────────────────────────────────────────────────────────────
 * architecture.md Decision 1: screens that read data are **client** components fetching
 * from the app's own route handler — same-origin `/api/animals/7` — which is the only thing
 * that talks to Linx (it injects the server-only `X-API-Key`). No component calls `fetch()`
 * itself (Critical Rule 2), so the one mocked module here is `@/lib/api/client`, the same
 * seam stories 2 and 3 pin.
 *
 * The single-animal read returns an `AnimalRead` **directly** — NOT wrapped in
 * `DefaultResponse` (that envelope is writes-only) and NOT wrapped in the `{ Animals: [...] }`
 * envelope the roster uses (brief BR8/R12). The mocks below therefore resolve a bare
 * `createAnimal(...)`, and code that unwraps a response shape it was never sent will fail.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THESE TESTS PIN — implement `web/src/app/animals/[id]/page.tsx` to it
 * ─────────────────────────────────────────────────────────────────────────────────
 * 1. **The default export takes no required props and reads the id from `useParams()`.**
 *    It must stay renderable in jsdom — a **client** component, never an `async` server
 *    component (Decision 1: a server-side read is invisible to both this seam and
 *    Playwright's `page.route()`, which is the whole reason the decision exists). Next's
 *    `params` prop is a Promise in this version and is not usable from a client component
 *    without `use()`; `useParams()` is the agreed way in.
 * 2. **The request goes through `get()` from `@/lib/api/client`, at the relative endpoint
 *    `/api/animals/{id}`** — the id straight from the route. An absolute Linx URL here would
 *    mean the shared API key reached the browser (see the `buildUrl()` trap in
 *    architecture.md).
 * 3. **The animal's name is the page heading.** `<h1>Thabo</h1>` — the record is *about* one
 *    animal, so the heading names it. A repeated "Name" field row is allowed but not required,
 *    which is why the name is asserted through the heading and not through a labelled field.
 * 4. **Every other recorded field is a labelled term/value pair: a `<dt>` label whose value is
 *    in the immediately-following `<dd>`** (a `<dl>` inside a Shadcn `card` is the natural
 *    shape). The helper below reads `label.nextElementSibling`, so a wrapping
 *    `<div><dt/><dd/></div>` is fine. Labels the queries rely on, each matching exactly one
 *    element on the page:
 *      - `/^species\b/i`, `/^age\b/i`, `/^habitat\b/i`, `/^diet\b/i`
 *      - `/^last (changed|updated)\b/i` — the timestamp. Must be the ONLY label starting that
 *        way, so don't also label the system value "Last changed by …".
 *      - `/^system\b/i` — the `LastChangedUser` value's label, e.g. "System source" or
 *        "System value". Starting the label with "System" is what makes the framing in point 6
 *        checkable, and keeps it distinct from any explanatory sentence that also says
 *        "system".
 * 5. **`LastChangedDate` is rendered character-for-character as the backend sent it** (BR13,
 *    R13). The backend's SQL already did
 *    `... AT TIME ZONE 'UTC' AT TIME ZONE 'South Africa Standard Time'` and handed over
 *    pre-formatted `'yyyy-MM-dd HH:mm:ss'` text, so the value element's text must equal that
 *    string **exactly**: never `new Date(...)`, never `toLocaleString()`, never Intl, never a
 *    date library, never a relative "2 days ago", and no appended suffix inside the value. If
 *    you want to tell the user the zone, put it in the **label** ("Last changed (SAST)"), not
 *    in the value. A second UTC→SAST conversion shifts every timestamp two hours forward —
 *    the fixtures below are chosen so that bug produces a visibly different string (and, for
 *    one of them, a different day and year).
 * 6. **`LastChangedUser` is presented as a fixed system value, never as a person** (BR14,
 *    R13). It reads the same on every record because there is no per-person identity and no
 *    login. So the page must not contain attribution phrasing — no "Changed by", "Updated by",
 *    "Author", "Person", "Staff", "Keeper", "Employee" — anywhere.
 * 7. **Loading:** an element with `role="status"` whose accessible name mentions "loading",
 *    matching story 2's contract (NFR-2 — never a blank screen). It is gone once the record
 *    arrives.
 * 8. **Failure:** a `role="alert"` carrying readable failure wording, plus a button named
 *    /retry|try again/i that re-issues the load — again story 2's contract, so the two screens
 *    behave the same way when the backend is unreachable.
 *
 * NOT here, deliberately:
 * - Edit (story 7) and Remove (story 9). The layout should leave room for them; this story
 *   must not build them, and nothing below asserts their presence *or* their absence — an
 *   absence assertion would fail the moment story 7 lands.
 * - The not-found state for a missing/deleted id (AC-5, `playwright`) and the shared shell's
 *   single `main` landmark (the per-epic baseline file owns that).
 *
 * These tests FAIL until story 4 is implemented (TDD red): the route does not exist yet.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AnimalDetailPage from '@/app/animals/[id]/page';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
// Project-wide entity factory — the single source of truth for this response body,
// shared with the Playwright layer. Response shapes are never written by hand here.
import { createAnimal } from '@/mocks/data/animal';
import type { APIError } from '@/types/api';
import type { AnimalRead } from '@/types/api-generated';

import type { Mock } from 'vitest';

vi.mock('@/lib/api/client', () => ({ get: vi.fn() }));

// Cast rather than `vi.mocked`: `get` is generic (`get<T>(...) => Promise<T>`), so a
// typed mock implementation cannot return a concrete body without fighting `T`.
const mockGet = get as unknown as Mock;

/** The id in the address bar for every render below. */
const ANIMAL_ID = 7;

/**
 * The App Router hooks. `useParams()` is how this page learns which animal to load
 * (contract point 1), and jsdom has no router context to read — calling it outside a
 * router throws. `notFound`/`redirect` are included because story 4 may reach for one
 * while building the AC-5 not-found path: a factory mock replaces the whole module, so an
 * export missing here would break the import rather than the behaviour.
 */
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: String(ANIMAL_ID) }),
  usePathname: () => `/animals/${ANIMAL_ID}`,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * Narrow a value the shared factory always populates. Every field on the generated API
 * types is optional (the spec declares no `required:` arrays), so an absent value means
 * the factory changed — not that the assertion should be skipped.
 */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`the shared animal factory no longer populates ${what}`);
  }
  return value;
}

const NAME = 'Thabo';
const SPECIES = 'Southern White Rhinoceros';
const AGE = 11;
const DIET = 'Herbivore';

/**
 * Read from the factory rather than hard-coded, so a change to the canonical habitat set
 * or to the fixed deployment name breaks loudly here instead of quietly hollowing out the
 * AC-3 assertions.
 */
const HABITAT = required(
  createAnimal({ HabitatId: 1 }).HabitatName,
  'a joined HabitatName for HabitatId 1',
);
const SYSTEM_VALUE = required(
  createAnimal().LastChangedUser,
  'LastChangedUser (the fixed deployment value)',
);

/**
 * Two `LastChangedDate` values, each paired with what a **second** UTC→SAST conversion
 * (SAST is UTC+2) would turn it into. Neither pair is a coincidence:
 *   - the first shifts the clock only — 08:15:42 → 10:15:42;
 *   - the second rolls over the day, the month and the year — 2026-12-31 22:40:11 →
 *     2027-01-01 00:40:11 — so a double conversion cannot hide inside a date-only display.
 */
const TIMESTAMPS = [
  { verbatim: '2026-07-24 08:15:42', doubleConverted: '2026-07-24 10:15:42' },
  { verbatim: '2026-12-31 22:40:11', doubleConverted: '2027-01-01 00:40:11' },
] as const;

const READABLE_FAILURE =
  /could not|couldn't|couldn’t|unable|failed|problem|went wrong/i;

const RETRY_ACTION = /retry|try again/i;

/** The timestamp's label, and the system value's label (contract point 4). */
const LAST_CHANGED_LABEL = /^last (changed|updated)\b/i;
const SYSTEM_LABEL = /^system\b/i;

/**
 * Wording that would present `LastChangedUser` as the person who made the change — the
 * exact misrepresentation BR14 forbids, since the value is one fixed deployment name and
 * this app has no per-person identity at all.
 */
const PERSONAL_ATTRIBUTION: readonly RegExp[] = [
  /\b(changed|updated|modified|edited|created|saved|amended)\s+by\b/i,
  /\bauthor(ed)?\b/i,
  /\b(person|people|staff|keeper|employee|editor)\b/i,
];

/**
 * What the API client throws when the backend cannot be reached at all — the shape R6
 * exists for (Linx down, or the shared key rejected).
 */
const CONNECTION_REFUSED: APIError = {
  message: 'Network error: Unable to connect to the API server',
  statusCode: 0,
  details: ['Please check your internet connection and try again.'],
  endpoint: `/api/animals/${ANIMAL_ID}`,
};

/**
 * The record every test loads, overridable per test. `HabitatId: 1` lets the factory join
 * the canonical `HabitatName`, so the fixture cannot claim a pairing the backend's INNER
 * JOIN could not produce.
 */
function animalRecord(overrides: Partial<AnimalRead> = {}): AnimalRead {
  return createAnimal({
    Id: ANIMAL_ID,
    Name: NAME,
    Species: SPECIES,
    Age: AGE,
    HabitatId: 1,
    Diet: DIET,
    LastChangedDate: TIMESTAMPS[0].verbatim,
    ...overrides,
  });
}

/**
 * The real `ToastProvider`, because `layout.tsx` mounts it around every page and
 * `useToast()` throws outside it — mocking it would only hide a genuine wiring mistake.
 */
function renderDetail() {
  return render(
    <ToastProvider>
      <AnimalDetailPage />
    </ToastProvider>,
  );
}

/** Every endpoint the screen asked the API client for, in order. */
function requestedEndpoints(): string[] {
  return mockGet.mock.calls.map((call) => String(call[0]));
}

/**
 * The value presented under a field's label — contract point 4: the label element's text
 * matches `label`, and its value sits in the immediately-following element.
 */
function valueFor(label: RegExp): string {
  const term = screen.getByText(label);
  const value = term.nextElementSibling;

  if (!value) {
    throw new Error(
      `no value element follows the "${term.textContent ?? ''}" label — each recorded field must be a label with its value in the next element (a <dt>/<dd> pair)`,
    );
  }

  return (value.textContent ?? '').trim();
}

/** Everything the user can read on the page, whitespace-normalised. */
function pageText(container: HTMLElement): string {
  return (container.textContent ?? '').replace(/\s+/g, ' ');
}

/** Resolve once the record has replaced the loading placeholder. */
async function findLoadedRecord(): Promise<HTMLElement> {
  return screen.findByRole('heading', {
    name: new RegExp(`\\b${NAME}\\b`, 'i'),
  });
}

/** A load still in flight, which the test completes when it chooses to. */
function deferredAnimal(): {
  promise: Promise<AnimalRead>;
  resolve: (animal: AnimalRead) => void;
} {
  let resolve!: (animal: AnimalRead) => void;
  const promise = new Promise<AnimalRead>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('Epic zoo-animal-manager, Story 4: animal detail view', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  // AC-1 — the record's substance. Playwright owns getting here from the roster.
  it('shows every recorded field for the animal it was asked for', async () => {
    // A bare `AnimalRead`, exactly as `GET /v1/animals/{Id}` sends it (BR8): unwrapped by
    // `DefaultResponse` and unwrapped by the roster's `{ Animals: [...] }` envelope.
    mockGet.mockResolvedValue(animalRecord());

    renderDetail();
    await findLoadedRecord();

    expect(valueFor(/^species\b/i)).toBe(SPECIES);
    // Tolerates presentation around the number ("11 years") while still pinning the value.
    expect(valueFor(/^age\b/i)).toMatch(new RegExp(`\\b${AGE}\\b`));
    // Read straight from the animal's own pre-joined `HabitatName` (R9/BR5) — no second
    // call resolves it.
    expect(valueFor(/^habitat\b/i)).toBe(HABITAT);
    expect(valueFor(/^diet\b/i)).toBe(DIET);
    // Both audit fields are part of "every recorded field"; AC-2 and AC-3 below pin how
    // each of them must read.
    expect(valueFor(LAST_CHANGED_LABEL)).toBe(TIMESTAMPS[0].verbatim);
    expect(valueFor(SYSTEM_LABEL)).toBe(SYSTEM_VALUE);

    // Architecture Decision 1: the record comes from the app's OWN route handler, by
    // relative path, with the id from the route. An absolute Linx URL here would mean the
    // shared API key reached the browser.
    const detailEndpoint = requestedEndpoints().find((endpoint) =>
      new RegExp(`^/api/animals/${ANIMAL_ID}(\\?|$)`).test(endpoint),
    );
    expect(detailEndpoint).toBeDefined();
  });

  // AC-2 — the highest-value assertion in this story. The backend already converted
  // UTC → SAST and handed over pre-formatted text (BR13), so the app's only job is to not
  // touch it. Two fixtures, because a shift that is invisible in one (same day) rolls the
  // date, month and year in the other.
  it('renders the last-changed date exactly as the backend sent it, with no second conversion and no reformatting', async () => {
    for (const { verbatim, doubleConverted } of TIMESTAMPS) {
      mockGet.mockReset();
      mockGet.mockResolvedValue(animalRecord({ LastChangedDate: verbatim }));

      const view = renderDetail();
      await findLoadedRecord();

      // Character-identical. This fails on a two-hour shift (a re-parse as UTC plus a
      // second SAST conversion), AND on any reformat — `toLocaleString()`, an ISO string,
      // a relative "2 days ago", or a "(SAST)" suffix glued onto the value. Anything the
      // app wants to add about the zone belongs in the label.
      expect(valueFor(LAST_CHANGED_LABEL)).toBe(verbatim);

      const text = pageText(view.container);
      // The shifted value appears nowhere on the page — not in the field, not in a tooltip,
      // not in a second "friendlier" rendering beside it.
      expect(text).not.toContain(doubleConverted);
      // And nothing here was handed to a date library: an ISO-8601 rendering of this value
      // is the tell-tale of `new Date(...)` having been involved.
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);

      view.unmount();
    }
  });

  // AC-3 — `LastChangedUser` is one fixed deployment value on every record (project.md
  // §`LastChangedUser` header, BR14). It answers "when was this last touched", never "who
  // touched it", and the page must not claim otherwise.
  it('presents the last-changed name as a fixed system value, never as the person who made the change', async () => {
    mockGet.mockResolvedValue(animalRecord());

    const view = renderDetail();
    await findLoadedRecord();

    // Labelled as a system value — the framing is the requirement, not just the value.
    expect(valueFor(SYSTEM_LABEL)).toBe(SYSTEM_VALUE);

    const text = pageText(view.container);
    // No attribution phrasing anywhere: "Changed by Animal Manager" would read as a person
    // who does not exist. There is no login, no user store and no per-person identity in
    // this project.
    for (const phrasing of PERSONAL_ATTRIBUTION) {
      expect(text).not.toMatch(phrasing);
    }
  });

  // AC-4
  it('shows a loading placeholder while the record is in flight, then replaces it with the record', async () => {
    const inFlight = deferredAnimal();
    mockGet.mockReturnValue(inFlight.promise);

    renderDetail();

    // Never a blank screen while the request is open (NFR-2).
    expect(
      await screen.findByRole('status', { name: /loading/i }),
    ).toBeInTheDocument();
    // And never the failure state pre-empting a request that has not answered.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    inFlight.resolve(animalRecord());

    await findLoadedRecord();
    expect(valueFor(/^species\b/i)).toBe(SPECIES);
    expect(
      screen.queryByRole('status', { name: /loading/i }),
    ).not.toBeInTheDocument();
  });

  // AC-4
  it('offers a readable failure with a Retry action, and Retry loads the record', async () => {
    const user = userEvent.setup();
    mockGet
      .mockRejectedValueOnce(CONNECTION_REFUSED)
      .mockResolvedValueOnce(animalRecord());

    renderDetail();

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent(READABLE_FAILURE);
    // A failure is not a blank record: no empty labelled fields left on screen while the
    // load is broken (R14's "never a row of blanks", here for the failure case).
    expect(screen.queryByText(LAST_CHANGED_LABEL)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: RETRY_ACTION }));

    // The record appearing from the SECOND response is what proves Retry re-attempted the
    // load rather than just clearing the message.
    await findLoadedRecord();
    expect(valueFor(LAST_CHANGED_LABEL)).toBe(TIMESTAMPS[0].verbatim);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
