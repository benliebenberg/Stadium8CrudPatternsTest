/**
 * Story Metadata:
 * - Route: /animals/new
 * - Target File: web/src/app/animals/new/page.tsx
 * - Page Action: create_new
 *
 * Epic `zoo-animal-manager`, Story 6 — add an animal.
 *
 * Covers the three `vitest`-tagged criteria: AC-2 (habitat chosen from the existing
 * habitats, mandatory, with no habitat-creation shortcut), AC-3 (invalid entries block
 * the save and are reported against the offending field) and AC-5 (a refused save keeps
 * everything the user typed, on the same screen). It also pins the substance of AC-1 —
 * that the form is exactly the five writable entries and nothing else — because that is
 * cheap and precise at this layer; AC-1's click-through from the roster and AC-4
 * (the backend's own confirmation + the roster refresh) are `playwright`-tagged and live
 * in `web/e2e/epic-zoo-animal-manager-story-6-add-animal.spec.ts`.
 *
 * NOT here, deliberately:
 * - **Story 8's job:** how a duplicate name (`MessageType: 'Warning'`) and a technical
 *   failure (`MessageType: 'Error'`) are *presented* — the wording, which field carries
 *   the duplicate message, and what a raw SQL string is allowed to look like. AC-5 below
 *   asserts only that a refusal preserves the user's input and keeps them on the form; it
 *   makes no claim about the message, so story 8 can own that without contradiction.
 * - **Story 7's job:** the edit route, its prefill from `GET /animals/{Id}`, and `PUT`.
 *   The shared `AnimalForm` this story creates is where story 7 inherits validation for
 *   free — which is why the contract below is written as a *form* contract, not a
 *   page-only one.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THE SEAM: `@/lib/api/client`, CALLED WITH THE APP'S OWN `/api/*` ENDPOINTS
 * ─────────────────────────────────────────────────────────────────────────────────
 * architecture.md Decision 1: screens are **client** components talking to the app's OWN
 * route handlers — same-origin `/api/habitats` and `/api/animals` — which are the only
 * things that reach Linx (they inject the server-only `X-API-Key` and, on writes, the
 * `LastChangedUser` header). No component calls `fetch()` itself (Critical Rule 2), so the
 * one mocked module here is `@/lib/api/client`, the same seam stories 2–5 pin — here with
 * `post` as well as `get`.
 *
 * The `get` mock below serves habitats and **rejects every other endpoint**: this form has
 * no reason to load the roster, and a stray absolute Linx URL would mean the shared API
 * key reached the browser (the `buildUrl()` trap in architecture.md).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THESE TESTS PIN — implement `web/src/app/animals/new/page.tsx` +
 * `web/src/components/animals/AnimalForm.tsx` to it
 * ─────────────────────────────────────────────────────────────────────────────────
 * 1. **The default export renders synchronously and takes no required props** — a client
 *    component, never an `async` server component (Decision 1: a server-side read is
 *    invisible to both this seam and Playwright's `page.route()`).
 *
 * 2. **A heading names the task** — a heading whose accessible name matches
 *    /add animal/i — and **the submit control is a button named exactly "Add animal"**.
 *    Both are per-mode wording the shared form takes from its caller, so story 7 can pass
 *    "Save changes" without touching anything here.
 *
 * 3. **Exactly five entries, each with these accessible names** (a trailing required
 *    marker such as `*` is fine; a differently-worded label is not):
 *      - `Name`, `Species`, `Age`, `Diet` — labelled entries the user types into. Either
 *        `type="text"` or `type="number"` works for Age (both resolve by label and both
 *        accept `-1` / `2.5` keystrokes, which the app must be able to *reject with its
 *        own message* rather than silently swallow).
 *      - `Habitat` — a `combobox` (a native `<select>` or Shadcn's Radix-backed `select`;
 *        the helpers below drive either).
 *    **And nothing else:** no `Id`, no `HabitatName`, no `LastChangedUser`, no
 *    `LastChangedDate` — as a field, as displayed text, or in the request body.
 *    `LastChangedUser` is injected server-side as an HTTP header (story 1, R5/BR3); the
 *    user never supplies or sees it.
 *
 * 4. **Habitat choices come from `get('/api/habitats')`** — envelope
 *    `{ Habitats: HabitatRead[] }` — and nothing is chosen initially. Do NOT default to
 *    the first habitat: a habitat is mandatory precisely because the backend INNER JOINs
 *    Habitat on read, so an animal saved against the wrong or missing habitat is created
 *    and then **permanently invisible in every list** (R18/BR5). Silently choosing one for
 *    the user hides that decision.
 *
 * 5. **A rejected entry marks its own field**: the offending control gets
 *    `aria-invalid` and its message is wired as that control's accessible description
 *    (`aria-describedby`). Shadcn's `form` primitive (`FormControl` + `FormMessage`,
 *    react-hook-form + Zod) produces exactly this — that is why the story's notes assign
 *    it. Validation runs **before** anything is sent: a blocked save issues no request at
 *    all. Age's rule is a whole number of zero or more, so **0 is valid** (a truthiness
 *    check on Age is the classic bug here and fails below).
 *
 * 6. **The Zod schema lives alongside the existing helpers** in
 *    `web/src/lib/validation/schemas.ts` and is validated through `validateRequest` /
 *    react-hook-form's Zod resolver — do not add a second, parallel validation utility
 *    (architecture.md § Reusable code).
 *
 * 7. **Submit calls `post('/api/animals', body)`** with exactly the five writable fields
 *    and correct types — `Age` and `HabitatId` are **numbers**, not the strings the DOM
 *    hands you. The endpoint is the relative, same-origin one.
 *
 * 8. **The route handler answers a write with the `DefaultResponse` envelope
 *    (`{ Id, MessageType, Messages }`) on HTTP 200, whatever Linx replied with**, so the
 *    browser-side promise **resolves** and the caller branches on `MessageType` —
 *    `Success` / `Warning` / `Error`, in the backend's own casing — never on HTTP status
 *    (architecture.md Decision 2; Linx sends 500 for business rejections *and* technical
 *    faults, and can send `Success` on a 500). Every fixture below resolves; none rejects.
 *
 * 9. **A save in flight is visibly busy, and a refused save is retryable**: the submit
 *    control is disabled while the write is open (NFR-2 — a write must never look like
 *    nothing happened) and enabled again once a refusal comes back.
 *
 * 10. **A refusal keeps the user where they are, with what they typed.** No
 *     `router.push`/`router.replace`, no swapping the form out for a full-page error. Only
 *     a `Success` outcome navigates.
 *
 * 11. **No habitat-creation affordance anywhere on this form** — no "Add habitat" button,
 *     link, menu item or picker option, no "new habitat" entry, no "coming soon". Only
 *     `GET /v1/habitats` exists (R16/BR7): this is a backend capability limit, not a
 *     permission rule.
 *
 * These tests FAIL until story 6 is implemented (TDD red): the route does not exist yet.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import AddAnimalPage from '@/app/animals/new/page';
import { ToastProvider } from '@/contexts/ToastContext';
import { get, post } from '@/lib/api/client';
// Project-wide entity factories — the single source of truth for these bodies, shared
// with the Playwright layer. Response shapes are never hand-written here.
import { createAnimal } from '@/mocks/data/animal';
import { createHabitatList, createHabitats } from '@/mocks/data/habitat';
import {
  createWriteError,
  createWriteSuccess,
} from '@/mocks/data/write-result';
import type { DefaultResponse } from '@/types/api';
import type { AnimalRead, AnimalWrite } from '@/types/api-generated';

import type { Mock } from 'vitest';

/**
 * The App Router hooks. A successful create navigates (R23 — the user must not be dumped
 * back on an unchanged-looking list), and jsdom has no router context to read. The router
 * object is stable across renders so AC-5 can assert that a *refused* save navigated
 * nowhere.
 */
const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/animals/new',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/client', () => ({ get: vi.fn(), post: vi.fn() }));

// Cast rather than `vi.mocked`: both are generic (`get<T>/post<T> => Promise<T>`), so a
// typed mock implementation cannot return a concrete body without fighting `T`.
const mockGet = get as unknown as Mock;
const mockPost = post as unknown as Mock;

/**
 * Narrow a fixture field. Every field on the generated API types is optional (the spec
 * declares no `required:` arrays), but the shared factories always populate these — so an
 * absent value means the factory changed, not that the assertion should be skipped.
 */
function fixtureText(value: string | undefined, field: string): string {
  if (value === undefined) {
    throw new Error(`the shared factory no longer populates ${field}`);
  }
  return value;
}

/** The habitats the picker must offer, from the one shared source. */
const HABITAT_NAMES = createHabitats().map((habitat) =>
  fixtureText(habitat.Name, 'Habitat.Name'),
);

/**
 * The animal typed into the form below. Built from the shared factory so the values can
 * never drift from the entity the rest of the suite uses. `HabitatId: 2` is deliberately
 * NOT the first habitat — a form that quietly defaults the picker to habitat 1 cannot
 * produce this body.
 */
const NEW_ANIMAL = createAnimal({
  Name: 'Tandi',
  Species: 'Black Rhinoceros',
  Age: 5,
  HabitatId: 2,
  Diet: 'Herbivore',
});

/**
 * The writable surface: exactly five fields (R17). Derived from the animal above, so the
 * expected request body cannot fall out of step with what the test types in.
 */
function writableFieldsOf(animal: AnimalRead): AnimalWrite {
  return {
    Name: animal.Name,
    Species: animal.Species,
    Age: animal.Age,
    HabitatId: animal.HabitatId,
    Diet: animal.Diet,
  };
}

const EXPECTED_BODY = writableFieldsOf(NEW_ANIMAL);
const WRITABLE_FIELD_NAMES = ['Age', 'Diet', 'HabitatId', 'Name', 'Species'];

const NAME_ENTRY = fixtureText(NEW_ANIMAL.Name, 'Name');
const SPECIES_ENTRY = fixtureText(NEW_ANIMAL.Species, 'Species');
const DIET_ENTRY = fixtureText(NEW_ANIMAL.Diet, 'Diet');
const AGE_ENTRY = String(NEW_ANIMAL.Age);

/** The habitat chosen in the tests below — 'Rainforest', the name joined onto HabitatId 2. */
const CHOSEN_HABITAT_NAME = fixtureText(
  NEW_ANIMAL.HabitatName,
  'HabitatName (does HabitatId 2 still exist in the habitat factory?)',
);
const CHOSEN_HABITAT = new RegExp(`^${CHOSEN_HABITAT_NAME}$`, 'i');

/**
 * The fixed deployment value the backend stamps onto every record. It must appear nowhere
 * on this form: it is a server-injected header, not something the user supplies or reads
 * here (R5/BR3/BR14). Read from the shared factory so it cannot drift.
 */
const FIXED_CHANGE_NAME = fixtureText(
  createHabitats()[0].LastChangedUser,
  'Habitat.LastChangedUser',
);

/** Labels this form must not have: identifiers and change-tracking, per R17. */
const FORBIDDEN_ENTRY_LABEL =
  /\b(id|identifier|habitat name|last changed|changed by|changed on|last updated|updated by)\b/i;

/** A control or option that would imply a habitat can be created from here. */
const CREATE_VERB = /\b(add|new|create)\b/i;

/** A promise of habitat editing later, in place of a control. */
const COMING_SOON =
  /coming soon|not yet available|under construction|in progress/i;

/** The picker's "nothing chosen yet" entry, which is not a habitat. */
const PICKER_PLACEHOLDER = /^(select|choose|pick)\b/i;

/** Wording that would report a blocked entry to the user. */
const A_MESSAGE_AGAINST_THE_FIELD =
  /required|enter|choose|select|provide|must|cannot be|can't be/i;

/** Age's rule (R19): a whole number of zero or more. */
const WHOLE_NUMBER_RULE =
  /whole number|integer|0 or more|zero or more|not.*decimal|negative/i;

const HABITATS_ONLY =
  'This form reads habitats only: it has no reason to load the roster, and an absolute Linx URL here would mean the shared API key reached the browser.';

/** A write still in flight, which the test completes when it chooses to. */
function deferredWrite(): {
  promise: Promise<DefaultResponse>;
  resolve: (result: DefaultResponse) => void;
} {
  let resolve!: (result: DefaultResponse) => void;
  const promise = new Promise<DefaultResponse>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Every endpoint the screen read from, in order. */
function requestedEndpoints(): string[] {
  return mockGet.mock.calls.map((call) => String(call[0]));
}

interface AttemptedWrite {
  endpoint: string;
  body: Record<string, unknown>;
}

/** Every write the screen sent, in order — empty when validation blocked the save. */
function attemptedWrites(): AttemptedWrite[] {
  return mockPost.mock.calls.map((call) => ({
    endpoint: String(call[0]),
    body: (call[1] ?? {}) as Record<string, unknown>,
  }));
}

/**
 * The single write the form sent. Throws descriptively while none has been sent, so a
 * `waitFor` around it reads as "wait until the form submits" and an assertion on its body
 * can never pass vacuously.
 */
function attemptedWrite(): AttemptedWrite {
  const [first] = attemptedWrites();
  if (!first) {
    throw new Error('the form has not sent a write yet');
  }
  return first;
}

/**
 * The real `ToastProvider`, because `layout.tsx` mounts it around every page, the
 * confirmation for a successful create is raised through `useToast()` (NFR-5), and
 * `useToast()` throws outside it — mocking it would only hide a genuine wiring mistake.
 */
function renderAddAnimal() {
  return render(
    <ToastProvider>
      <AddAnimalPage />
    </ToastProvider>,
  );
}

const nameField = () => screen.getByLabelText(/^name\b/i);
const speciesField = () => screen.getByLabelText(/^species\b/i);
const ageField = () => screen.getByLabelText(/^age\b/i);
const dietField = () => screen.getByLabelText(/^diet\b/i);
const habitatPicker = () => screen.getByRole('combobox', { name: /habitat/i });
const submitControl = () =>
  screen.getByRole('button', { name: /^add animal$/i });

/** Every control on the form a user can enter a value into. */
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

/**
 * Every control that reads as "create a habitat from here", by name. `hidden: true` widens
 * the sweep to controls hidden from assistive tech but still visible to a sighted user.
 * Scoped to names that mention a habitat AND a create verb, so the form's own "Add animal"
 * submit is not swept up.
 */
function habitatCreationAffordances(): string[] {
  return [
    ...screen.queryAllByRole('button', { hidden: true }),
    ...screen.queryAllByRole('link', { hidden: true }),
    ...screen.queryAllByRole('menuitem', { hidden: true }),
    ...screen.queryAllByRole('option', { hidden: true }),
  ]
    .map((control) =>
      (control.getAttribute('aria-label') ?? control.textContent ?? '').trim(),
    )
    .filter((name) => /habitat/i.test(name) && CREATE_VERB.test(name));
}

type UserEventInstance = ReturnType<typeof userEvent.setup>;

/** The form is ready once its habitat choices have arrived. */
async function habitatPickerReady(): Promise<HTMLElement> {
  return screen.findByRole('combobox', { name: /habitat/i });
}

/** The habitat labels the picker offers, in the order it offers them. */
async function habitatChoices(user: UserEventInstance): Promise<string[]> {
  const picker = habitatPicker();

  if (picker instanceof HTMLSelectElement) {
    return within(picker)
      .getAllByRole('option')
      .map((option) => (option.textContent ?? '').trim());
  }

  await user.click(picker);
  const options = await screen.findAllByRole('option');
  return options.map((option) => (option.textContent ?? '').trim());
}

async function chooseHabitat(
  user: UserEventInstance,
  choice: RegExp,
): Promise<void> {
  const picker = habitatPicker();

  if (picker instanceof HTMLSelectElement) {
    await user.selectOptions(
      picker,
      await within(picker).findByRole('option', { name: choice }),
    );
    return;
  }

  await user.click(picker);
  await user.click(await screen.findByRole('option', { name: choice }));
}

/** The habitat the picker currently shows as chosen — '' when nothing is. */
function chosenHabitatLabel(): string {
  const picker = habitatPicker();

  if (picker instanceof HTMLSelectElement) {
    return (picker.selectedOptions[0]?.textContent ?? '').trim();
  }

  return (picker.textContent ?? '').trim();
}

/** Type into the four text entries. `age` is overridable so AC-3 can supply a bad one. */
async function fillTextEntries(
  user: UserEventInstance,
  age: string = AGE_ENTRY,
): Promise<void> {
  await user.type(nameField(), NAME_ENTRY);
  await user.type(speciesField(), SPECIES_ENTRY);
  await user.type(ageField(), age);
  await user.type(dietField(), DIET_ENTRY);
}

describe('Epic zoo-animal-manager, Story 6: add an animal', () => {
  beforeAll(() => {
    // jsdom implements neither pointer capture, `Element.scrollIntoView`, nor
    // `ResizeObserver` — all three are used by Radix's Select (what Shadcn's `select`
    // primitive wraps) the moment its listbox opens. These are missing-browser-API shims,
    // not stubs of anything under test: a native `<select>` is unaffected, and the Radix
    // control becomes operable instead of throwing. Same shims as story 3's filter.
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
    mockPost.mockReset();
    routerMock.push.mockClear();
    routerMock.replace.mockClear();
    routerMock.refresh.mockClear();

    // Habitats are the only read this form makes. Anything else rejects, so a stray
    // roster load or an absolute Linx URL breaks the screen instead of passing silently.
    mockGet.mockImplementation((endpoint: unknown) =>
      /habitat/i.test(String(endpoint))
        ? Promise.resolve(createHabitatList())
        : Promise.reject(new Error(`${HABITATS_ONLY} Requested: ${endpoint}`)),
    );
  });

  // AC-1 (substance; the roster click-through is playwright-tagged)
  it('offers exactly the five writable entries, with no identifier or change-tracking field', async () => {
    renderAddAnimal();
    await habitatPickerReady();

    // The five the backend accepts (R17) …
    expect(nameField()).toBeInTheDocument();
    expect(speciesField()).toBeInTheDocument();
    expect(ageField()).toBeInTheDocument();
    expect(dietField()).toBeInTheDocument();
    expect(habitatPicker()).toBeInTheDocument();
    // … and nothing else the user could fill in. With the five queries above resolving,
    // an exact count of five is what rules out a sixth entry.
    expect(entryControls()).toHaveLength(5);

    // Server- and backend-derived values are not the user's business, in either
    // direction: no field to fill, and nothing displayed either. `LastChangedUser` is a
    // header injected by the server tier (story 1) — the user never supplies or sees it.
    expect(screen.queryAllByLabelText(FORBIDDEN_ENTRY_LABEL)).toEqual([]);
    expect(screen.queryAllByText(/last changed|changed by/i)).toEqual([]);
    expect(screen.queryAllByText(FIXED_CHANGE_NAME)).toEqual([]);

    expect(submitControl()).toBeInTheDocument();
  });

  // AC-1 (substance)
  it('sends exactly the five writable fields, with Age and HabitatId as numbers', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue(createWriteSuccess());

    renderAddAnimal();
    await habitatPickerReady();

    await fillTextEntries(user);
    await chooseHabitat(user, CHOSEN_HABITAT);
    await user.click(submitControl());

    await waitFor(() => expect(attemptedWrite().body).toEqual(EXPECTED_BODY));

    // Exactly five keys: `Id`, `HabitatName`, `LastChangedUser` and `LastChangedDate` are
    // never sent (R17) — the first two are backend-derived, the last two server-injected.
    expect(Object.keys(attemptedWrite().body).sort()).toEqual(
      WRITABLE_FIELD_NAMES,
    );
    // Numbers, not the strings the DOM hands you: `toEqual` above distinguishes 5 from '5'
    // and 2 from '2', so a schema that forgets to coerce cannot pass.
    expect(attemptedWrite().body.Age).toBe(NEW_ANIMAL.Age);
    expect(attemptedWrite().body.HabitatId).toBe(NEW_ANIMAL.HabitatId);
    // The app's own route handler, by relative path (architecture.md Decision 1).
    expect(attemptedWrite().endpoint).toBe('/api/animals');
  });

  // AC-2
  it('offers the existing habitats, read from the app’s own /api/habitats, as the only choices', async () => {
    const user = userEvent.setup();
    renderAddAnimal();
    await habitatPickerReady();

    const choices = await habitatChoices(user);

    // Every real habitat is offered …
    expect(choices).toEqual(expect.arrayContaining(HABITAT_NAMES));
    // … and nothing that is not a habitat (beyond the "nothing chosen" placeholder) is:
    // no invented options, and no "add a habitat" shortcut smuggled in as a choice.
    const notAHabitat = choices.filter(
      (choice) =>
        !HABITAT_NAMES.includes(choice) && !PICKER_PLACEHOLDER.test(choice),
    );
    expect(notAHabitat).toEqual([]);

    // Read through the app's own route handler, by relative path. An absolute Linx URL
    // here would mean the shared API key reached the browser (the `buildUrl()` trap).
    expect(requestedEndpoints()).toContain('/api/habitats');
    const offSiteReads = requestedEndpoints().filter(
      (endpoint) => !endpoint.startsWith('/api/'),
    );
    expect(offSiteReads).toEqual([]);
  });

  // AC-2
  it('refuses to save without a habitat and sends nothing, having chosen none for the user', async () => {
    const user = userEvent.setup();
    renderAddAnimal();
    await habitatPickerReady();

    // Nothing is preselected: the form must not quietly pick a habitat, because an animal
    // saved against the wrong or missing habitat is created and then permanently invisible
    // in every list (R18/BR5) — a silent default hides that decision from the user.
    expect(HABITAT_NAMES).not.toContain(chosenHabitatLabel());

    await fillTextEntries(user);
    await user.click(submitControl());

    await waitFor(() => expect(habitatPicker()).toBeInvalid());
    expect(habitatPicker()).toHaveAccessibleDescription(
      A_MESSAGE_AGAINST_THE_FIELD,
    );
    // Blocked before the wire, not rejected after it: the backend validates nothing (R19)
    // and would happily create an orphaned animal.
    expect(attemptedWrites()).toEqual([]);
  });

  // AC-2
  it('offers no way to create a habitat from this form', async () => {
    const user = userEvent.setup();
    renderAddAnimal();
    await habitatPickerReady();

    expect(habitatCreationAffordances()).toEqual([]);
    expect(screen.queryAllByLabelText(/new habitat|habitat name/i)).toEqual([]);

    // The open picker is where an "＋ Add a new habitat" row is most tempting and most
    // wrong: there is no endpoint behind it (R16/BR7). Only `GET /v1/habitats` exists.
    const choices = await habitatChoices(user);
    expect(choices.filter((choice) => CREATE_VERB.test(choice))).toEqual([]);

    expect(habitatCreationAffordances()).toEqual([]);
    // Nor a promise of it later in place of a control.
    expect(screen.queryAllByText(COMING_SOON)).toEqual([]);
  });

  // AC-3
  it('blocks an empty save and puts a message against every one of the five entries', async () => {
    const user = userEvent.setup();
    renderAddAnimal();
    await habitatPickerReady();

    await user.click(submitControl());

    await waitFor(() => expect(nameField()).toBeInvalid());

    // Each offending entry is marked and carries its own message — a single form-level
    // "please check your entries" leaves the user hunting for which field it means.
    for (const field of [
      nameField(),
      speciesField(),
      ageField(),
      dietField(),
      habitatPicker(),
    ]) {
      expect(field).toBeInvalid();
      expect(field).toHaveAccessibleDescription(A_MESSAGE_AGAINST_THE_FIELD);
    }

    expect(attemptedWrites()).toEqual([]);
  });

  // AC-3 — Age is the one field with a rule beyond "not empty", and the backend enforces
  // nothing (R19), so this layer is the only guard that exists. Two genuinely distinct
  // ways of being not-a-whole-number-of-zero-or-more, each from a clean form.
  it.each([
    { entry: '-1', why: 'a negative age' },
    { entry: '2.5', why: 'a fractional age' },
  ])(
    'blocks the save on $why ($entry), keeping it visible for correction',
    async ({ entry }) => {
      const user = userEvent.setup();
      renderAddAnimal();
      await habitatPickerReady();

      await fillTextEntries(user, entry);
      await chooseHabitat(user, CHOSEN_HABITAT);
      await user.click(submitControl());

      await waitFor(() => expect(ageField()).toBeInvalid());
      expect(ageField()).toHaveAccessibleDescription(WHOLE_NUMBER_RULE);
      // What they typed is still there to fix — the field is not silently blanked, and the
      // entry never reaches the database, which stores whatever it is sent (R19).
      expect(ageField()).toHaveDisplayValue(entry);
      expect(attemptedWrites()).toEqual([]);
    },
  );

  // AC-3
  it('accepts an age of zero and sends it as the number 0', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue(createWriteSuccess());

    renderAddAnimal();
    await habitatPickerReady();

    await fillTextEntries(user, '0');
    await chooseHabitat(user, CHOSEN_HABITAT);
    await user.click(submitControl());

    // Zero is a whole number of zero or more, so this animal saves. A truthiness check on
    // Age — `if (!Age) reject` — is the classic bug this closes, and it cannot pass here.
    await waitFor(() =>
      expect(attemptedWrite().body).toEqual({ ...EXPECTED_BODY, Age: 0 }),
    );
  });

  // AC-5
  it('keeps everything the user typed, on the same screen, when the save is refused', async () => {
    const user = userEvent.setup();
    const inFlight = deferredWrite();
    mockPost.mockReturnValue(inFlight.promise);

    renderAddAnimal();
    await habitatPickerReady();

    await fillTextEntries(user);
    await chooseHabitat(user, CHOSEN_HABITAT);
    await user.click(submitControl());

    // The write is visibly under way (NFR-2), which is also what makes the refusal below
    // a deterministic moment rather than a race.
    await waitFor(() => expect(submitControl()).toBeDisabled());

    inFlight.resolve(createWriteError());

    // Refused, and the user can try again — not left on a dead form.
    await waitFor(() => expect(submitControl()).toBeEnabled());

    // Nothing the user typed is lost. This is the whole of AC-5; *how* the refusal reads
    // (duplicate name against the Name field, versus a readable technical failure) is
    // story 8's job and is deliberately not asserted here.
    expect(nameField()).toHaveDisplayValue(NAME_ENTRY);
    expect(speciesField()).toHaveDisplayValue(SPECIES_ENTRY);
    expect(ageField()).toHaveDisplayValue(AGE_ENTRY);
    expect(dietField()).toHaveDisplayValue(DIET_ENTRY);
    expect(chosenHabitatLabel()).toBe(CHOSEN_HABITAT_NAME);

    // And they are still on the form, not navigated away and not staring at a full-page
    // error: only a `Success` outcome navigates (Decision 2 / R23).
    expect(
      screen.getByRole('heading', { name: /add animal/i }),
    ).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
