/**
 * Story Metadata:
 * - Route: /animals/1
 * - Target File: web/src/components/toast/Toast.tsx
 * - Page Action: modify_existing
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never uses the
 *   real `API_KEY` (testing-policy.md § "Playwright runs against mocks, never live").
 * - **This spec drives a `DELETE`, so it carries epic 1 story 9's full set of defences.**
 *   `dataSource` is `existing-api` with no MSW runtime layer (architecture.md Decision 1), so a
 *   single missed interception does not merely fail a test — the `DELETE` travels through the app's
 *   own route handler to Linx and REMOVES A REAL ANIMAL FROM THE REAL DATABASE, with no undo (the
 *   backend's delete event is a bare `DeleteAnimal → Return`, epic 1 BR12). Four defences:
 *   1. `abortUnmatchedApiRequests(page)` is installed FIRST. Playwright matches handlers in reverse
 *      registration order, so it becomes the last resort: any `/api/**` request the specific
 *      interceptors miss is aborted loudly instead of reaching the backend.
 *   2. `mockAnimalDelete()` answers ONLY `DELETE` on the app's own detail route and passes every
 *      other method on with `route.fallback()`, so the detail view's `GET` still reaches
 *      `mockAnimal()` and is never answered with a write envelope (which epic 1 story 4 reads as
 *      "animal not found" — BR8/BR9).
 *   3. The Linx base URL (`http://localhost:10002/crud-patterns/**`) is NEVER routed. That call is
 *      made from the Next.js server tier, which `page.route()` cannot see, so routing it would
 *      match nothing and produce a spec that silently deletes production data.
 *   4. `watchForUnmockedWrites()` below fails the test if ANY mutating request went anywhere other
 *      than the one mocked `DELETE` path — closing the hole defence 1 cannot: a Server Action posts
 *      to the PAGE url (`/animals/1`), not `/api/**`, so a removal implemented that way would sail
 *      past even the `**\/api\/**` net, reach Linx server-side, and really remove the row.
 * - Both write fixtures resolve at HTTP **200** carrying the `DefaultResponse` envelope
 *   (architecture.md Decision 3): the route handler normalises every write to 200 and returns the
 *   envelope verbatim, so the browser-side promise RESOLVES and the caller branches on
 *   `MessageType`. Neither the success nor the failure fixture is served at 500 — that would test a
 *   contract this app does not have.
 * - Interception is via `page.route()` on the app's own route handlers, through the shared
 *   interceptors in `./fixtures/api-mocks` and their disjoint list/detail regexes (architecture.md
 *   § Playwright spec conventions #4, #7) — never a `**\/api\/animals**` glob.
 * - Response bodies come from the shared factories (`../src/mocks/data/animal`,
 *   `../src/mocks/data/write-result`) via that fixtures module, imported by RELATIVE path — never
 *   the `@/` alias, which Playwright's runtime does not resolve — so this layer cannot drift from
 *   the Vitest layer. The asserted wording is read back OUT of those fixtures rather than written a
 *   second time.
 * - No auth chain, no cookie clearing, no credential fixtures: this project has no login, session
 *   or `userinfo` endpoint (project.md §Authentication, epic 1 BR15, conventions #6).
 * - No cookie or server-side storage assumptions: the theme preference is browser-only (BR6).
 *
 * E2E spec for Epic theme-switching, Story 3: Notifications follow the active theme.
 *
 * ## What this test does and does not prove
 *
 * Covers the story's one `playwright`-tagged criterion, AC-5: with the computer set to light, a
 * successful removal shows its confirmation notification and a refused removal shows its failure
 * notification, each readable on the page.
 *
 * "Readable" cannot be asserted without pinning colours, which
 * `.claude/policies/styling-centralisation.md` forbids — so what this spec legitimately proves is
 * the automatable half: **in the light theme, both notifications actually appear, carry the
 * BACKEND'S OWN wording, and land in the right announcement channel** (a failure in the assertive
 * `role="alert"` channel, a confirmation in the polite `role="status"` one, both inside the shared
 * `role="region"` named "Notifications"). Whether they *look* right in light — the card reading as
 * a raised surface on cream, dark text rather than grey-on-white, and a failure accent that reads
 * as an error and never as the brand orange — is AC-1 / AC-2 / AC-6, tagged `coverage: none` and
 * judged by eye at the manual-test gate. **This is not a visual check**, and there are deliberately
 * no colour, hex, class or computed-style assertions anywhere below.
 *
 * AC-3 (the role contract per variant) and AC-4 (title, optional message, dismiss control) are
 * `vitest`-tagged and live in
 * `web/src/__tests__/integration/epic-theme-switching-story-3-notifications-on-tokens.test.tsx` —
 * deliberately not duplicated here.
 *
 * ## How light is established
 *
 * `test.use({ colorScheme: 'light' })` emulates the OS setting, and **nothing is stored**: per
 * architecture.md Decision 4, absence of `localStorage['theme']` means "follow the OS", so an
 * emulated light OS resolves to the light theme and `<html>` carries **no** `dark` class (light is
 * the absence of that class — there is no `light` class). Both halves of that precondition are
 * asserted before any notification is driven, and re-asserted while each notification is on screen:
 * without them the test could silently run in dark and prove nothing about light.
 *
 * That precondition depends on story 1's pre-paint script and its `THEME_STORAGE_KEY`; until story 1
 * lands, `layout.tsx` still hardcodes `className="dark"` and this spec is red for that reason (TDD).
 *
 * No axe scan here: the epic's both-themes accessibility scan rides story 5 (architecture.md
 * Decision 4 § Testing the theme), and epic 1's dark-only baseline stays in story 2's spec.
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { expect, test } from '@playwright/test';

import { createAnimals } from '../src/mocks/data/animal';
import {
  createWriteError,
  createWriteSuccess,
} from '../src/mocks/data/write-result';
import {
  abortUnmatchedApiRequests,
  mockAnimal,
  mockAnimalDelete,
  mockAnimals,
  mockHabitats,
} from './fixtures/api-mocks';

import type { AnimalRead } from '../src/types/api-generated';
import type { Locator, Page } from '@playwright/test';

/**
 * Matches `dark` as a WHOLE class among the three `next/font` variable classes `<html>` also
 * carries. A bare `/dark/` would also match a font variable or a utility containing "dark".
 *
 * The same pattern stories 1 and 2 use, for the same reason: the mechanism (is the class there?) is
 * what the theme contract is about — never a colour.
 */
const THEME_CLASS_PATTERN = /(?:^|\s)dark(?:\s|$)/;

/**
 * The `localStorage` key story 1's pre-paint script reads and story 2's control writes, fixed by
 * architecture.md Decision 4. Its ABSENCE is how "follow the OS" is represented, which is the state
 * this spec requires: nothing is ever written to it here.
 *
 * Pinned as a literal rather than imported, exactly as story 2's spec does: production code must
 * export a `THEME_STORAGE_KEY` constant, but importing it at generation time would stop this spec
 * being collected at all.
 */
const THEME_STORAGE_KEY = 'theme';

/** The canonical four-animal roster the screens are served from. */
const ROSTER = createAnimals();

/**
 * Pull one animal out of the canonical roster, so the record the detail endpoint returns and the
 * name the notifications must carry can never describe different animals. Throws rather than
 * returning `undefined`, so a fixture rename fails loudly here instead of producing a spec that
 * asserts on nothing.
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
 * The generated `AnimalRead` marks every field optional (the API spec declares no `required:`), so
 * the id is narrowed once here rather than threading `| undefined` through every path below.
 */
function idOf(animal: AnimalRead): number {
  if (typeof animal.Id !== 'number') {
    throw new Error(`The animal fixture "${String(animal.Name)}" has no Id`);
  }

  return animal.Id;
}

/** Anaya — Id 1, so the story's `/animals/1` route is the one actually exercised. */
const ANIMAL = animalNamed('Anaya');
const ANIMAL_ID = idOf(ANIMAL);
const ANIMAL_NAME = 'Anaya';

const DETAIL_PATH = `/animals/${String(ANIMAL_ID)}`;

/** The app's own route handler the `DELETE` must be addressed to. */
const DELETE_API_PATH = `/api/animals/${String(ANIMAL_ID)}`;

/**
 * The roster the app lands on once the removal succeeds — the same four minus Anaya. This spec
 * never views the roster BEFORE the removal, so it is served from the start; the roster's contents
 * are epic 1 AC-3's subject, not this story's, and are used here only as the settle anchor that
 * proves the landing screen finished rendering before the final theme assertion is taken.
 */
const ROSTER_AFTER_DELETE = ROSTER.filter((animal) => animal.Id !== ANIMAL_ID);

/**
 * The backend's own reply to a successful removal, and to a refused one.
 *
 * Both are read back out of the fixtures below rather than re-typed as literals, so this spec
 * cannot end up asserting wording the mock never sent — which is the whole point of AC-5's
 * "shows its confirmation / failure notification": the app must render the backend's words, not
 * invent its own.
 */
const DELETE_RESPONSE = createWriteSuccess({
  Id: ANIMAL_ID,
  Messages: ['Animal successfully deleted'],
});
const DELETE_CONFIRMATION = DELETE_RESPONSE.Messages[0];

/**
 * A technical failure (`MessageType: 'Error'`), served at the default HTTP **200** per Decision 3.
 * `Messages[0]` is raw database text, which the app keeps as labelled secondary detail below its own
 * readable wording (epic 1 R24 / Critical Rule 3) — so the notification must contain both the
 * animal's name and this text.
 */
const REFUSAL_RESPONSE = createWriteError();
const REFUSAL_BACKEND_TEXT = REFUSAL_RESPONSE.Messages[0];

/** HTTP methods that change data. A spec of THIS story must let none of them escape. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Next.js's own dev/runtime endpoints, which are not the app's API surface. */
const NEXT_INTERNAL_PATH = /^\/(?:_next|__next)/;

/**
 * How long the first notification is given to clear itself before the second removal is driven.
 *
 * Generous headroom over the 5s auto-dismiss epic 1's toast infrastructure already has. Waiting it
 * out is deliberately passive: clicking the dismiss control instead would race that timer and could
 * detach mid-click. This is a precondition for the second half of the test, not an assertion about
 * auto-dismiss (which is epic 1's behaviour and unchanged by this re-skin).
 */
const NOTIFICATION_CLEAR_TIMEOUT = 15_000;

/**
 * The shared announcement channel every write outcome in this app is reported through (epic 1
 * NFR-5 — no second notification system). `role="region"` named "Notifications", and it is absent
 * from the DOM entirely while there is nothing to announce.
 */
function notificationChannel(page: Page): Locator {
  return page.getByRole('region', { name: /notification/i });
}

/**
 * A failure notification: the ASSERTIVE half of the channel (`role="alert"`, `aria-live="assertive"`
 * — epic 1's contract, re-pinned by this story's AC-3 in jsdom). Scoped to the channel, so an
 * unrelated `alert` elsewhere on the page (the shared `FailureState`, for one) can never satisfy it.
 */
function failureNotification(page: Page): Locator {
  return notificationChannel(page).getByRole('alert');
}

/**
 * A confirmation notification: the POLITE half of the channel (`role="status"`). Scoped to the
 * channel for the same reason — the confirmation dialog itself renders a `role="status"` while the
 * removal is in flight, and that is not a notification.
 */
function confirmationNotification(page: Page): Locator {
  return notificationChannel(page).getByRole('status');
}

/** The page's own Remove control — a button, scoped to the shell's single `main` landmark. */
function removeAction(page: Page): Locator {
  return page.getByRole('main').getByRole('button', { name: /^remove\b/i });
}

/**
 * The confirmation dialog. A union of the two roles that mean "modal dialog", because Shadcn's
 * `alert-dialog` renders `role="alertdialog"` while a plain `dialog` renders `role="dialog"` and
 * Playwright matches roles exactly. Not a fallback: one locator, and exactly one element matches.
 */
function confirmationDialog(page: Page): Locator {
  return page.getByRole('alertdialog').or(page.getByRole('dialog'));
}

/** The dialog's confirm control, scoped to the dialog so the trigger behind it cannot satisfy it. */
function confirmRemoveButton(page: Page): Locator {
  return confirmationDialog(page).getByRole('button', {
    name: /\b(remove|delete)\b/i,
  });
}

/**
 * Drive one removal all the way to the confirm click: open the confirmation, then commit.
 *
 * Epic 1 story 9's spec owns what the dialog SAYS; here it is only the route to the notification,
 * so nothing about its wording is re-asserted.
 */
async function removeThisAnimal(page: Page): Promise<void> {
  await removeAction(page).click();
  await expect(confirmationDialog(page)).toBeVisible();
  await confirmRemoveButton(page).click();
}

/**
 * The light theme is in force: `<html>` carries no `dark` class (architecture.md Decision 4 — light
 * is the absence of that class, and there is no `light` class).
 *
 * The one appearance assertion this spec makes, and it reads a class name rather than any colour.
 */
async function expectLightTheme(page: Page): Promise<void> {
  await expect(page.locator('html')).not.toHaveClass(THEME_CLASS_PATTERN);
}

/**
 * Nothing is stored under the theme key, which is how "follow the OS" is represented. Asserted
 * rather than assumed: a stored `dark` from anywhere would override the emulated light OS and this
 * whole test would prove something about dark instead.
 */
async function expectNoStoredThemePreference(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (key) => window.localStorage.getItem(key),
          THEME_STORAGE_KEY,
        ),
      {
        message: `nothing stored under localStorage["${THEME_STORAGE_KEY}"], so the OS setting decides the theme`,
      },
    )
    .toBeNull();
}

/**
 * Watch for any mutating request this spec did not mock, and return the live list of them so the
 * test can assert it stayed empty.
 *
 * Mirrors epic 1 story 9's watcher and is kept local for the same reason it was there — the allowed
 * path differs per story. It closes the one hole `abortUnmatchedApiRequests()` cannot: that net
 * covers `/api/**`, but a Server Action posts to the PAGE url, so a removal implemented that way
 * would sail past every interceptor, reach Linx from the server tier, and really delete the row.
 * Detection is not prevention — but it names the exact failure instead of leaving a
 * mysteriously-green-yet-destructive spec.
 */
function watchForUnmockedWrites(page: Page, mockedWritePath: string): string[] {
  const escapes: string[] = [];

  page.on('request', (request) => {
    if (!MUTATING_METHODS.has(request.method())) {
      return;
    }

    const { pathname } = new URL(request.url());

    if (NEXT_INTERNAL_PATH.test(pathname) || pathname === mockedWritePath) {
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

test.describe('Epic theme-switching, Story 3: Notifications follow the active theme', () => {
  // The OS asks for light for every test in this file. Combined with nothing being stored, that is
  // what resolves the app to the light theme (Decision 4) — no manual OS switching, and no
  // in-app pick needed, which keeps this story's spec independent of story 2's control.
  test.use({ colorScheme: 'light' });

  // AC-5
  test('in light, a refused removal announces its failure and a successful one announces the backend’s confirmation', async ({
    page,
  }) => {
    // Installed FIRST so it is consulted LAST: anything the interceptors below miss is aborted
    // rather than reaching the real backend and deleting a real record.
    await abortUnmatchedApiRequests(page);
    const unmockedWrites = watchForUnmockedWrites(page, DELETE_API_PATH);
    await mockAnimals(page, ROSTER_AFTER_DELETE);
    // Kept hermetic in case the shell or the landing roster reads habitats, so the safety net does
    // not abort a read this story has no opinion about.
    await mockHabitats(page);
    await mockAnimal(page, ANIMAL);
    // Registered AFTER `mockAnimal` so the DELETE handler is consulted first on the shared detail
    // path; it passes the page's own GET on with `route.fallback()`. This one REFUSES the removal.
    const refusedDeletes = await mockAnimalDelete(page, REFUSAL_RESPONSE);

    await page.goto(DETAIL_PATH);
    await expect(
      page.getByRole('heading', { name: ANIMAL_NAME, level: 1 }),
    ).toBeVisible();

    // The precondition, both halves of it. Without these the test could run in dark and every
    // assertion below would still pass, proving nothing about the light theme.
    await expectNoStoredThemePreference(page);
    await expectLightTheme(page);

    // ── (1) The refused removal ──
    await removeThisAnimal(page);

    // It appears, in the shared channel, carrying the app's own readable wording about THIS animal
    // (the confirmation has closed by the time it is read, so a generic message would not do)...
    const failure = failureNotification(page);
    await expect(failure).toBeVisible();
    await expect(failure).toContainText(ANIMAL_NAME);
    // ...and the BACKEND'S own reported text, read straight back out of the mocked envelope rather
    // than swallowed (epic 1 R24 / Critical Rule 3).
    await expect(failure).toContainText(REFUSAL_BACKEND_TEXT);
    // It is in the ASSERTIVE channel and nothing was announced politely: a failure reported as
    // `role="status"` would fail here, which is the AC-3 contract this re-skin must not disturb.
    await expect(confirmationNotification(page)).toHaveCount(0);
    // ...and it was rendered while the light theme was in force — the point of the story.
    await expectLightTheme(page);

    // A refusal moves nobody: the reader stays on the record, which is also what makes the second
    // removal below possible from the same document.
    await expect(page).toHaveURL(DETAIL_PATH);
    expect(refusedDeletes.map((del) => del.method)).toEqual(['DELETE']);

    // Let the channel empty itself before the second removal, so the confirmation assertions below
    // cannot be satisfied by the notification that is already on screen.
    await expect(notificationChannel(page)).toHaveCount(0, {
      timeout: NOTIFICATION_CLEAR_TIMEOUT,
    });

    // ── (2) The successful removal ──
    // Registered LAST, so this handler answers the next DELETE on the shared detail path.
    const successfulDeletes = await mockAnimalDelete(page, DELETE_RESPONSE);

    await removeThisAnimal(page);

    // The BACKEND'S own confirmation wording, read back out of the mocked `Messages[0]`, carried by
    // the same channel as a POLITE announcement. Asserted before the navigation, because this
    // notification auto-dismisses.
    const confirmation = confirmationNotification(page);
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(DELETE_CONFIRMATION);
    // A success reported as `role="alert"` would fail here — the other half of AC-3's contract.
    await expect(failureNotification(page)).toHaveCount(0);
    await expectLightTheme(page);

    // The reader lands on the roster, and the theme survives the transition: a notification shown
    // in light over a screen that went dark would be a different bug, and this rules it out.
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('table')).toBeVisible();
    await expectLightTheme(page);

    // What actually went on the wire: exactly one DELETE per attempt, addressed to the app's own
    // route handler with the record id in the path. Two attempts, two requests — a double-submit
    // would show up here, and against this backend a second delete is likely reported as another
    // success (epic 1 BR12).
    expect(successfulDeletes.map((del) => del.method)).toEqual(['DELETE']);
    expect(successfulDeletes.map((del) => new URL(del.url).pathname)).toEqual([
      DELETE_API_PATH,
    ]);
    expect(refusedDeletes.map((del) => new URL(del.url).pathname)).toEqual([
      DELETE_API_PATH,
    ]);

    // Hermeticity, asserted rather than assumed: the ONLY mutating requests the browser made were
    // the two mocked `DELETE`s. Anything else would mean a delete reached the real database.
    expect(unmockedWrites).toEqual([]);
  });
});
