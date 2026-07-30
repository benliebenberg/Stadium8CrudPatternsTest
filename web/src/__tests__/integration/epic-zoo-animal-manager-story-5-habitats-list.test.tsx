/**
 * Story Metadata:
 * - Route: /habitats
 * - Target File: web/src/app/habitats/page.tsx
 * - Page Action: create_new
 *
 * Epic `zoo-animal-manager`, Story 5 — habitats reference list (read-only).
 *
 * Covers the three `vitest`-tagged criteria: AC-2 (each habitat shows its Name and its
 * last-changed details, with the date rendered exactly as the backend sent it), AC-3
 * (separate loading / no-habitats / failed-to-load states, the last with a Retry that
 * re-attempts the load) and AC-4 (no add, edit or delete affordance anywhere on the
 * screen — including disabled ones).
 *
 * AC-1 (following the Habitats nav opens this screen with Habitats marked current) is
 * `playwright`-tagged and lives in
 * `web/e2e/epic-zoo-animal-manager-story-5-habitats-list.spec.ts`.
 *
 * AC-5 — "the screen reads as an intentionally look-only, complete reference rather than
 * an unfinished editor" — is tagged `none` and is DELIBERATELY NOT AUTOMATED here. It is a
 * judgement call about how the screen reads, verified by eye at the manual-test gate. AC-4
 * below is its mechanical half (no affordance exists); whether the result *feels*
 * deliberate is not something jsdom can answer, and a test pretending to answer it would
 * only give false confidence on the story's core design problem.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THE SEAM: `@/lib/api/client`, CALLED WITH THE APP'S OWN `/api/habitats` ENDPOINT
 * ─────────────────────────────────────────────────────────────────────────────────
 * architecture.md Decision 1: this screen is a **client** component reading the app's OWN
 * route handler — same-origin `/api/habitats` — which is the only thing that talks to Linx
 * (it injects the server-only `X-API-Key`). No component calls `fetch()` itself (Critical
 * Rule 2), so the one mocked module here is `@/lib/api/client`, the same seam stories 2
 * and 3 pin. The endpoint asked for is asserted below: relative, never an absolute Linx
 * URL — that is the browser-side half of the boundary Playwright intercepts with
 * `page.route('**\/api\/habitats**')`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THESE TESTS PIN — implement `web/src/app/habitats/page.tsx` to it
 * ─────────────────────────────────────────────────────────────────────────────────
 * 1. **`page.tsx`'s default export renders synchronously** — a client component, or a sync
 *    server component wrapping the client list. NOT an `async` server component: a
 *    server-side read is invisible to both `page.route()` and this seam, which is the whole
 *    reason Decision 1 exists.
 * 2. **The load goes through `get()` from `@/lib/api/client`, with the relative endpoint
 *    `/api/habitats`**, and the response envelope is `{ Habitats: HabitatRead[] }`.
 * 3. **One `row` per habitat, inside a table** (the epic brief assigns Shadcn `table` to
 *    the animal/habitat lists), each row carrying that habitat's Name, last-changed name
 *    and last-changed date. Reading a habitat's details must be a per-habitat act, not
 *    three unrelated columns of text.
 * 4. **The date is printed verbatim** — the exact `'yyyy-MM-dd HH:mm:ss'` text the backend
 *    sent, which is ALREADY South Africa Standard Time (BR13). Never `new Date(...)` it,
 *    never hand it to a date library, never re-format it. The tests below assert the
 *    character-identical string is present AND that the +2h re-converted variant is not,
 *    because a second conversion is the specific bug BR13 exists to prevent.
 * 5. **Loading:** an element with `role="status"` whose accessible name mentions "loading"
 *    (e.g. `<div role="status" aria-label="Loading habitats">` around Shadcn skeletons),
 *    gone once the list arrives (NFR-2 — never a blank screen).
 * 6. **Empty:** a message matching /no habitats/i, with NO `role="alert"` and NO retry
 *    button — an empty habitats table is a legitimate success, not a failure.
 * 7. **Failure:** a `role="alert"` carrying readable failure wording plus a button named
 *    /retry|try again/i that RE-ISSUES the load. A failure must never fall through to the
 *    empty state: "we could not load this" and "there is nothing here" are different facts.
 * 8. **A response that is not a habitat list is a failure, not an empty list** — guard on
 *    the shape (`Array.isArray(body.Habitats)`), because the route handler answers a
 *    refused Linx read with a message body and no `Habitats`.
 * 9. **No write affordance, and mind the wording of what IS on the screen.** AC-4's sweep
 *    rejects any button/link/menu item whose name matches
 *    /add|new|create|edit|update|delete|remove/i, including disabled ones. Two practical
 *    consequences for the implementation: label the audit column **"Last changed"** (the
 *    domain wording used throughout this epic), not "Last updated"; and do not add
 *    column-sort buttons — no AC asks for sorting and the backend documents no ordering for
 *    `GET /v1/habitats`. A Retry button is fine; "retry" is not a write.
 *
 * These tests FAIL until story 5 is implemented (TDD red): `web/src/app/habitats/page.tsx`
 * does not exist yet.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HabitatsPage from '@/app/habitats/page';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
// Project-wide entity factory — the single source of truth for this response body,
// shared with the Playwright layer. Response shapes are never hand-written here.
import {
  createHabitat,
  createHabitatList,
  createHabitats,
} from '@/mocks/data/habitat';
import type { APIError } from '@/types/api';
import type { HabitatRead, HabitatReadList } from '@/types/api-generated';

import type { Mock } from 'vitest';

vi.mock('@/lib/api/client', () => ({ get: vi.fn() }));

// Cast rather than `vi.mocked`: `get` is generic (`get<T>(...) => Promise<T>`), so a typed
// mock implementation cannot return a concrete body without fighting `T`.
const mockGet = get as unknown as Mock;

/**
 * The App Router hooks — the shell marks the current section from the path, and jsdom has
 * no router context to read (`usePathname()` outside a router throws).
 */
vi.mock('next/navigation', () => ({
  usePathname: () => '/habitats',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

/** The no-habitats copy. Deliberately distinct from the failure wording below. */
const NO_HABITATS = /\bno habitats\b/i;

const READABLE_FAILURE =
  /could not|couldn't|couldn’t|unable|failed|problem|went wrong/i;

const RETRY_ACTION = /retry|try again/i;

/**
 * Any control that would imply habitats can be added, changed or removed. Only
 * `GET /v1/habitats` exists on the backend (R16/BR7) — this is a backend capability limit,
 * not a permission rule — so every one of these is a lie to the user, whether it is
 * enabled, greyed out, or parked behind a "coming soon".
 */
const WRITE_AFFORDANCE = /\b(add|new|create|edit|update|delete|remove)\b/i;

/** Copy that promises habitat editing later rather than shipping a button for it. */
const COMING_SOON =
  /coming soon|not yet available|under construction|in progress/i;

/**
 * What the API client throws when the backend cannot be reached at all — the shape R6
 * exists for (Linx down, or the shared key rejected).
 */
const CONNECTION_REFUSED: APIError = {
  message: 'Network error: Unable to connect to the API server',
  statusCode: 0,
  details: ['Please check your internet connection and try again.'],
  endpoint: '/api/habitats',
};

/** A load that answered, but with a message instead of a habitat list (contract note 8). */
const NOT_A_HABITAT_LIST = {
  Messages: ['The habitat list could not be loaded'],
};

/** A load still in flight, which the test completes when it chooses to. */
function deferredHabitats(): {
  promise: Promise<HabitatReadList>;
  resolve: (habitats: HabitatReadList) => void;
} {
  let resolve!: (habitats: HabitatReadList) => void;
  const promise = new Promise<HabitatReadList>((settle) => {
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
function renderHabitats() {
  return render(
    <ToastProvider>
      <HabitatsPage />
    </ToastProvider>,
  );
}

/**
 * Narrow a fixture field. Every field on the generated API types is optional (the spec
 * declares no `required:` arrays), but the shared factory always populates these — so an
 * absent value means the factory changed, not that the assertion should be skipped.
 */
function fixtureText(value: string | undefined, field: string): string {
  if (value === undefined) {
    throw new Error(`the shared habitat factory no longer populates ${field}`);
  }
  return value;
}

/**
 * Match a value inside a row or cell, tolerating surrounding presentation ("Last changed:
 * …") while still pinning the value itself.
 */
function textPattern(value: string): RegExp {
  return new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
}

/** The reference row for one habitat, found by the habitat's own name. */
function rowFor(habitat: HabitatRead): HTMLElement {
  return screen.getByRole('row', {
    name: textPattern(fixtureText(habitat.Name, 'Name')),
  });
}

/**
 * The WRONG string: the backend's already-SAST text re-parsed as if it were UTC and
 * converted to South Africa Standard Time a second time (+2h). Deriving it from the
 * fixture rather than hard-coding it means the assertion keeps its teeth if the fixture
 * timestamps ever change.
 *
 * `'2026-07-21 09:15:00'` → `'2026-07-21 11:15:00'`.
 */
function convertedASecondTime(preformatted: string): string {
  const parsedAsUtc = new Date(`${preformatted.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsedAsUtc.getTime())) {
    throw new Error(
      `the habitat factory no longer produces 'yyyy-MM-dd HH:mm:ss' text: ${preformatted}`,
    );
  }
  const shifted = new Date(parsedAsUtc.getTime() + 2 * 60 * 60 * 1000);
  return shifted.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Every control on the screen that reads as a habitat write, by name. `hidden: true`
 * widens the sweep to controls hidden from assistive tech but still visible to a sighted
 * user — an `aria-hidden` "Add habitat" button is exactly as much of a lie as a plain one.
 * Names are read from `aria-label` (icon-only controls) or text content.
 */
function writeAffordances(): string[] {
  return [
    ...screen.queryAllByRole('button', { hidden: true }),
    ...screen.queryAllByRole('link', { hidden: true }),
    ...screen.queryAllByRole('menuitem', { hidden: true }),
  ]
    .map((control) =>
      (control.getAttribute('aria-label') ?? control.textContent ?? '').trim(),
    )
    .filter((name) => WRITE_AFFORDANCE.test(name));
}

describe('Epic zoo-animal-manager, Story 5: habitats reference list', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  // AC-2
  it('shows each habitat with its last-changed details, the date exactly as the backend sent it', async () => {
    const habitats = createHabitats();
    mockGet.mockResolvedValue(createHabitatList(habitats));

    renderHabitats();

    // Wait for the first habitat, then read the rest of the reference synchronously.
    await screen.findByRole('row', {
      name: textPattern(fixtureText(habitats[0].Name, 'Name')),
    });

    for (const habitat of habitats) {
      const row = rowFor(habitat);
      const name = fixtureText(habitat.Name, 'Name');
      const changedBy = fixtureText(habitat.LastChangedUser, 'LastChangedUser');
      const changedAt = fixtureText(habitat.LastChangedDate, 'LastChangedDate');

      expect(
        within(row).getByRole('cell', { name: textPattern(name) }),
      ).toBeInTheDocument();
      expect(row).toHaveTextContent(changedBy);

      // Character-identical: the pre-formatted SAST text, printed as given (BR13). A
      // re-format ("21 July 2026, 09:15") or a re-conversion fails here.
      expect(row).toHaveTextContent(changedAt);
      // And specifically NOT converted a second time — the +2h shift is the bug BR13
      // names, and it is invisible unless asserted against.
      expect(row).not.toHaveTextContent(convertedASecondTime(changedAt));
      // Nor round-tripped through a date object and re-serialised.
      expect(row).not.toHaveTextContent(/\d{4}-\d{2}-\d{2}T/);

      // Each row carries its OWN timestamp: a single hard-coded date, or one habitat's
      // date leaking onto another's row, cannot satisfy this.
      for (const other of habitats) {
        if (other.Id === habitat.Id) continue;
        expect(row).not.toHaveTextContent(
          fixtureText(other.LastChangedDate, 'LastChangedDate'),
        );
      }
    }

    // The whole set plus the column-header row: nothing dropped or truncated.
    expect(screen.getAllByRole('row')).toHaveLength(habitats.length + 1);

    // Architecture Decision 1: the app's OWN route handler, by relative path. An absolute
    // Linx URL here would mean the shared API key reached the browser.
    const habitatsEndpoint = requestedEndpoints().find((endpoint) =>
      endpoint.startsWith('/api/habitats'),
    );
    expect(habitatsEndpoint).toBeDefined();
  });

  // AC-2
  it('still shows a habitat whose record carries no last-changed details', async () => {
    // `LastChangedUser`/`LastChangedDate` are optional on the generated type, and a habitat
    // row written outside the app's flow can arrive without them. A gap is not a value to
    // print, and one incomplete record is not an outage.
    const undated = createHabitat({
      Id: 4,
      Name: 'Nocturnal House',
      LastChangedUser: undefined,
      LastChangedDate: undefined,
    });
    mockGet.mockResolvedValue(createHabitatList([undated]));

    renderHabitats();

    const row = await screen.findByRole('row', {
      name: textPattern(fixtureText(undated.Name, 'Name')),
    });

    expect(
      within(row).getByRole('cell', {
        name: textPattern(fixtureText(undated.Name, 'Name')),
      }),
    ).toBeInTheDocument();
    expect(
      within(row).queryByText(/undefined|null|NaN/i),
    ).not.toBeInTheDocument();
    expect(row).not.toHaveTextContent(/Invalid Date/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // AC-3
  it('shows a loading placeholder while the habitats are in flight, then replaces it with the list', async () => {
    const inFlight = deferredHabitats();
    mockGet.mockReturnValue(inFlight.promise);

    renderHabitats();

    // Never a blank screen while the request is open (NFR-2).
    expect(
      await screen.findByRole('status', { name: /loading/i }),
    ).toBeInTheDocument();
    // And never the empty or failure state pre-empting a request that has not answered.
    expect(screen.queryByText(NO_HABITATS)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    inFlight.resolve(createHabitatList());

    const [first] = createHabitats();
    expect(
      await screen.findByRole('row', {
        name: textPattern(fixtureText(first.Name, 'Name')),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: /loading/i }),
    ).not.toBeInTheDocument();
  });

  // AC-3
  it('presents a backend with no habitats as a normal result, distinct from a failure', async () => {
    mockGet.mockResolvedValue(createHabitatList([]));

    renderHabitats();

    expect(await screen.findByText(NO_HABITATS)).toBeInTheDocument();
    // The distinction is the requirement: an empty reference raises no alert and offers no
    // retry, because there is nothing to recover from.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: RETRY_ACTION }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: /loading/i }),
    ).not.toBeInTheDocument();
  });

  // AC-3
  it('offers a readable failure with a Retry action, and Retry loads the habitats', async () => {
    const user = userEvent.setup();
    mockGet
      .mockRejectedValueOnce(CONNECTION_REFUSED)
      .mockResolvedValueOnce(createHabitatList());

    renderHabitats();

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent(READABLE_FAILURE);
    // A failure is not an empty reference (the state above must not stand in for this one).
    expect(screen.queryByText(NO_HABITATS)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: RETRY_ACTION }));

    // The habitats appearing from the SECOND response is what proves Retry re-attempted the
    // load rather than just clearing the message.
    const [first] = createHabitats();
    expect(
      await screen.findByRole('row', {
        name: textPattern(fixtureText(first.Name, 'Name')),
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // AC-3
  it('treats a response that carries no habitat list as a failure, never as an empty reference', async () => {
    // The request completes, but not with a habitat list — this is what the route handler
    // answers with when the Linx read is refused. Rendering "no habitats" here would report
    // an outage as a zoo that has no habitats.
    mockGet.mockResolvedValue(NOT_A_HABITAT_LIST);

    renderHabitats();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: RETRY_ACTION }),
    ).toBeInTheDocument();
    expect(screen.queryByText(NO_HABITATS)).not.toBeInTheDocument();
  });

  // AC-4
  it('offers no add, edit or delete control anywhere on the populated screen', async () => {
    const habitats = createHabitats();
    mockGet.mockResolvedValue(createHabitatList(habitats));

    renderHabitats();

    await screen.findByRole('row', {
      name: textPattern(fixtureText(habitats[0].Name, 'Name')),
    });

    // The sweep covers enabled AND disabled controls: a greyed-out "Edit habitat" still
    // has a role and an accessible name, and still tells the user the capability exists
    // somewhere. It genuinely does not — only `GET /v1/habitats` is on the backend (BR7).
    expect(writeAffordances()).toEqual([]);
    // Nor a promise of it later, in place of a control.
    expect(screen.queryByText(COMING_SOON)).not.toBeInTheDocument();
    // Nor the shell of one: an Actions column with nothing to put in it, or a row menu
    // whose only purpose would be to hold habitat writes.
    expect(
      screen.queryByRole('columnheader', { name: /\bactions?\b/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menu', { hidden: true }),
    ).not.toBeInTheDocument();
  });

  // AC-4
  it('offers no way to add a habitat from the no-habitats state either', async () => {
    // The empty state is where an "Add the first habitat" call to action is most tempting
    // and most wrong: there is no endpoint behind it, so the screen has nothing to offer
    // beyond stating that the backend holds no habitats.
    mockGet.mockResolvedValue(createHabitatList([]));

    renderHabitats();

    await screen.findByText(NO_HABITATS);

    expect(writeAffordances()).toEqual([]);
    expect(screen.queryByText(COMING_SOON)).not.toBeInTheDocument();
  });
});
