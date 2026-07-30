/**
 * Story Metadata:
 * - Route: /animals/[id]/edit
 * - Target File: web/src/app/animals/[id]/edit/page.tsx
 * - Page Action: create_new
 *
 * Epic `zoo-animal-manager`, Story 7 — change an existing animal.
 *
 * Covers the three `vitest`-tagged criteria — AC-2 (the prefilled form applies exactly the
 * same required-field and Age rules as adding), AC-4 (cancelling leaves the animal unchanged
 * and returns the user where they came from) and AC-5 (the identifier, the joined habitat
 * *name* and the change-tracking values are never editable entries) — plus the substance of
 * AC-1, the prefill itself, which is precise and cheap at this layer. AC-1's click-through
 * from the detail view and AC-3 (the backend's own confirmation wording, and the detail view
 * and roster refreshing without a manual reload) are `playwright`-tagged and live in
 * `web/e2e/epic-zoo-animal-manager-story-7-edit-animal.spec.ts`.
 *
 * Duplicate-name (`"Warning"`) and technical-failure (`"Error"`) handling on this save path
 * is **story 8** and is deliberately absent here.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THE SHARED FORM CONTRACT — story 6 owns the component, story 7 reuses it
 * ─────────────────────────────────────────────────────────────────────────────────
 * Story 6 introduces `web/src/components/animals/AnimalForm.tsx`; this story renders it in
 * edit mode from a new route. So the queries below must match story 6's, and they do —
 * reconciled directly against
 * `web/src/__tests__/integration/epic-zoo-animal-manager-story-6-add-animal.test.tsx`. Where
 * this file pins a message pattern, it is a deliberate **superset** of story 6's, so any
 * wording that satisfies the add form satisfies the edit form too:
 *
 * 1. **Five entries, labelled exactly as the brief names them** — `Name`, `Species`, `Age`,
 *    `Habitat`, `Diet` — each a labelled form control, so every one is reachable by its
 *    accessible name (`/^name\b/i`, `/^species\b/i`, `/^age\b/i`, `/^habitat\b/i`,
 *    `/^diet\b/i`), exactly as story 6 queries them. Nothing else is an entry (AC-5).
 * 2. **Control shapes are the implementation's choice.** `field()` below resolves a
 *    `spinbutton` (`<input type="number">`), a `combobox` (native `<select>` or Shadcn's
 *    Radix-backed `select`) or a `textbox` under the same label, and `presentedValue()`
 *    reads whichever it found. Habitat is necessarily a picker (R18); the other four may be
 *    inputs or pickers without changing a single assertion here. Age is typed into, so it
 *    must be a text or number input, not a picker — story 6 says the same.
 * 3. **Submit and cancel wording is per-mode, taken from the caller** (story 6's contract
 *    point 2): add passes "Add animal", edit passes a name starting "Save" or "Update".
 *    Cancel is a `button` named "Cancel", **not** a `Link`: "where they came from" is history
 *    (edit is reachable from the detail view *and* the roster — brief workflow 10), so it
 *    calls `router.back()`, which a hard-coded `href` cannot express correctly from both.
 * 4. **A refused entry marks its own field and carries its own message** — the offending
 *    control gets `aria-invalid`, and the message is wired as that control's accessible
 *    *description* (`aria-describedby`). Identical to story 6's contract point 5, and what
 *    Shadcn's `form` primitives (`FormControl`/`FormMessage`) produce for free; an error
 *    message not programmatically associated with its control is an accessibility defect the
 *    epic's axe scan cannot see. Wording stays free-form — see `REQUIRED_MESSAGE` and
 *    `AGE_RULE_MESSAGE`, both supersets of story 6's equivalents.
 * 5. **`Age` is submitted as a number**, not the string the user typed (brief Data Model:
 *    `AnimalWrite.Age: number`) — `z.coerce.number().int().min(0)` gives this, and story 6
 *    pins the same for `HabitatId`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THE SEAM: `@/lib/api/client`, CALLED WITH THE APP'S OWN `/api/*` ENDPOINTS
 * ─────────────────────────────────────────────────────────────────────────────────
 * architecture.md Decision 1: screens are **client** components talking to the app's own
 * route handlers, which are the only thing that talks to Linx (they inject the server-only
 * `X-API-Key` and the `LastChangedUser` header). No component calls `fetch()` itself
 * (Critical Rule 2), so the one mocked module here is `@/lib/api/client` — the seam every
 * other story in this epic pins.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THESE TESTS PIN — implement `web/src/app/animals/[id]/edit/page.tsx` to it
 * ─────────────────────────────────────────────────────────────────────────────────
 * 1. **The default export takes no required props and reads the id from `useParams()`**, and
 *    stays renderable in jsdom — a **client** component, never an `async` server component
 *    (Decision 1). Same way in as story 4's detail view.
 * 2. **Two reads on mount: `get('/api/animals/{id}')` for the record and `get('/api/habitats')`
 *    for the picker's choices** (R18 — the choices are the habitats that exist, which is why
 *    this screen *does* fetch them, unlike story 3's roster filter). The single-animal read
 *    answers with a bare `AnimalRead` — NOT wrapped in `DefaultResponse`, NOT wrapped in the
 *    roster's `{ Animals: [...] }` envelope (BR8/R12); the habitats read answers
 *    `{ Habitats: [...] }` (R15).
 * 3. **The save is `put('/api/animals/{id}', body)` where `body` is exactly the five writable
 *    fields** — `{ Name, Species, Age, HabitatId, Diet }` (R17/R21). Nothing else: no `Id`
 *    (it is in the path), no `HabitatName` (backend-joined, R9/BR5), no `LastChangedDate`,
 *    and above all **no `LastChangedUser`** — that is a header injected by the server tier
 *    from one fixed deployment value (R5/BR3), never a client-supplied argument.
 * 4. **PUT replaces the whole record**, so unchanged fields are sent too — a "changed fields
 *    only" body would blank the rest. The save test changes two fields and asserts all five
 *    arrive.
 * 5. **A refused save writes nothing and navigates nowhere** — the user stays on their
 *    filled-in form.
 * 6. **Cancel writes nothing and calls `router.back()`.**
 *
 * These tests FAIL until story 7 is implemented (TDD red): the route does not exist yet.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import AnimalEditPage from '@/app/animals/[id]/edit/page';
import { ToastProvider } from '@/contexts/ToastContext';
import { del, get, post, put } from '@/lib/api/client';
// Project-wide entity factories — the single source of truth for these response bodies,
// shared with the Playwright layer. Response shapes are never written by hand here.
import { createAnimal } from '@/mocks/data/animal';
import { createHabitatList, createHabitats } from '@/mocks/data/habitat';
import { createWriteSuccess } from '@/mocks/data/write-result';
import type { AnimalRead } from '@/types/api-generated';

import type { Mock } from 'vitest';

/**
 * The route this page is mounted at, and the navigation spies Cancel is judged by. Hoisted
 * because `vi.mock` factories are evaluated before module-level `const`s are initialised.
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
 * `useParams()` is how this page learns which animal it is editing (contract point 1), and
 * jsdom has no router context — calling the real hook outside a router throws. `notFound` /
 * `redirect` are included because a factory mock replaces the whole module, so an export
 * missing here would break the import rather than the behaviour.
 */
vi.mock('next/navigation', () => ({
  useParams: () => routeParams,
  usePathname: () => `/animals/${routeParams.id}/edit`,
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

// Casts rather than `vi.mocked`: these are generic (`get<T>(...) => Promise<T>`), so a typed
// mock implementation cannot return a concrete body without fighting `T`.
const mockGet = get as unknown as Mock;
const mockPut = put as unknown as Mock;
const mockPost = post as unknown as Mock;
const mockDel = del as unknown as Mock;

/** Every write verb, so "nothing was written" cannot be satisfied by using another one. */
const writeMocks: Mock[] = [mockPut, mockPost, mockDel];

const UNEXPECTED_WRITE =
  'This action must not write to the backend: the animal has to be left exactly as it was.';

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

/**
 * Read habitat names from the shared factory rather than hard-coding them, so a change to the
 * canonical habitat set breaks loudly here instead of quietly hollowing out the picker
 * assertions.
 */
function habitatNamed(id: number): string {
  const habitat = createHabitats().find((candidate) => candidate.Id === id);
  return required(
    habitat?.Name,
    `a habitat with Id ${id} in web/src/mocks/data/habitat.ts`,
  );
}

const SAVANNAH_ID = 1;
const RAINFOREST_ID = 2;
const SAVANNAH = habitatNamed(SAVANNAH_ID);
const RAINFOREST = habitatNamed(RAINFOREST_ID);

/** The record under edit. `AGE` is deliberately not `ANIMAL_ID`, so the AC-5 value sweep for
 * the identifier cannot be satisfied (or defeated) by the Age entry. */
const NAME = 'Thabo';
const SPECIES = 'Southern White Rhinoceros';
const AGE = 11;
const DIET = 'Herbivore';
const TIMESTAMP = '2026-07-24 08:15:42';

/** What the user changes the animal to in the save test. */
const NEW_NAME = 'Thabo Junior';

/**
 * The one fixed deployment value every record carries in `LastChangedUser` — read from the
 * factory, because the whole point of the AC-5 sweep is that this value never reaches the
 * form or the request the client builds (R5/BR3/BR14).
 */
const SYSTEM_VALUE = required(
  createAnimal().LastChangedUser,
  'LastChangedUser (the fixed deployment value)',
);

/** The backend's own success wording for an update (R21/R23). */
const UPDATE_CONFIRMATION = 'Animal updated successfully';

const NAME_LABEL = /^name\b/i;
const SPECIES_LABEL = /^species\b/i;
const AGE_LABEL = /^age\b/i;
const HABITAT_LABEL = /^habitat\b/i;
const DIET_LABEL = /^diet\b/i;

const SAVE_ACTION = /^(save|update)\b/i;
const CANCEL_ACTION = /^cancel\b/i;

/**
 * Validation wording is the implementation's to choose; these patterns pin what the message
 * has to be *about*. Both are deliberate supersets of story 6's `A_MESSAGE_AGAINST_THE_FIELD`
 * and `WHOLE_NUMBER_RULE`, so a message that satisfies the add form satisfies the edit form
 * too — the whole point of AC-2 is that one shared component serves both.
 */
const REQUIRED_MESSAGE =
  /required|enter|choose|select|provide|must|cannot be|can't be|empty|missing/i;
const AGE_RULE_MESSAGE =
  /whole number|integer|decimal|fraction|negative|positive|0 or more|zero or more/i;

/**
 * Entries that must not exist (AC-5): the record's identifier, the backend-joined habitat
 * **name**, and the two change-tracking values. `Habitat` itself is a legitimate entry — the
 * animal's `HabitatId` is editable through the picker — and none of these patterns match it.
 */
const FORBIDDEN_ENTRY_LABELS: readonly RegExp[] = [
  /^id\b/i,
  /identifier/i,
  /habitat name/i,
  /last (changed|updated)/i,
  /(changed|updated|modified|edited) by/i,
  /^system\b/i,
];

type UserEventInstance = ReturnType<typeof userEvent.setup>;

/** Match a whole string, case-insensitively, whatever characters it contains. */
function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

/**
 * The animal being edited, overridable per test. `HabitatId: 1` lets the factory join the
 * canonical `HabitatName`, so the fixture cannot claim a pairing the backend's INNER JOIN
 * could not produce.
 */
function animalRecord(overrides: Partial<AnimalRead> = {}): AnimalRead {
  return createAnimal({
    Id: ANIMAL_ID,
    Name: NAME,
    Species: SPECIES,
    Age: AGE,
    HabitatId: SAVANNAH_ID,
    Diet: DIET,
    LastChangedDate: TIMESTAMP,
    ...overrides,
  });
}

/**
 * Serve the two reads this screen makes (contract point 2), and reject anything else so an
 * unexpected endpoint surfaces as a failure rather than `undefined`.
 */
function serveEditForm(animal: AnimalRead): void {
  mockGet.mockImplementation((endpoint: unknown) => {
    const path = String(endpoint);

    if (/habitat/i.test(path)) {
      return Promise.resolve(createHabitatList());
    }
    if (/animal/i.test(path)) {
      // A bare `AnimalRead`, exactly as `GET /v1/animals/{Id}` sends it (BR8) — unwrapped
      // by `DefaultResponse` and by the roster's `{ Animals: [...] }` envelope alike.
      return Promise.resolve(animal);
    }
    return Promise.reject(new Error(`Unexpected read of ${path}`));
  });
}

/**
 * The real `ToastProvider`, because `layout.tsx` mounts it around every page and `useToast()`
 * throws outside it — mocking it would only hide a genuine wiring mistake.
 */
function renderEditPage(animal: AnimalRead = animalRecord()) {
  serveEditForm(animal);

  return render(
    <ToastProvider>
      <AnimalEditPage />
    </ToastProvider>,
  );
}

/** Every endpoint the screen read from, in order. */
function readEndpoints(): string[] {
  return mockGet.mock.calls.map((call) => String(call[0]));
}

/**
 * Every write the screen issued, as `"<VERB> <endpoint>"`.
 *
 * Asserting this list is `[]` is an absence-of-side-effect assertion — "the animal was left
 * exactly as it was", which is literally AC-4's wording and the blocking half of AC-2 — not a
 * call-count proxy for behaviour. Rendering it as endpoints rather than a number also means a
 * failure names the request that should never have left.
 */
function writeRequests(): string[] {
  const asRequest = (verb: string) => (call: unknown[]) =>
    `${verb} ${String(call[0])}`;

  return [
    ...mockPut.mock.calls.map(asRequest('PUT')),
    ...mockPost.mock.calls.map(asRequest('POST')),
    ...mockDel.mock.calls.map(asRequest('DELETE')),
  ];
}

/**
 * The entry labelled `label`, whatever control the implementation chose for it (contract
 * point 2). `queryBy ?? getBy` rather than a `||` chain — `getBy*` throws on no match, so the
 * right-hand side of a `||` would never be reached.
 */
function field(label: RegExp): HTMLElement {
  return (
    screen.queryByRole('spinbutton', { name: label }) ??
    screen.queryByRole('combobox', { name: label }) ??
    screen.getByRole('textbox', { name: label })
  );
}

/** The value a control currently presents to the user, input or picker. */
function presentedValue(control: HTMLElement): string {
  if (control instanceof HTMLSelectElement) {
    return (control.selectedOptions.item(0)?.textContent ?? '').trim();
  }
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement
  ) {
    return control.value.trim();
  }
  // A Radix select trigger renders its selected value as its text content.
  return (control.textContent ?? '').trim();
}

/**
 * Every control on the form a user can enter a value into — the same sweep story 6 uses, so
 * "exactly five entries" means the same thing on both modes of the shared form.
 */
function entryControls(): HTMLElement[] {
  return [
    ...screen.queryAllByRole('textbox'),
    ...screen.queryAllByRole('searchbox'),
    ...screen.queryAllByRole('spinbutton'),
    ...screen.queryAllByRole('combobox'),
    ...screen.queryAllByRole('checkbox'),
    ...screen.queryAllByRole('radio'),
    ...screen.queryAllByRole('switch'),
  ];
}

/** Replace what a typed entry holds. An empty `value` just clears it. */
async function typeInto(
  user: UserEventInstance,
  label: RegExp,
  value: string,
): Promise<void> {
  const control = field(label);

  if (
    !(
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement
    )
  ) {
    throw new Error(
      `the entry matching ${String(label)} must be a text or number input the user can type into`,
    );
  }

  await user.clear(control);
  if (value.length > 0) {
    await user.type(control, value);
  }
}

/** Choose a habitat, driving either a native `<select>` or Shadcn's Radix-backed `select`. */
async function chooseHabitat(
  user: UserEventInstance,
  choice: RegExp,
): Promise<void> {
  const picker = field(HABITAT_LABEL);

  if (picker instanceof HTMLSelectElement) {
    await user.selectOptions(
      picker,
      within(picker).getByRole('option', { name: choice }),
    );
    return;
  }

  await user.click(picker);
  await user.click(await screen.findByRole('option', { name: choice }));
}

function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: SAVE_ACTION });
}

function cancelButton(): HTMLElement {
  return screen.getByRole('button', { name: CANCEL_ACTION });
}

/** Resolve once the record has arrived and the form is showing it. */
async function awaitPrefill(): Promise<void> {
  await waitFor(() => expect(presentedValue(field(NAME_LABEL))).toBe(NAME));
}

describe('Epic zoo-animal-manager, Story 7: edit an animal', () => {
  beforeAll(() => {
    // jsdom implements neither pointer capture, `Element.scrollIntoView`, nor
    // `ResizeObserver` — all three are used by Radix's Select (what Shadcn's `select`
    // primitive wraps, and what the habitat picker is most likely built from) the moment its
    // listbox opens. These are missing-browser-API shims, not stubs of anything under test:
    // a native `<select>` is unaffected, and the Radix control becomes operable instead of
    // throwing. Same shims as story 3's habitat filter.
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

    // Every write starts out refusing loudly, so a save that should have been blocked cannot
    // slip through as a silently resolved `undefined`. Tests that expect a write opt in with
    // `mockResolvedValueOnce`.
    for (const write of writeMocks) {
      write.mockReset();
      write.mockRejectedValue(new Error(UNEXPECTED_WRITE));
    }

    router.push.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    router.back.mockReset();
  });

  // AC-1 — the prefill itself. Playwright owns arriving here from the detail view.
  it('opens prefilled with the animal it was asked for, read through the app’s own route handler', async () => {
    renderEditPage();
    await awaitPrefill();

    expect(presentedValue(field(SPECIES_LABEL))).toBe(SPECIES);
    expect(presentedValue(field(AGE_LABEL))).toBe(String(AGE));
    expect(presentedValue(field(HABITAT_LABEL))).toBe(SAVANNAH);
    expect(presentedValue(field(DIET_LABEL))).toBe(DIET);

    // Architecture Decision 1: the record comes from the app's OWN route handler, by
    // relative path, with the id from the route. An absolute Linx URL here would mean the
    // shared API key reached the browser.
    const detailRead = readEndpoints().find((endpoint) =>
      new RegExp(`^/api/animals/${ANIMAL_ID}(\\?|$)`).test(endpoint),
    );
    expect(detailRead).toBeDefined();
  });

  // AC-1 — the request the save builds. The five writable fields and nothing else (R17/R21),
  // with `LastChangedUser` conspicuously absent: it is a server-injected header (R5/BR3), so
  // a client that supplies it has taken over a decision that is not the browser's to make.
  it('sends exactly the five writable fields to the animal’s own endpoint, and never LastChangedUser', async () => {
    const user = userEvent.setup();
    mockPut.mockResolvedValueOnce(
      createWriteSuccess({ Id: ANIMAL_ID, Messages: [UPDATE_CONFIRMATION] }),
    );

    renderEditPage();
    await awaitPrefill();

    await typeInto(user, NAME_LABEL, NEW_NAME);
    await chooseHabitat(user, exactly(RAINFOREST));
    await waitFor(() =>
      expect(presentedValue(field(HABITAT_LABEL))).toBe(RAINFOREST),
    );

    await user.click(saveButton());

    await waitFor(() =>
      expect(writeRequests()).toEqual([`PUT /api/animals/${ANIMAL_ID}`]),
    );

    const [, body, ...beyondTheBody] = mockPut.mock.calls[0] as unknown[];

    // Exactly five keys: `Species`, `Age` and `Diet` ride along untouched because PUT
    // replaces the whole record (contract point 4), while `Id`, `HabitatName` and both
    // change-tracking fields are absent. `Age` is a number, not the string typed in. And the
    // habitat travels as `HabitatId` (2), never as the name the picker displayed.
    expect(body).toEqual({
      Name: NEW_NAME,
      Species: SPECIES,
      Age: AGE,
      HabitatId: RAINFOREST_ID,
      Diet: DIET,
    });
    // Nor is the fixed deployment name smuggled in as a further argument to the client.
    expect(JSON.stringify(beyondTheBody)).not.toContain(SYSTEM_VALUE);
  });

  // AC-2 — edit inherits add's required-field rule through the shared component. The backend
  // validates nothing and inserts whatever it is sent (R19), so a save that got through here
  // would have stored a nameless animal.
  it('blocks the save when a required entry is cleared, messaging the offending field', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await awaitPrefill();

    await typeInto(user, NAME_LABEL, '');
    await user.click(saveButton());

    // Marked and messaged on the field itself, exactly as the add form does it — not a
    // form-level "please check your entries" that leaves the user hunting.
    await waitFor(() => expect(field(NAME_LABEL)).toBeInvalid());
    expect(field(NAME_LABEL)).toHaveAccessibleDescription(REQUIRED_MESSAGE);

    // Nothing was sent, and the user is still on their form with the rest of their entries
    // intact — not navigated away, not reset.
    expect(writeRequests()).toEqual([]);
    expect(router.push).not.toHaveBeenCalled();
    expect(presentedValue(field(SPECIES_LABEL))).toBe(SPECIES);
  });

  // AC-2 — the Age rule, in both directions the brief calls out: below zero, and not whole.
  // Each value gets its own render, so the second refusal cannot be a message left over from
  // the first.
  it('rejects a negative Age and a fractional Age, exactly as the add form does', async () => {
    const user = userEvent.setup();

    for (const invalidAge of ['-1', '2.5']) {
      const view = renderEditPage();
      await awaitPrefill();

      await typeInto(user, AGE_LABEL, invalidAge);
      // The entry really holds what was typed — so the refusal below is the app's rule, not
      // the control having quietly discarded the keystrokes.
      expect(presentedValue(field(AGE_LABEL))).toBe(invalidAge);

      await user.click(saveButton());

      await waitFor(() => expect(field(AGE_LABEL)).toBeInvalid());
      expect(field(AGE_LABEL)).toHaveAccessibleDescription(AGE_RULE_MESSAGE);
      // Still there to correct — the entry is not silently blanked behind the message.
      expect(presentedValue(field(AGE_LABEL))).toBe(invalidAge);
      expect(writeRequests()).toEqual([]);

      view.unmount();
    }
  });

  // AC-4 — cancelling an edit in progress. "Leaves the animal unchanged" is only true if
  // nothing at all was sent, so this asserts the absence of every write verb, not just PUT.
  it('writes nothing when the edit is cancelled, and returns the user where they came from', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await awaitPrefill();

    // A real edit in progress, across both a typed entry and the picker.
    await typeInto(user, NAME_LABEL, NEW_NAME);
    await chooseHabitat(user, exactly(RAINFOREST));
    await waitFor(() =>
      expect(presentedValue(field(HABITAT_LABEL))).toBe(RAINFOREST),
    );

    await user.click(cancelButton());

    expect(writeRequests()).toEqual([]);
    // Back to wherever the edit was opened from — the animal's page or the roster, both of
    // which the brief's workflow 10 allows — which is history, not a hard-coded destination.
    expect(router.back).toHaveBeenCalled();
  });

  // AC-5 — the writable surface is five entries wide. The distinction that matters: the
  // animal's `HabitatId` IS editable, through the picker; the joined habitat *name* is not
  // something a user types, and neither the identifier nor the change-tracking values are
  // entries at all.
  it('makes the habitat an editable choice while exposing no entry for the identifier, the habitat name, or the change-tracking values', async () => {
    const user = userEvent.setup();
    renderEditPage();
    await awaitPrefill();

    // Five entries and no sixth — the writable surface is exactly as wide in edit mode as
    // story 6 pins it for add, because it is the same component.
    expect(entryControls()).toHaveLength(5);

    // No entry is labelled for any of them.
    for (const forbidden of FORBIDDEN_ENTRY_LABELS) {
      expect(screen.queryAllByLabelText(forbidden)).toEqual([]);
    }
    // And no form control on the page — visible or hidden — is carrying their values, which
    // is what catches an "invisible" field that would still be submitted.
    for (const forbiddenValue of [String(ANIMAL_ID), SYSTEM_VALUE, TIMESTAMP]) {
      expect(screen.queryAllByDisplayValue(forbiddenValue)).toEqual([]);
    }

    // The habitat, by contrast, is changeable — moving this animal to another habitat is the
    // most consequential edit the form supports (an unmatched HabitatId makes an animal
    // permanently invisible, BR5), so the picker is exactly where that choice belongs.
    await chooseHabitat(user, exactly(RAINFOREST));
    await waitFor(() =>
      expect(presentedValue(field(HABITAT_LABEL))).toBe(RAINFOREST),
    );
  });
});
