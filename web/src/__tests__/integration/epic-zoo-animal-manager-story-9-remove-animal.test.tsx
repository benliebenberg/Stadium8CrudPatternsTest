/**
 * Story Metadata:
 * - Route: /animals/[id]
 * - Target File: web/src/app/animals/[id]/page.tsx
 * - Page Action: modify_existing
 *
 * Epic `zoo-animal-manager`, Story 9 — remove an animal, behind a confirmation.
 *
 * Covers the two `vitest`-tagged criteria — AC-2 (cancelling removes nothing and leaves the
 * user exactly where they were) and AC-5 (a refused removal shows a readable failure and the
 * animal is still there) — plus the substance of AC-1, that the confirmation names the
 * specific animal and states the removal cannot be undone, which is precise and cheap at this
 * layer. AC-1's click-through and AC-3 (the backend's own confirmation wording, and landing on
 * a refreshed roster without a manual reload) are `playwright`-tagged and live in
 * `web/e2e/epic-zoo-animal-manager-story-9-remove-animal.spec.ts`.
 *
 * **AC-4 is deliberately not automated here.** It is tagged `coverage: none` and verified by
 * eye at the manual-test gate: "a clearly destructive treatment that is never the brand's
 * primary-action colour" is a colour judgement, and colour/class assertions are forbidden by
 * `.claude/policies/testing-policy.md`. Nothing below inspects a class name, a CSS variable or
 * a computed style.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THIS STORY MODIFIES STORY 4's SCREEN — ITS CONTRACT IS UNCHANGED
 * ─────────────────────────────────────────────────────────────────────────────────
 * `web/src/app/animals/[id]/page.tsx` is story 4's detail view. Story 4's test file makes NO
 * claim about Edit/Remove controls — neither presence nor absence — precisely so stories 7 and
 * 9 can add them. The queries below therefore reuse story 4's markup contract verbatim and add
 * nothing that contradicts it:
 *   - the animal's name is the page heading;
 *   - every other recorded field is a `<dt>` label with its value in the immediately-following
 *     `<dd>` (`valueFor()` below is story 4's helper);
 *   - the `LastChangedUser` value sits under a label matching `/^system\b/i`;
 *   - a failed *load* is `role="alert"` plus a `/retry|try again/i` button, and an in-flight
 *     load is `role="status"`.
 * Story 4 owns all of those assertions; this file does not re-assert them.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THE SEAM, AND WHY THE DELETE RESOLVES RATHER THAN THROWS
 * ─────────────────────────────────────────────────────────────────────────────────
 * architecture.md Decision 1: this is a **client** component talking to the app's own
 * same-origin route handler, which is the only thing that talks to Linx (it injects the
 * server-only `X-API-Key` and the `LastChangedUser` header). No component calls `fetch()`
 * itself (Critical Rule 2), so the one mocked module here is `@/lib/api/client` — the seam
 * every story in this epic pins.
 *
 * architecture.md Decisions 2 and 3: the route handler answers every write with **HTTP 200**
 * and the `DefaultResponse` envelope verbatim, whatever status Linx used, because Linx returns
 * 500 for business rejections, technical failures *and* sometimes success. So on the browser
 * side the delete promise **resolves** and the caller branches on `MessageType`
 * (`Success` / `Warning` / `Error`, in the backend's own casing) — a refused removal is a
 * result, not an exception. The AC-5 fixture below therefore **resolves** with
 * `createWriteError()`; an implementation that only handles a rejected promise, or that reads
 * an HTTP status, fails it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THESE TESTS PIN — implement it into `web/src/app/animals/[id]/page.tsx`
 * ─────────────────────────────────────────────────────────────────────────────────
 * 1. **A Remove control on the animal's own page**, a `button` named `/^(remove|delete)\b/i`
 *    — a button, not a link: it performs a destructive write, it does not navigate.
 * 2. **Activating it opens an in-app modal confirmation** — `role="alertdialog"` (what Shadcn's
 *    `alert-dialog` produces; add it via the CLI, don't hand-roll one) or `role="dialog"`. A
 *    browser `window.confirm()` is not one of those, and jsdom does not implement it at all.
 * 3. **The confirmation names the animal being removed and states plainly that the removal
 *    cannot be undone** (R22). A generic "Are you sure?" fails: with four look-alike records on
 *    the roster, a confirmation that does not say *which* animal is about to go is exactly how
 *    the wrong one gets deleted — and the backend has no undo (BR12: its delete event is just
 *    `DeleteAnimal → Return`, with no error path and nothing to restore from).
 * 4. **The confirmation carries two controls, scoped inside the dialog**: a confirm named
 *    `/^(remove|delete|confirm|yes)\b/i` and a cancel named `/^(cancel|keep|go back)\b/i`.
 * 5. **Opening the confirmation writes nothing.** Only the confirm control may issue the
 *    delete.
 * 6. **Confirming issues exactly one write — `del('/api/animals/{id}')`** — the relative,
 *    same-origin endpoint with the id from the route, and **no request body**. Above all no
 *    `LastChangedUser`: that is a header the server tier injects from one fixed deployment
 *    value (R5/BR3/BR14), never a client-supplied argument.
 * 7. **On `MessageType: 'Error'`** the failure is announced through an element with
 *    `role="alert"` (the error-variant toast's own role, and the same role story 4 uses for a
 *    failed load), carrying **readable** wording. The raw database text in `Messages[0]` must
 *    not lead the message — but it must not be swallowed either (Critical Rule 3: never
 *    dismiss an API error).
 * 8. **A refused removal changes nothing the user can see**: the record stays on screen and
 *    nothing navigates or refreshes.
 * 9. **Cancel writes nothing at all — no verb — and navigates nowhere**, closing the
 *    confirmation and leaving the record exactly as it was.
 *
 * These tests FAIL until story 9 is implemented (TDD red): the Remove control does not exist.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import AnimalDetailPage from '@/app/animals/[id]/page';
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { del, get, post, put } from '@/lib/api/client';
// Project-wide entity factories — the single source of truth for these response bodies,
// shared with the Playwright layer. Response shapes are never hand-written here.
import { createAnimal } from '@/mocks/data/animal';
import { createWriteError } from '@/mocks/data/write-result';
import type { AnimalRead } from '@/types/api-generated';

import type { Mock } from 'vitest';

/**
 * The route this page is mounted at, and the navigation spies Cancel and a refused removal are
 * judged by. Hoisted because `vi.mock` factories are evaluated before module-level `const`s are
 * initialised.
 */
const routeParams = vi.hoisted(() => ({ id: '7' }));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

/**
 * `useParams()` is how this page learns which animal it is showing (story 4's contract point
 * 1), and jsdom has no router context — calling the real hook outside a router throws.
 * `notFound` / `redirect` are included because a factory mock replaces the whole module, so an
 * export missing here would break the import rather than the behaviour.
 */
vi.mock('next/navigation', () => ({
  useParams: () => routeParams,
  usePathname: () => `/animals/${routeParams.id}`,
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

// Casts rather than `vi.mocked`: these are generic (`del<T>(...) => Promise<T>`), so a typed
// mock implementation cannot return a concrete body without fighting `T`.
const mockGet = get as unknown as Mock;
const mockDel = del as unknown as Mock;
const mockPut = put as unknown as Mock;
const mockPost = post as unknown as Mock;

/** Every write verb, so "nothing was removed" cannot be satisfied by using another one. */
const writeMocks: Mock[] = [mockDel, mockPut, mockPost];

const UNEXPECTED_WRITE =
  'This action must not write to the backend: the animal has to be left exactly as it was.';

/** Every way this screen could take the user somewhere else, or re-fetch the roster. */
const NAVIGATION_METHODS = [
  'push',
  'replace',
  'back',
  'forward',
  'refresh',
] as const;

const ANIMAL_ID = Number(routeParams.id);

/**
 * Narrow a value the shared factory always populates. Every field on the generated API types
 * is optional (the spec declares no `required:` arrays), so an absent value means the factory
 * changed — not that the assertion should be skipped.
 */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`the shared animal factory no longer populates ${what}`);
  }
  return value;
}

/** The record on display. Same values story 4 and story 7 use, so the three read alike. */
const NAME = 'Thabo';
const SPECIES = 'Southern White Rhinoceros';
const AGE = 11;
const DIET = 'Herbivore';
const TIMESTAMP = '2026-07-24 08:15:42';

/**
 * Read from the factory rather than hard-coded, so a change to the canonical habitat set or to
 * the fixed deployment name breaks loudly here instead of quietly hollowing out the
 * "nothing was smuggled into the request" sweep.
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
 * The raw backend detail on a refused delete — the kind of text `DefaultResponse.Messages[0]`
 * carries when `MessageType` is `Error`. Served through the shared `createWriteError()` factory
 * so the envelope stays the one both test layers use; only the sentence is made
 * delete-flavoured, since the factory's default describes an INSERT.
 */
const RAW_BACKEND_DETAIL =
  'The DELETE statement conflicted with the REFERENCE constraint "FK_Feeding_Animal".';

/** Story 4's labels, reused unchanged — this story adds no fields and renames none. */
const SPECIES_LABEL = /^species\b/i;
const HABITAT_LABEL = /^habitat\b/i;
const DIET_LABEL = /^diet\b/i;
const SYSTEM_LABEL = /^system\b/i;

const REMOVE_ACTION = /^(remove|delete)\b/i;
const CONFIRM_ACTION = /^(remove|delete|confirm|yes)\b/i;
const CANCEL_ACTION = /^(cancel|keep|go back)\b/i;

/**
 * Wording that tells the user something went wrong in language they can act on. The exact
 * sentence is the implementation's to choose; what it has to be *about* is pinned.
 */
const READABLE_FAILURE =
  /could not|couldn't|couldn’t|unable|failed|problem|went wrong|try again/i;

/**
 * The removal being irreversible has to be *stated*, not implied. A bare "Are you sure?"
 * matches none of these — which is the point: the backend has no undo and no error path on
 * delete (BR12), so the confirmation is the only safeguard that exists.
 */
const IRREVERSIBLE =
  /cannot be undone|can't be undone|can’t be undone|cannot be reversed|cannot be recovered|permanent|permanently|irreversible/i;

type UserEventInstance = ReturnType<typeof userEvent.setup>;

/**
 * The record every test loads. `HabitatId: 1` lets the factory join the canonical
 * `HabitatName`, so the fixture cannot claim a pairing the backend's INNER JOIN could not
 * produce.
 */
function animalRecord(overrides: Partial<AnimalRead> = {}): AnimalRead {
  return createAnimal({
    Id: ANIMAL_ID,
    Name: NAME,
    Species: SPECIES,
    Age: AGE,
    HabitatId: 1,
    Diet: DIET,
    LastChangedDate: TIMESTAMP,
    ...overrides,
  });
}

/**
 * The real `ToastProvider` **and** `ToastContainer`, exactly as `layout.tsx` composes them:
 * the provider alone holds state and renders nothing, so a confirmation or failure raised
 * through `useToast()` (NFR-5) would be invisible without the container. Both are the real
 * implementations — mocking either would only hide a genuine wiring mistake.
 */
function renderDetail(animal: AnimalRead = animalRecord()) {
  // A bare `AnimalRead`, exactly as `GET /v1/animals/{Id}` sends it (BR8): unwrapped by
  // `DefaultResponse` and by the roster's `{ Animals: [...] }` envelope alike.
  mockGet.mockResolvedValue(animal);

  return render(
    <ToastProvider>
      <AnimalDetailPage />
      <ToastContainer />
    </ToastProvider>,
  );
}

/**
 * Every write the screen issued, as `"<VERB> <endpoint>"`.
 *
 * Asserting this list is `[]` is an absence-of-side-effect assertion — "cancelling removes
 * nothing", which is literally AC-2's wording — not a call-count proxy for behaviour.
 * Rendering it as endpoints rather than a number also means a failure names the request that
 * should never have left.
 */
function writeRequests(): string[] {
  const asRequest = (verb: string) => (call: unknown[]) =>
    `${verb} ${String(call[0])}`;

  return [
    ...mockDel.mock.calls.map(asRequest('DELETE')),
    ...mockPut.mock.calls.map(asRequest('PUT')),
    ...mockPost.mock.calls.map(asRequest('POST')),
  ];
}

/**
 * Every navigation the screen performed, named. `[]` is how "leaves the user exactly where
 * they were" is expressed: a `router.push('/animals')` or a `router.refresh()` on the cancel
 * path would both move the user, and each is named in the failure message.
 */
function navigations(): string[] {
  return NAVIGATION_METHODS.flatMap((method) =>
    router[method].mock.calls.map(
      (call: unknown[]) =>
        `${method}(${call.map((argument) => String(argument)).join(', ')})`,
    ),
  );
}

/**
 * The value presented under a field's label — story 4's contract: the label element's text
 * matches `label`, and its value sits in the immediately-following element. Scoped to the
 * page's own container, so an open confirmation dialog (rendered into a portal on
 * `document.body`) cannot answer for the record behind it.
 */
function valueFor(scope: HTMLElement, label: RegExp): string {
  const term = within(scope).getByText(label);
  const value = term.nextElementSibling;

  if (!value) {
    throw new Error(
      `no value element follows the "${term.textContent ?? ''}" label — each recorded field must be a label with its value in the next element (a <dt>/<dd> pair)`,
    );
  }

  return (value.textContent ?? '').trim();
}

/** Text, whitespace-normalised, as a reader would take it in. */
function readableText(element: HTMLElement): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The open confirmation, or `null` when none is open. */
function openConfirmation(): HTMLElement | null {
  return screen.queryByRole('alertdialog') ?? screen.queryByRole('dialog');
}

/**
 * Everything currently announced assertively, whether that is an inline alert on the page or
 * the error-variant toast (which renders `role="alert"`).
 *
 * `hidden: true` on purpose: Radix marks the rest of the document `aria-hidden` while a modal
 * confirmation is open, so filtering by the accessibility tree would make this assertion
 * depend on whether the dialog closes before the failure is raised — an ordering this story
 * does not pin. That the message is *visible* in a real browser is covered by the story's
 * Playwright spec and the epic's axe scan.
 */
function announcedFailures(): string {
  return screen
    .queryAllByRole('alert', { hidden: true })
    .map((alert) => readableText(alert))
    .join(' ');
}

/** Resolve once the record has replaced story 4's loading placeholder. */
async function awaitRecord(): Promise<HTMLElement> {
  return screen.findByRole('heading', {
    name: new RegExp(`\\b${NAME}\\b`, 'i'),
  });
}

/**
 * Activate Remove and hand back the confirmation it opened. Nothing may be deleted before the
 * user has answered it (contract point 5), which the caller asserts.
 */
async function activateRemove(user: UserEventInstance): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: REMOVE_ACTION }));

  return waitFor(() => {
    const confirmation = openConfirmation();

    if (!confirmation) {
      throw new Error(
        'activating Remove must open an in-app confirmation (role="alertdialog", as Shadcn’s alert-dialog renders, or role="dialog") — a browser window.confirm() is not one, and deleting straight away is not either',
      );
    }

    return confirmation;
  });
}

describe('Epic zoo-animal-manager, Story 9: remove an animal with confirmation', () => {
  beforeAll(() => {
    // jsdom implements neither pointer capture, `Element.scrollIntoView` nor
    // `ResizeObserver`, all of which Radix's overlay primitives reach for the moment a modal
    // opens. These are missing-browser-API shims, not stubs of anything under test — the same
    // ones stories 3, 6 and 7 install for the Radix-backed habitat picker.
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

    // Every write starts out refusing loudly, so a removal that should never have been sent
    // cannot slip through as a silently resolved `undefined`. The one test that expects a
    // delete opts in with `mockResolvedValueOnce`.
    for (const write of writeMocks) {
      write.mockReset();
      write.mockRejectedValue(new Error(UNEXPECTED_WRITE));
    }

    for (const method of NAVIGATION_METHODS) {
      router[method].mockReset();
    }
    router.prefetch.mockReset();
  });

  // AC-1 (substance; the full click-through and the roster landing are playwright-tagged).
  // The confirmation is the only safeguard on this path: the backend deletes without
  // complaint, keeps no history, and reports deleting an already-removed animal as success
  // (BR12). So "which animal" and "this cannot be undone" both have to be on screen before
  // the user commits.
  it('opens a confirmation naming the animal and stating the removal cannot be undone, before anything is deleted', async () => {
    const user = userEvent.setup();
    renderDetail();
    await awaitRecord();

    const confirmation = await activateRemove(user);
    const prompt = readableText(confirmation);

    // The specific animal, by name. A generic "Are you sure?" is exactly how the wrong one of
    // four look-alike records gets removed.
    expect(prompt).toMatch(new RegExp(`\\b${NAME}\\b`));
    // And the consequence, stated — not implied by the button colour (AC-4's treatment is a
    // manual check; wording is what a screen-reader user gets).
    expect(prompt).toMatch(IRREVERSIBLE);

    // Both answers are available inside the confirmation, so the user is never cornered into
    // confirming to get rid of it.
    expect(
      within(confirmation).getByRole('button', { name: CONFIRM_ACTION }),
    ).toBeInTheDocument();
    expect(
      within(confirmation).getByRole('button', { name: CANCEL_ACTION }),
    ).toBeInTheDocument();

    // Nothing has been removed merely by asking. A confirmation shown *after* the delete has
    // already gone out would be theatre.
    expect(writeRequests()).toEqual([]);
    expect(navigations()).toEqual([]);
  });

  // AC-2 — the single most important test in this story. A confirmation whose Cancel path
  // still deletes is catastrophic and unrecoverable: BR12 says the backend has no undo and
  // keeps no history, so the record would simply be gone.
  it('deletes nothing and navigates nowhere when the confirmation is cancelled, leaving the record on screen', async () => {
    const user = userEvent.setup();
    const view = renderDetail();
    await awaitRecord();

    const confirmation = await activateRemove(user);
    await user.click(
      within(confirmation).getByRole('button', { name: CANCEL_ACTION }),
    );

    // The confirmation is dismissed …
    await waitFor(() => expect(openConfirmation()).toBeNull());

    // … no request of ANY verb was issued — not a DELETE, and not a PUT dressed up as one …
    expect(writeRequests()).toEqual([]);
    // … the user was not moved, and the roster was not re-read behind their back …
    expect(navigations()).toEqual([]);

    // … and the animal is still there, whole: the record they were reading, unchanged, with
    // its Remove control still available for a deliberate second attempt.
    await awaitRecord();
    expect(valueFor(view.container, SPECIES_LABEL)).toBe(SPECIES);
    expect(valueFor(view.container, HABITAT_LABEL)).toBe(HABITAT);
    expect(valueFor(view.container, DIET_LABEL)).toBe(DIET);
    expect(
      screen.getByRole('button', { name: REMOVE_ACTION }),
    ).toBeInTheDocument();
  });

  // AC-5 — the removal is refused. Note the fixture RESOLVES at HTTP 200 with
  // `MessageType: 'Error'` (architecture.md Decision 3): a refused write is a result, not an
  // exception, so an implementation that only catches a rejected promise — or that branches on
  // an HTTP status — never notices this at all and would leave the user believing the animal
  // was removed.
  it('shows a readable failure and keeps the animal when the removal is refused', async () => {
    const user = userEvent.setup();
    mockDel.mockResolvedValueOnce(
      createWriteError({ Id: ANIMAL_ID, Messages: [RAW_BACKEND_DETAIL] }),
    );

    const view = renderDetail();
    await awaitRecord();

    const confirmation = await activateRemove(user);
    await user.click(
      within(confirmation).getByRole('button', { name: CONFIRM_ACTION }),
    );

    // The removal went to the animal's own endpoint, by relative same-origin path with the id
    // from the route (Decision 1 — an absolute Linx URL here would mean the shared API key
    // reached the browser), and nothing else was written.
    await waitFor(() =>
      expect(writeRequests()).toEqual([`DELETE /api/animals/${ANIMAL_ID}`]),
    );

    const [, ...beyondTheEndpoint] = mockDel.mock.calls[0] as unknown[];

    // A DELETE carries no body, and above all no `LastChangedUser`: that header is injected by
    // the server tier from one fixed deployment value (R5/BR3), so a client that supplies it
    // has taken over a decision that is not the browser's to make.
    expect(JSON.stringify(beyondTheEndpoint)).not.toContain(SYSTEM_VALUE);

    // The failure is announced, in words the user can act on (NFR-5).
    await waitFor(() => expect(announcedFailures()).toMatch(READABLE_FAILURE));

    const announced = announcedFailures();
    // The raw database text is not what leads the message — "The DELETE statement conflicted
    // with the REFERENCE constraint …" tells a zoo keeper nothing …
    expect(announced).not.toMatch(/^(the\s+)?delete statement conflicted/i);
    // … and it is not silently swallowed either: something failed, and the user is told
    // (Critical Rule 3 — never dismiss an API error).
    expect(announced).not.toBe('');

    // The animal is still listed: the record is intact on screen, including the change-tracking
    // values, and the user has not been shipped off to a roster that no longer shows it.
    expect(valueFor(view.container, SPECIES_LABEL)).toBe(SPECIES);
    expect(valueFor(view.container, HABITAT_LABEL)).toBe(HABITAT);
    expect(valueFor(view.container, SYSTEM_LABEL)).toBe(SYSTEM_VALUE);
    expect(readableText(view.container)).toMatch(new RegExp(`\\b${NAME}\\b`));
    expect(navigations()).toEqual([]);
  });
});
