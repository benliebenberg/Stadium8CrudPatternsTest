/**
 * Story Metadata:
 * - Route: /animals/new
 * - Target File: web/src/components/animals/AnimalForm.tsx
 * - Page Action: modify_existing
 *
 * Epic `zoo-animal-manager`, Story 8 — handling refused saves.
 *
 * Covers the four `vitest`-tagged criteria: AC-2 (the duplicate-name rejection behaves
 * identically when *editing*), AC-3 (a duplicate is presented as a business rejection,
 * clearly distinct from a technical failure), AC-4 (a technical failure leads with a
 * readable message rather than raw backend text, keeps every entry, and offers another
 * attempt) and AC-5 (retrying resubmits the same values with nothing retyped). AC-1 — the
 * duplicate rejection on the add screen, seen through a real browser — is
 * `playwright`-tagged and lives in
 * `web/e2e/epic-zoo-animal-manager-story-8-refused-saves.spec.ts`.
 *
 * Why this story is its own slice: both branches live in the ONE shared form component
 * (`AnimalForm.tsx`) that story 6 renders at `/animals/new` and story 7 renders at
 * `/animals/[id]/edit`. So the duplicate branch is proven through **both** entry points
 * here — POST (AC-3) and PUT (AC-2) — because a branch that only works on the add path is
 * exactly the defect this story exists to prevent (R20/R21).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THE OUTCOME CONTRACT — architecture.md Decisions 2 and 3, binding
 * ─────────────────────────────────────────────────────────────────────────────────
 * A write is answered by the app's own route handler with **HTTP 200 and the
 * `DefaultResponse` envelope verbatim**, whatever status Linx used. So on the browser side
 * the write promise **RESOLVES** — a refused write is a *result*, not an exception — and the
 * caller branches solely on `MessageType`, in the backend's own casing (Decision 2):
 *
 *   `Success`  → the write worked
 *   `Warning`  → business rejection ("Animal already exists"): recoverable, field-level
 *   `Error`    → technical failure, raw DB text in `Messages[0]`: readable message + retry
 *
 * Every fixture below therefore **resolves**; none rejects, and none carries a status code.
 * `createDuplicateWarning()` and `createWriteError()` differ ONLY by `MessageType` and
 * `Messages` — identical status, identical envelope shape — which is precisely why AC-3 can
 * assert that the two are presented differently. Only a transport-level fault (handler
 * unreachable) would reject, and that is not this story.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THESE TESTS PIN — implement `AnimalForm.tsx`'s two rejection branches to it
 * ─────────────────────────────────────────────────────────────────────────────────
 * 1. **The shared form's queries are unchanged.** Same labels as stories 6 and 7 —
 *    `/^name\b/i`, `/^species\b/i`, `/^age\b/i`, `/^diet\b/i`, and habitat as a `combobox`
 *    named `/habitat/i`; add's submit is "Add animal", edit's starts "Save" or "Update".
 *    This story adds behaviour to that component and changes none of its surface.
 *
 * 2. **`Warning` is reported against the Name field, and nowhere else.** The Name control
 *    gets `aria-invalid` and the rejection is wired as that control's accessible
 *    *description* (`aria-describedby`) — the same mechanism story 6/7 pin for validation
 *    (Shadcn `FormControl` + `FormMessage`, i.e. react-hook-form's `setError('Name', …)`).
 *    No form- or page-level `role="alert"` accompanies it: a duplicate name is a fixable
 *    business rejection, not a failure banner (R20). If a toast accompanies it at all it is
 *    the *warning* variant (`role="status"`), never the error variant (`role="alert"`).
 *
 * 3. **`Error` is reported at form/page level, and NOT against the Name field.** A
 *    `role="alert"` carries a readable message — the same failure convention stories 2, 4
 *    and 5 already use for a failed read, and what the template's error-variant toast
 *    renders. Name is *not* marked invalid: the user's name was never the problem, and
 *    accusing it would send them editing a correct value.
 *
 * 4. **Readable first, raw backend text second.** `Messages[0]` on an `Error` is raw
 *    database text ("The INSERT statement conflicted with the FOREIGN KEY constraint …").
 *    It must not be what the user reads first — but it must not be swallowed either
 *    (Critical Rule 3 / R24): keep it on screen as secondary detail (a "technical details"
 *    line or disclosure is ideal) so it can be quoted in a bug report.
 *
 * 5. **Neither branch loses anything or moves the user.** All five entries keep their
 *    values, the form stays on screen (no full-page error, no reset), nothing navigates —
 *    only a `Success` outcome navigates (R23) — and the submit control is enabled again so
 *    the same values can be sent as-is.
 *
 * 6. **The uniqueness rule is the BACKEND's.** These tests only exercise how the app
 *    handles the message the backend sent; the app must not implement a duplicate check of
 *    its own. The exact rule (most likely `Animal.Name`) is an unverified assumption to
 *    confirm against the running backend during this story — if it turns out to be broader,
 *    the message must not point at the wrong field.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THE SEAM, AND WHY `ToastContainer` IS MOUNTED HERE
 * ─────────────────────────────────────────────────────────────────────────────────
 * architecture.md Decision 1: screens are **client** components calling the app's own
 * same-origin `/api/*` route handlers, so the one mocked module is `@/lib/api/client` — the
 * seam every story in this epic pins. No component calls `fetch()` itself (Critical Rule 2).
 *
 * Unlike stories 6 and 7, the render wrapper below mounts `ToastProvider` **and**
 * `ToastContainer`, exactly as `layout.tsx` does. This story is about a *message*, and the
 * template's toast layer is a legitimate place to raise the technical-failure one (R24 /
 * architecture.md § Reusable code) — mounting only the provider would make a toast-based
 * message invisible to jsdom and fail a correct implementation. Both are the real
 * components; nothing about the notification system is stubbed.
 *
 * These tests FAIL until story 8 is implemented (TDD red): stories 6 and 7 create the
 * routes and the shared form, and neither rejection branch exists yet.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import AnimalEditPage from '@/app/animals/[id]/edit/page';
import AddAnimalPage from '@/app/animals/new/page';
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { del, get, post, put } from '@/lib/api/client';
// Project-wide entity factories — the single source of truth for these bodies, shared with
// the Playwright layer. No envelope or response shape is written by hand here.
import { createAnimal } from '@/mocks/data/animal';
import { createHabitatList, createHabitats } from '@/mocks/data/habitat';
import {
  createDuplicateWarning,
  createWriteError,
  createWriteSuccess,
} from '@/mocks/data/write-result';
import type { AnimalRead } from '@/types/api-generated';

import type { ReactElement } from 'react';
import type { Mock } from 'vitest';

/**
 * The route the edit screen is mounted at, the pathname each render helper sets, and the
 * navigation spies a refusal is judged by. Hoisted because `vi.mock` factories are evaluated
 * before module-level `const`s are initialised.
 */
const routeParams = vi.hoisted(() => ({ id: '7' }));
const navState = vi.hoisted(() => ({ pathname: '/animals/new' }));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => routeParams,
  usePathname: () => navState.pathname,
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

// Casts rather than `vi.mocked`: these are generic (`post<T>(...) => Promise<T>`), so a typed
// mock implementation cannot return a concrete body without fighting `T`.
const mockGet = get as unknown as Mock;
const mockPost = post as unknown as Mock;
const mockPut = put as unknown as Mock;
const mockDel = del as unknown as Mock;

/** Every write verb, so an unexpected write surfaces as a failure instead of `undefined`. */
const writeMocks: Mock[] = [mockPost, mockPut, mockDel];

const UNEXPECTED_WRITE =
  'This write was not expected: the form sent something these tests did not arrange.';

const HABITATS_ONLY =
  'The add form reads habitats only, through the app’s own route handler: an absolute Linx URL here would mean the shared API key reached the browser.';

const ANIMAL_ID = Number(routeParams.id);

/**
 * Narrow a value the shared factories always populate. Every field on the generated API
 * types is optional (the spec declares no `required:` arrays), so an absent value means the
 * factory changed — not that the assertion should be skipped.
 */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`the shared factory no longer populates ${what}`);
  }
  return value;
}

/** Habitat names from the one shared source, so the picker assertions cannot drift. */
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

/**
 * The animal typed into the ADD form. Built from the shared factory so its values can never
 * drift from the entity the rest of the suite uses. `HabitatId: 2` is deliberately not the
 * first habitat, matching story 6.
 */
const NEW_ANIMAL = createAnimal({
  Name: 'Tandi',
  Species: 'Black Rhinoceros',
  Age: 5,
  HabitatId: RAINFOREST_ID,
  Diet: 'Herbivore',
});

const NAME_ENTRY = required(NEW_ANIMAL.Name, 'Animal.Name');
const SPECIES_ENTRY = required(NEW_ANIMAL.Species, 'Animal.Species');
const DIET_ENTRY = required(NEW_ANIMAL.Diet, 'Animal.Diet');
const AGE_ENTRY = String(required(NEW_ANIMAL.Age, 'Animal.Age'));

/** The five writable fields (R17) the add form must send — and resend, unchanged, on retry. */
const EXPECTED_BODY = {
  Name: NEW_ANIMAL.Name,
  Species: NEW_ANIMAL.Species,
  Age: NEW_ANIMAL.Age,
  HabitatId: NEW_ANIMAL.HabitatId,
  Diet: NEW_ANIMAL.Diet,
};

/** The record under edit (AC-2), and the name the user renames it to. */
const EDITED_NAME = 'Thabo';
const EDITED_SPECIES = 'Southern White Rhinoceros';
const EDITED_AGE = 11;
const EDITED_DIET = 'Herbivore';

/**
 * A name the roster already contains — the canonical animal's own name. The *backend* is what
 * decides this is a duplicate (contract point 6): the form sends it like any other name and
 * only learns otherwise from `MessageType: 'Warning'`.
 */
const NAME_ALREADY_TAKEN = required(createAnimal().Name, 'Animal.Name');

/** The raw database text an `Error` carries in `Messages[0]` (BR11), from the shared fixture. */
const RAW_BACKEND_TEXT = createWriteError().Messages[0];

const NAME_LABEL = /^name\b/i;
const SPECIES_LABEL = /^species\b/i;
const AGE_LABEL = /^age\b/i;
const HABITAT_LABEL = /^habitat\b/i;
const DIET_LABEL = /^diet\b/i;

const ADD_ACTION = /^add animal$/i;
const SAVE_ACTION = /^(save|update)\b/i;

/**
 * Wording that tells the user this name is already taken — a fixable, business rejection
 * (`Warning`). Free-form, but it has to be *about* the duplicate: a generic "something went
 * wrong" cannot match, which is the point of AC-3.
 */
const DUPLICATE_REJECTION =
  /already exists|already (in use|taken|used)|duplicate|another animal|choose another|different name/i;

/**
 * Wording a person can act on when the save fails for technical reasons (`Error`). Note that
 * the raw backend text does NOT match this pattern, so dumping the SQL exception cannot
 * satisfy the assertion.
 */
const READABLE_FAILURE =
  /couldn[’']?t|could not|unable to|failed|went wrong|problem|try again|not saved|wasn[’']?t saved/i;

type UserEventInstance = ReturnType<typeof userEvent.setup>;

/** Match a whole string, case-insensitively, whatever characters it contains. */
function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

/**
 * Where `wording` first appears in `text`, or `Infinity` when it is absent — so an ordering
 * assertion ("the readable message comes before the raw database text") holds whether or not
 * the raw text happens to sit inside the same element, and still fails when the readable
 * message is missing altogether. Deliberately a pure function of the text, not a branch on
 * the DOM.
 */
function positionOf(text: string, wording: RegExp | string): number {
  const at =
    typeof wording === 'string' ? text.indexOf(wording) : text.search(wording);
  return at < 0 ? Number.POSITIVE_INFINITY : at;
}

/** Everything the user can read on screen, including any toast. */
function screenText(): string {
  return document.body.textContent ?? '';
}

/**
 * The entry labelled `label`, whatever control the implementation chose for it (stories 6 and
 * 7 both leave the shape open). `queryBy ?? getBy` rather than a `||` chain — `getBy*` throws
 * on no match, so a `||` right-hand side would never be reached.
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

/** The elements a control points at with `aria-describedby` — its own message(s). */
function describedByElements(control: HTMLElement): HTMLElement[] {
  return (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((id) => id.length > 0)
    .map((id) => document.getElementById(id))
    .filter((element): element is HTMLElement => element !== null);
}

/** The text a screen reader would read as `control`'s description. */
function accessibleDescription(control: HTMLElement): string {
  return describedByElements(control)
    .map((element) => (element.textContent ?? '').trim())
    .filter((text) => text.length > 0)
    .join(' ');
}

/**
 * Alerts that are NOT `control`'s own message — i.e. form- or page-level failure reporting,
 * including an error-variant toast (the template renders those with `role="alert"`).
 *
 * This is the treatment half of AC-3: a `Warning` belongs to the Name field's description and
 * must raise none of these, while an `Error` must raise one. Filtering by the field's
 * `aria-describedby` rather than by the absence of `role="alert"` keeps the distinction about
 * *where* the message lives, so an inline field message carrying `role="alert"` — a
 * legitimate pattern — is still correctly counted as field-level.
 */
function formLevelAlerts(control: HTMLElement): HTMLElement[] {
  const ownMessages = describedByElements(control);

  return screen
    .queryAllByRole('alert')
    .filter(
      (alert) =>
        !ownMessages.some(
          (message) =>
            message === alert ||
            message.contains(alert) ||
            alert.contains(message),
        ),
    );
}

/** Their text, for a failure message that names the offending element rather than a count. */
function formLevelAlertTexts(control: HTMLElement): string[] {
  return formLevelAlerts(control).map((alert) =>
    (alert.textContent ?? '').trim(),
  );
}

/**
 * What the user reads when the form fails as a whole. Throws while there is none, so a
 * `waitFor` around it reads as "wait until the form reports the failure" and no assertion on
 * the message can pass vacuously.
 */
function formLevelFailureText(control: HTMLElement): string {
  const texts = formLevelAlertTexts(control);

  if (texts.length === 0) {
    throw new Error('the form has not reported a failure of its own yet');
  }
  return texts.join('\n');
}

interface AttemptedWrite {
  endpoint: string;
  body: Record<string, unknown>;
}

/** Every write the screen sent, in order, whichever verb it used. */
function attemptedWrites(): AttemptedWrite[] {
  const asWrite = (call: unknown[]): AttemptedWrite => ({
    endpoint: String(call[0]),
    body: (call[1] ?? {}) as Record<string, unknown>,
  });

  return [
    ...mockPost.mock.calls.map(asWrite),
    ...mockPut.mock.calls.map(asWrite),
    ...mockDel.mock.calls.map(asWrite),
  ];
}

/**
 * The `nth` write the form sent (1-based). Throws descriptively until it exists, so
 * `waitFor(() => expect(nthWrite(2)…))` reads as "wait until the retry is sent" and an
 * assertion on its body can never pass against a write that never happened.
 */
function nthWrite(nth: number): AttemptedWrite {
  const write = attemptedWrites()[nth - 1];

  if (!write) {
    throw new Error(`the form has sent no write number ${nth} yet`);
  }
  return write;
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

function addButton(): HTMLElement {
  return screen.getByRole('button', { name: ADD_ACTION });
}

function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: SAVE_ACTION });
}

/**
 * `ToastProvider` + `ToastContainer`, exactly as `layout.tsx` mounts them — both real
 * components, so a message raised through `useToast()` is observable here instead of
 * silently invisible (see the header note).
 */
function renderInShell(page: ReactElement) {
  return render(
    <ToastProvider>
      {page}
      <ToastContainer />
    </ToastProvider>,
  );
}

/**
 * The add screen. Habitats are its only read; anything else rejects so a stray roster load or
 * an absolute Linx URL breaks the screen instead of passing silently.
 */
function renderAddAnimal() {
  navState.pathname = '/animals/new';
  mockGet.mockImplementation((endpoint: unknown) =>
    /habitat/i.test(String(endpoint))
      ? Promise.resolve(createHabitatList())
      : Promise.reject(new Error(`${HABITATS_ONLY} Requested: ${endpoint}`)),
  );

  return renderInShell(<AddAnimalPage />);
}

/** The record the edit screen loads: `GET /api/animals/{id}` answers a bare `AnimalRead` (BR8). */
function animalRecord(overrides: Partial<AnimalRead> = {}): AnimalRead {
  return createAnimal({
    Id: ANIMAL_ID,
    Name: EDITED_NAME,
    Species: EDITED_SPECIES,
    Age: EDITED_AGE,
    HabitatId: SAVANNAH_ID,
    Diet: EDITED_DIET,
    ...overrides,
  });
}

/** The edit screen, serving its two reads (the record, and the picker's habitats). */
function renderEditPage(animal: AnimalRead = animalRecord()) {
  navState.pathname = `/animals/${ANIMAL_ID}/edit`;
  mockGet.mockImplementation((endpoint: unknown) => {
    const path = String(endpoint);

    if (/habitat/i.test(path)) {
      return Promise.resolve(createHabitatList());
    }
    if (/animal/i.test(path)) {
      return Promise.resolve(animal);
    }
    return Promise.reject(new Error(`Unexpected read of ${path}`));
  });

  return renderInShell(<AnimalEditPage />);
}

/** The add form is ready once its habitat choices have arrived. */
async function addFormReady(): Promise<HTMLElement> {
  return screen.findByRole('combobox', { name: HABITAT_LABEL });
}

/** The edit form is ready once the record it was asked for is showing. */
async function editFormPrefilled(): Promise<void> {
  await waitFor(() =>
    expect(presentedValue(field(NAME_LABEL))).toBe(EDITED_NAME),
  );
}

/** Fill the add form with a complete, valid animal, so only the backend can refuse it. */
async function fillAddForm(user: UserEventInstance): Promise<void> {
  await typeInto(user, NAME_LABEL, NAME_ENTRY);
  await typeInto(user, SPECIES_LABEL, SPECIES_ENTRY);
  await typeInto(user, AGE_LABEL, AGE_ENTRY);
  await typeInto(user, DIET_LABEL, DIET_ENTRY);
  await chooseHabitat(user, exactly(RAINFOREST));
  await waitFor(() =>
    expect(presentedValue(field(HABITAT_LABEL))).toBe(RAINFOREST),
  );
}

/** Every entry still holds what the user put there — nothing lost to the refusal. */
function expectAddEntriesIntact(): void {
  expect(presentedValue(field(NAME_LABEL))).toBe(NAME_ENTRY);
  expect(presentedValue(field(SPECIES_LABEL))).toBe(SPECIES_ENTRY);
  expect(presentedValue(field(AGE_LABEL))).toBe(AGE_ENTRY);
  expect(presentedValue(field(DIET_LABEL))).toBe(DIET_ENTRY);
  expect(presentedValue(field(HABITAT_LABEL))).toBe(RAINFOREST);
}

describe('Epic zoo-animal-manager, Story 8: refused saves', () => {
  beforeAll(() => {
    // jsdom implements neither pointer capture, `Element.scrollIntoView`, nor
    // `ResizeObserver` — all three are used by Radix's Select (what Shadcn's `select`
    // primitive wraps) the moment its listbox opens. These are missing-browser-API shims,
    // not stubs of anything under test: a native `<select>` is unaffected, and the Radix
    // control becomes operable instead of throwing. Same shims as stories 6 and 7.
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

    // Every write starts out refusing loudly, so a write these tests did not arrange cannot
    // slip through as a silently resolved `undefined`. Each test opts in with
    // `mockResolvedValueOnce`, which is also how the retry gets a different second answer.
    for (const write of writeMocks) {
      write.mockReset();
      write.mockRejectedValue(new Error(UNEXPECTED_WRITE));
    }

    router.push.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    router.back.mockReset();
  });

  // AC-2 — the duplicate branch through the OTHER entry point. Both branches live in the one
  // shared component, so a rejection path proven only on the add form is exactly the defect
  // this story exists to prevent (R20/R21).
  it('reports the duplicate name against the Name field when editing, with the edit intact', async () => {
    const user = userEvent.setup();
    // Status 200 + `MessageType: 'Warning'`: the promise RESOLVES (Decision 3), so the caller
    // reads the envelope rather than catching an exception.
    mockPut.mockResolvedValueOnce(createDuplicateWarning());

    renderEditPage();
    await editFormPrefilled();

    // Rename this animal onto a name the roster already holds. The *backend* decides that is
    // a duplicate — the form has no uniqueness rule of its own (contract point 6).
    await typeInto(user, NAME_LABEL, NAME_ALREADY_TAKEN);
    await user.click(saveButton());

    // Against the Name field, marked and described — identical treatment to the add form.
    await waitFor(() => expect(field(NAME_LABEL)).toBeInvalid());
    expect(field(NAME_LABEL)).toHaveAccessibleDescription(DUPLICATE_REJECTION);
    // And nowhere else: a recoverable business rejection raises no form-level failure banner
    // and no error toast (R20).
    expect(formLevelAlertTexts(field(NAME_LABEL))).toEqual([]);

    // The name they typed is still there to correct, and the rest of the record with it.
    expect(presentedValue(field(NAME_LABEL))).toBe(NAME_ALREADY_TAKEN);
    expect(presentedValue(field(SPECIES_LABEL))).toBe(EDITED_SPECIES);
    expect(presentedValue(field(AGE_LABEL))).toBe(String(EDITED_AGE));
    expect(presentedValue(field(DIET_LABEL))).toBe(EDITED_DIET);
    expect(presentedValue(field(HABITAT_LABEL))).toBe(SAVANNAH);

    // Still on their form, able to save again — not navigated away, not wiped, not replaced
    // by a full-page error. Only a `Success` outcome navigates (R23).
    expect(saveButton()).toBeEnabled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  // AC-3 — the discriminating test. Both rejections arrive with the SAME status (200) and the
  // SAME envelope shape, differing only in `MessageType`; they must reach the user as
  // recognisably different things. One shared "something went wrong" treatment fails both
  // halves below, which is the point.
  it('presents a duplicate name as a fixable rejection on the Name field, and a technical failure as a form-level message that accuses no entry', async () => {
    const user = userEvent.setup();

    // ── The business rejection: `MessageType: 'Warning'` ──────────────────────────────
    mockPost.mockResolvedValueOnce(createDuplicateWarning());

    const duplicateAttempt = renderAddAnimal();
    await addFormReady();
    await fillAddForm(user);
    await user.click(addButton());

    await waitFor(() => expect(field(NAME_LABEL)).toBeInvalid());
    expect(field(NAME_LABEL)).toHaveAccessibleDescription(DUPLICATE_REJECTION);
    const duplicateMessage = accessibleDescription(field(NAME_LABEL));
    // Field-level, and only field-level.
    expect(formLevelAlertTexts(field(NAME_LABEL))).toEqual([]);

    // A fresh form for the second half, so the technical failure below is judged on its own
    // presentation rather than on state left over from the duplicate.
    duplicateAttempt.unmount();

    // ── The technical failure: same status, same envelope, `MessageType: 'Error'` ──────
    mockPost.mockResolvedValueOnce(createWriteError());

    renderAddAnimal();
    await addFormReady();
    await fillAddForm(user);
    await user.click(addButton());

    const failureMessage = await waitFor(() =>
      formLevelFailureText(field(NAME_LABEL)),
    );

    // Reported at form level, readable …
    expect(failureMessage).toMatch(READABLE_FAILURE);
    // … not dressed up as a fixable duplicate …
    expect(failureMessage).not.toMatch(DUPLICATE_REJECTION);
    // … and it accuses no entry: the Name the user typed was never the problem, so marking it
    // invalid would send them editing a perfectly good value.
    expect(field(NAME_LABEL)).not.toBeInvalid();
    expect(field(SPECIES_LABEL)).not.toBeInvalid();
    expect(field(AGE_LABEL)).not.toBeInvalid();
    expect(field(DIET_LABEL)).not.toBeInvalid();
    expect(field(HABITAT_LABEL)).not.toBeInvalid();

    // The two refusals read differently. A single shared message for both cannot satisfy
    // this line and the duplicate assertions above at the same time.
    expect(failureMessage).not.toBe(duplicateMessage);
  });

  // AC-4 — the technical failure in full: readable first, raw database text kept but
  // secondary, every entry preserved, another attempt available (R24 / Critical Rule 3).
  it('leads a technical failure with a readable message while still surfacing the backend’s own text, keeping every entry and allowing another attempt', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValueOnce(createWriteError());

    renderAddAnimal();
    await addFormReady();
    await fillAddForm(user);
    await user.click(addButton());

    const failureMessage = await waitFor(() =>
      formLevelFailureText(field(NAME_LABEL)),
    );

    // The readable message comes FIRST — before the raw database text, if that text appears
    // here at all. `MessageType: 'Error'` carries "The INSERT statement conflicted with the
    // FOREIGN KEY constraint …" in `Messages[0]` (BR11); a user must not have to read a
    // constraint violation to learn their animal was not saved.
    expect(positionOf(failureMessage, READABLE_FAILURE)).toBeLessThan(
      positionOf(failureMessage, RAW_BACKEND_TEXT),
    );
    // But the error is not swallowed either (Critical Rule 3 / R24): the backend's own text
    // stays on screen as secondary detail, where it can be quoted in a bug report.
    expect(screenText()).toContain(RAW_BACKEND_TEXT);

    // Nothing the user typed is lost …
    expectAddEntriesIntact();
    // … and they can send it again as it stands: the control that was disabled while the
    // write was in flight (story 6) is live again.
    expect(addButton()).toBeEnabled();
  });

  // AC-5 — the retry. "Without re-typing anything" is only true if the second request carries
  // exactly the same values as the first, so this compares the two bodies.
  it('resubmits the identical values when the user retries after a technical failure', async () => {
    const user = userEvent.setup();
    mockPost
      .mockResolvedValueOnce(createWriteError())
      .mockResolvedValueOnce(createWriteSuccess());

    renderAddAnimal();
    await addFormReady();
    await fillAddForm(user);
    await user.click(addButton());

    // The failure has landed and the form is live again — a deterministic moment to retry
    // from, rather than a race.
    const failureMessage = await waitFor(() =>
      formLevelFailureText(field(NAME_LABEL)),
    );
    expect(failureMessage).toMatch(READABLE_FAILURE);
    await waitFor(() => expect(addButton()).toBeEnabled());

    // The user touches nothing: no field is refilled, no habitat re-chosen. They just try
    // again.
    await user.click(addButton());

    await waitFor(() => expect(nthWrite(2).body).toEqual(nthWrite(1).body));
    // And what is resent is still the complete, correct animal — a retry that rebuilt the
    // body from a partially reset form would differ here even though both attempts "sent
    // something".
    expect(nthWrite(2).body).toEqual(EXPECTED_BODY);
    expect(nthWrite(2).endpoint).toBe(nthWrite(1).endpoint);
  });
});
