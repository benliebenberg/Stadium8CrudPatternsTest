/**
 * Story Metadata:
 * - Route: /animals/[id]
 * - Target File: web/src/app/animals/[id]/page.tsx
 * - Page Action: modify_existing
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never uses
 *   the real `API_KEY` (testing-policy.md § "Playwright runs against mocks, never live").
 * - **This is the highest-stakes write spec in the epic.** `dataSource` is `existing-api` with
 *   no MSW runtime layer, so a single missed interception does not merely fail a test — the
 *   `DELETE` travels through the app's own route handler to Linx and REMOVES A REAL ANIMAL FROM
 *   THE USER'S REAL DATABASE, with no undo (the backend's delete event is a bare
 *   `DeleteAnimal → Return`, brief BR12). A false-green delete spec is data loss, not a bad
 *   test. Four defences, all mandatory:
 *   1. `abortUnmatchedApiRequests(page)` is installed FIRST in every test here. Playwright
 *      matches handlers in reverse registration order, so it becomes the last resort: any
 *      `/api/**` request the specific interceptors miss is aborted loudly instead of reaching
 *      the backend.
 *   2. `mockAnimalDelete()` — added to `./fixtures/api-mocks` by this story — intercepts
 *      `DELETE /api/animals/{Id}` on the app's OWN detail route, matched on
 *      `method === 'DELETE'`, and passes every other method on with `route.fallback()`, so the
 *      detail view's `GET` still reaches `mockAnimal()` and can never be answered with a write
 *      envelope (which story 4 reads as "animal not found" — brief BR8/BR9).
 *   3. The Linx base URL (`http://localhost:10002/crud-patterns/**`) is NEVER routed. That call
 *      is made from the Next.js server tier, which `page.route()` cannot see, so routing it
 *      would match nothing and produce a spec that silently deletes production data
 *      (architecture.md Decision 1).
 *   4. `watchForUnmockedWrites()` below fails the test if ANY mutating request went anywhere
 *      other than the one mocked `DELETE` path. This closes the hole defence 1 cannot: a
 *      Next.js Server Action posts to the PAGE url (`/animals/4`), not `/api/**`, so a delete
 *      implemented that way would sail past even the `**\/api\/**` safety net, reach Linx
 *      server-side, and really remove the row.
 * - Interception is via `page.route()` on the app's own route handlers, through the shared
 *   interceptors in `./fixtures/api-mocks` (architecture.md § Playwright spec conventions #7),
 *   using the disjoint list/detail regexes there rather than a `**\/api\/animals**` glob.
 * - Implementation pattern this REQUIRES (architecture.md Decision 1): both the single-animal
 *   read that renders the page AND the `DELETE` that removes it must happen BROWSER-side — a
 *   `"use client"` component going through the API client layer. **Do not implement the removal
 *   as a Server Action**, and do not put the Linx call in a server component: `page.route()`
 *   cannot intercept either, so both would escape every defence above.
 * - The write RESOLVES rather than rejecting, and is served with HTTP **200**
 *   (architecture.md Decision 3): the app's route handler normalises every write to 200 and
 *   returns the `DefaultResponse` envelope verbatim, and the caller branches on `MessageType`.
 *   A delete fixture served at 500 would test a contract this app does not have.
 * - Response bodies come from the shared factories (`../src/mocks/data/animal`,
 *   `../src/mocks/data/write-result`) via the fixtures module, imported by RELATIVE path —
 *   never the `@/` alias, which Playwright's runtime does not resolve — so this layer cannot
 *   drift from the Vitest layer.
 * - No auth chain, no cookie clearing, no credential fixtures: this project has no login, no
 *   session and no userinfo endpoint (project.md §Authentication, brief BR15).
 *
 * E2E spec for Epic zoo-animal-manager, Story 9: Remove an animal with confirmation.
 *
 * Covers the two criteria tagged `playwright` — both need a real browser: a portalled,
 * focus-managed dialog and a cross-screen round trip.
 * - AC-1 — the Remove action opens a confirmation that NAMES THE ANIMAL and states plainly that
 *   the removal cannot be undone, in a real dialog (so it is announced and focus-trapped rather
 *   than being a bare `div`).
 * - AC-3 — confirming removes the animal, shows the BACKEND'S OWN confirmation wording, and
 *   lands the user on a roster that no longer lists it, with no manual reload. Also pins what
 *   went on the wire: one `DELETE` to `/api/animals/{Id}`, and no `LastChangedUser` in any
 *   browser-set header or body (BR3/R5 — the server tier injects it).
 *
 * AC-2 (cancelling removes nothing and leaves the user where they were) and AC-5 (a failed
 * removal shows a readable message and the animal is still listed) are jsdom-observable and live
 * in `web/src/__tests__/integration/epic-zoo-animal-manager-story-9-remove-animal.test.tsx` —
 * deliberately not duplicated here.
 *
 * AC-4 (the destructive treatment is never the brand's primary-action orange) is tagged
 * `coverage: none` and is verified by eye at the manual-test gate. There are deliberately NO
 * colour, class or hex assertions in this spec — an automated colour check here would pin the
 * styling token rather than the behaviour, and would go stale the moment the palette moves.
 *
 * No axe scan: the epic's accessibility baseline is a real-browser scan in story 2's spec
 * (architecture.md § Playwright spec conventions #8). The dialog's own accessibility is pinned
 * structurally below (a real `dialog`/`alertdialog` role, carrying an accessible name).
 *
 * ── Implementation contract this spec asserts (read before implementing) ──
 * 1. **The animal's own page carries exactly ONE Remove control inside `main`**, and it is a
 *    `button` whose accessible name starts with "Remove" — not a link (removal is not
 *    navigation, and must never be reachable by a bare `GET`).
 *    **Naming constraints from the sibling specs on this same screen:** story 4 pins `main` to
 *    exactly one LINK matching `/back|roster|animals/i`, and story 7 pins exactly one LINK named
 *    `/^edit\b/i`. "Remove" or "Remove animal" is safe; "Remove from animals" is not.
 * 2. **The confirmation is a real dialog** — `role="dialog"` or `role="alertdialog"`, which is
 *    what Shadcn's `alert-dialog` primitive gives you (the story's notes mandate the CLI
 *    primitive; do not hand-roll a modal). It must carry an ACCESSIBLE NAME mentioning
 *    remove/delete, i.e. a real `AlertDialogTitle` wired via `aria-labelledby` — a titleless
 *    dialog announces nothing.
 * 3. **The confirmation names the animal being removed** — the animal's own `Name` appears in
 *    the dialog — and **states irreversibility in words** (`cannot be undone` / `permanently` /
 *    `irreversible`). A generic "Are you sure?" fails here, deliberately: this is the only thing
 *    standing between a stray click and an unrecoverable delete.
 * 4. **The dialog offers two controls**: a confirm `button` whose accessible name contains
 *    "Remove" or "Delete", and a dismiss `button` named "Cancel". (What Cancel *does* is AC-2,
 *    asserted in jsdom.)
 * 5. **The removal is a browser-side `DELETE` to the app's own `/api/animals/{Id}`** with the
 *    record id in the path, no `LastChangedUser` header set by the browser, and no request body
 *    inventing one (the API spec's `AnimalDelete` takes id-in-path + change-name header only).
 * 6. **On `MessageType: "Success"` the app shows the backend's own `Messages[0]`** through the
 *    existing ToastContext infrastructure (NFR-5 — no second notification system): a success
 *    toast renders `role="status"` inside the container's `role="region"` named "Notifications".
 *    A success reported as `role="alert"` fails here, and correctly so.
 * 7. **The user lands on the roster (`/`) with the roster RE-FETCHED**, the removed animal gone
 *    and the rest intact — never a stale list that looks unchanged (R23) — and the dialog is
 *    dismissed.
 * 8. **Every transition is client-side.** The roster is opened once with a document load;
 *    reaching the animal's page, removing it and landing back on the roster must add NO further
 *    document loads. That is what "with no manual reload" means, and this spec counts the `load`
 *    events to prove it.
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { expect, test } from '@playwright/test';

import { createAnimals } from '../src/mocks/data/animal';
import { createWriteSuccess } from '../src/mocks/data/write-result';
import {
  abortUnmatchedApiRequests,
  mockAnimal,
  mockAnimalDelete,
  mockAnimals,
  mockHabitats,
} from './fixtures/api-mocks';

import type { AnimalRead } from '../src/types/api-generated';
import type { Locator, Page } from '@playwright/test';

/** The canonical four-animal roster the roster screen is served before the removal. */
const ROSTER = createAnimals();

/**
 * Pull one animal out of the canonical roster, so the row this spec clicks, the record the
 * detail endpoint returns and the name the dialog must show can never describe different
 * animals. Throws rather than returning `undefined`, so a fixture rename fails loudly here
 * instead of producing a spec that asserts on nothing.
 */
function animalNamed(name: string): AnimalRead {
  const match = ROSTER.find((animal) => animal.Name === name);

  if (!match) {
    throw new Error(`No animal named "${name}" in the canonical roster fixture`);
  }

  return match;
}

/**
 * The generated `AnimalRead` marks every field optional (the API spec declares no `required:`),
 * so the id is narrowed once here rather than threading `| undefined` through every path and
 * assertion below.
 */
function idOf(animal: AnimalRead): number {
  if (typeof animal.Id !== 'number') {
    throw new Error(`The animal fixture "${String(animal.Name)}" has no Id`);
  }

  return animal.Id;
}

/** Kaya — Bengal Tiger, 6, Rainforest, Carnivore. The animal being removed. */
const ANIMAL = animalNamed('Kaya');
const ANIMAL_ID = idOf(ANIMAL);
const ANIMAL_NAME = 'Kaya';

/**
 * Another animal in the roster, used twice: to prove the confirmation is about ONE specific
 * record rather than dumping the roster into the dialog, and to prove the post-removal roster
 * lost only the animal that was removed.
 */
const OTHER_ANIMAL_NAME = 'Anaya';

const DETAIL_PATH = `/animals/${String(ANIMAL_ID)}`;

/** The app's own route handler the `DELETE` must be addressed to. */
const DELETE_API_PATH = `/api/animals/${String(ANIMAL_ID)}`;

/**
 * The roster the backend serves once the animal is gone — the same four minus Kaya, still
 * sorted by `Name` (`GET /v1/animals` always returns the complete set sorted by `Name` and
 * accepts no sort/filter/paging parameters, brief BR6).
 *
 * Serving this only AFTER the removal is what makes AC-3's refresh an observable CHANGE (four
 * rows before, three after) rather than a pre-seeded answer that a screen showing a stale list
 * could also satisfy.
 */
const ROSTER_AFTER_DELETE = ROSTER.filter((animal) => animal.Id !== ANIMAL_ID);

/**
 * The backend's own reply to a successful removal (R22/R23), echoing the affected record's
 * `Id`. The asserted confirmation text is read back out of this envelope rather than written a
 * second time, so the spec cannot end up asserting wording the mock never sent — which is
 * exactly the "invented text" failure AC-3 forbids.
 *
 * The precise wording the live backend uses for a delete is unverified (its Linx event is a
 * bare `DeleteAnimal → Return`, brief BR12) — which is the point: the app must render whatever
 * `Messages[0]` says, so a change here should require no code change at all.
 */
const DELETE_RESPONSE = createWriteSuccess({
  Id: ANIMAL_ID,
  Messages: ['Animal successfully deleted'],
});
const DELETE_CONFIRMATION = DELETE_RESPONSE.Messages[0];

/**
 * Irreversibility, stated in words. The alternation covers the plain-English ways to say it —
 * it is NOT a "pass if anything matches" fallback: every branch means the same thing to a user,
 * and a dialog that says only "Are you sure?" matches none of them and fails.
 */
const IRREVERSIBLE_WORDING =
  /cannot be undone|can't be undone|cannot be reversed|permanently|permanent|irreversible/i;

/**
 * `LastChangedUser` is injected by the server tier from a single fixed configuration value
 * (BR3/R5). The browser must never send it — not as a header of its own, and not smuggled into
 * a request body. Playwright lower-cases captured header names.
 */
const LAST_CHANGED_USER_HEADER = 'lastchangeduser';
const LAST_CHANGED_USER_FIELD = 'LastChangedUser';

/** HTTP methods that change data. A spec of THIS story must let none of them escape. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Next.js's own dev/runtime endpoints, which are not the app's API surface. */
const NEXT_INTERNAL_PATH = /^\/(?:_next|__next)/;

/** The roster's data rows — the header row is excluded by its `columnheader` cells. */
function rosterRows(page: Page): Locator {
  return page
    .getByRole('table')
    .getByRole('row')
    .filter({ hasNot: page.getByRole('columnheader') });
}

/** One roster row, located by the animal's name rather than by index. */
function rosterRow(page: Page, animalName: string): Locator {
  return rosterRows(page).filter({ hasText: animalName });
}

/** The roster's link into one animal's own page — story 4's contract, reused. */
function animalRosterLink(page: Page, animalName: string): Locator {
  return rosterRow(page, animalName).getByRole('link', { name: animalName });
}

/**
 * The Remove action on the animal's page (contract #1). A BUTTON, scoped to the page's own
 * content: a link would make an unrecoverable delete reachable by navigation, and scoping to
 * `main` keeps the shared shell out of the match.
 */
function removeAction(page: Page): Locator {
  return page.getByRole('main').getByRole('button', { name: /^remove\b/i });
}

/**
 * The confirmation dialog (contract #2).
 *
 * A union of the two roles that mean "modal dialog", because Shadcn's `alert-dialog` renders
 * `role="alertdialog"` while a plain Shadcn `dialog` renders `role="dialog"`, and Playwright
 * matches roles exactly rather than treating one as a subtype of the other. This is a locator
 * union, not a conditional assertion: whichever of the two the primitive produces, exactly one
 * element must match — and a bare `div` matches neither, which is the point.
 */
function confirmationDialog(page: Page): Locator {
  return page.getByRole('alertdialog').or(page.getByRole('dialog'));
}

/**
 * The dialog's confirm control (contract #4), scoped to the dialog so the page's own Remove
 * trigger behind it can never satisfy this. Unanchored, so "Yes, remove Kaya" matches as well
 * as "Remove"; "Cancel" matches neither word.
 */
function confirmRemoveButton(page: Page): Locator {
  return confirmationDialog(page).getByRole('button', {
    name: /\b(remove|delete)\b/i,
  });
}

/** The dialog's dismiss control (contract #4). */
function cancelButton(page: Page): Locator {
  return confirmationDialog(page).getByRole('button', { name: /^cancel\b/i });
}

/**
 * The write confirmation, scoped to the shared toast channel the whole epic reports write
 * outcomes through (NFR-5; the epic baseline test pins that this infrastructure stays mounted).
 * A success toast is `role="status"` inside the container's `role="region"` named
 * "Notifications" — an error would be `role="alert"` and would not match.
 */
function confirmationToast(page: Page): Locator {
  return page.getByRole('region', { name: /notification/i }).getByRole('status');
}

/**
 * Watch for any mutating request that this spec did not mock, and return the live list of them
 * so a test can assert it stayed empty.
 *
 * This closes the one hole `abortUnmatchedApiRequests()` cannot: that net covers `/api/**`, but
 * a Next.js Server Action posts to the PAGE url (`/animals/4`), so a removal implemented that
 * way would sail past every interceptor, reach Linx from the server tier, and really delete the
 * row. Detection is not prevention — but it names the exact failure instead of leaving a
 * mysteriously-green-yet-destructive spec, and it also reports a mutating request that the
 * safety net had to abort because it went somewhere unexpected.
 *
 * Mirrors story 6's watcher (the create spec); kept local because the allowed path differs per
 * story.
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

test.describe('Epic zoo-animal-manager, Story 9: Remove an animal with confirmation', () => {
  // AC-1
  test('the Remove action opens a real confirmation dialog that names the animal and says the removal cannot be undone', async ({
    page,
  }) => {
    // Installed FIRST so it is consulted LAST: anything the interceptors below miss is aborted
    // rather than reaching the real backend and deleting a real record.
    await abortUnmatchedApiRequests(page);
    const unmockedWrites = watchForUnmockedWrites(page, DELETE_API_PATH);
    await mockAnimals(page, ROSTER);
    await mockAnimal(page, ANIMAL);
    // The roster carries a habitat filter (story 3), so this keeps a habitat fetch — if the
    // shell makes one — hermetic instead of letting the safety net abort it.
    await mockHabitats(page);
    // Registered AFTER `mockAnimal` so the DELETE handler is consulted first on the shared
    // detail path; it passes the page's own GET on with `route.fallback()`. Mocked even in this
    // test, which must NOT delete: if the implementation removes the animal on the first click,
    // that request is captured and asserted below rather than reaching the real database.
    const deletes = await mockAnimalDelete(page, DELETE_RESPONSE);

    await page.goto(DETAIL_PATH);
    await expect(
      page.getByRole('heading', { name: ANIMAL_NAME }),
    ).toBeVisible();

    // Exactly one Remove control, and it is a button (contract #1).
    await expect(removeAction(page)).toHaveCount(1);
    await removeAction(page).click();

    const dialog = confirmationDialog(page);
    await expect(dialog).toBeVisible();

    // A real dialog role AND a real title: `toHaveAccessibleName` resolves through
    // `aria-labelledby`, so a modal with no `AlertDialogTitle` — which announces nothing to a
    // screen reader — fails here.
    await expect(dialog).toHaveAccessibleName(/remove|delete/i);

    // It names THIS animal (contract #3) — "Are you sure?" is not a confirmation of anything.
    await expect(dialog).toContainText(ANIMAL_NAME);
    // ...and only this animal: a dialog that dumped the roster would also name 'Anaya', which
    // would mean the wording is generic rather than about the record being removed.
    await expect(dialog).not.toContainText(OTHER_ANIMAL_NAME);

    // ...and it states irreversibility in words, which is the whole reason this step exists.
    await expect(dialog).toContainText(IRREVERSIBLE_WORDING);

    // Two controls: confirm and dismiss (contract #4). What Cancel does is AC-2, in jsdom.
    await expect(confirmRemoveButton(page)).toHaveCount(1);
    await expect(cancelButton(page)).toHaveCount(1);

    // Opening a confirmation is not a removal: nothing was deleted by getting this far. This is
    // an assertion about the requests that actually left the browser, and the reason it matters
    // is that the alternative outcome is unrecoverable.
    expect(deletes).toEqual([]);
    expect(unmockedWrites).toEqual([]);
  });

  // AC-3
  test("confirming shows the backend's own confirmation wording and lands on a roster that no longer lists the animal, with no reload", async ({
    page,
  }) => {
    // A full document load pushes a `load` event; client-side navigation pushes none. Recorded
    // as paths so a failure says WHERE the unexpected load happened (contract #8).
    const documentLoads: string[] = [];
    page.on('load', () => documentLoads.push(new URL(page.url()).pathname));

    await abortUnmatchedApiRequests(page);
    const unmockedWrites = watchForUnmockedWrites(page, DELETE_API_PATH);
    await mockAnimals(page, ROSTER);
    await mockAnimal(page, ANIMAL);
    await mockHabitats(page);

    // Entered from the roster, so the "no longer lists it" assertion below is a change this
    // spec watched happen: four rows including Kaya, then three without her.
    await page.goto('/');
    await expect(rosterRows(page)).toHaveCount(ROSTER.length);
    await expect(rosterRow(page, ANIMAL_NAME)).toBeVisible();

    await animalRosterLink(page, ANIMAL_NAME).click();
    await expect(page).toHaveURL(DETAIL_PATH);
    await expect(
      page.getByRole('heading', { name: ANIMAL_NAME }),
    ).toBeVisible();

    // From here the backend serves the roster WITHOUT Kaya. Registered now — after the initial
    // roster load has landed and while the user is on the detail page — so it cannot race the
    // first fetch, and the refresh after the removal is answered by it. The list and detail
    // patterns are disjoint (architecture.md § Playwright spec conventions #4), so this cannot
    // disturb the handlers on the detail path.
    await mockAnimals(page, ROSTER_AFTER_DELETE);
    // Registered LAST, so the DELETE handler is consulted before the read handler on the shared
    // detail path; GETs are passed on with `route.fallback()`.
    const deletes = await mockAnimalDelete(page, DELETE_RESPONSE);

    await removeAction(page).click();
    await expect(confirmationDialog(page)).toBeVisible();
    await confirmRemoveButton(page).click();

    // (1) The BACKEND'S wording, read straight back out of the mocked `Messages[0]`, carried by
    // the existing toast infrastructure as a success (`role="status"`). Asserted first because a
    // success toast auto-dismisses after a few seconds.
    await expect(
      confirmationToast(page).filter({ hasText: DELETE_CONFIRMATION }),
    ).toBeVisible();

    // (2) The user lands on the roster — not left staring at the page of a record that no
    // longer exists — and the confirmation is gone rather than lingering over the new screen.
    await expect(page).toHaveURL('/');
    await expect(confirmationDialog(page)).toHaveCount(0);

    // (3) ...and that roster no longer lists the animal, while the rest of it survived. The
    // exact row count is what makes this meaningful: a refresh that rendered an empty roster,
    // or one that dropped the wrong record, fails.
    await expect(rosterRow(page, ANIMAL_NAME)).toHaveCount(0);
    await expect(rosterRows(page)).toHaveCount(ROSTER_AFTER_DELETE.length);
    await expect(rosterRow(page, OTHER_ANIMAL_NAME)).toBeVisible();

    // (4) It took no manual reload: one document load for the whole journey — the initial visit
    // to the roster. Reaching the animal's page, removing it and landing back on the refreshed
    // roster were all client-side (R23).
    expect(documentLoads).toEqual(['/']);

    // (5) What actually went on the wire. One entry pins "exactly one DELETE was sent" — a
    // double-submit would try to delete twice, and against this backend the second call is
    // likely reported as another success (brief BR12) — and pins the verb, so a removal
    // implemented as a POST to some `/delete` endpoint fails.
    expect(deletes.map((del) => del.method)).toEqual(['DELETE']);
    // Addressed to the app's OWN route handler, with the record id in the path.
    expect(deletes.map((del) => new URL(del.url).pathname)).toEqual([
      DELETE_API_PATH,
    ]);
    // `LastChangedUser` is server-injected (BR3/R5): the browser sends it neither as a header of
    // its own nor as a body field. `DELETE` carries no payload at all, so the body stays empty.
    for (const del of deletes) {
      expect(Object.keys(del.headers)).not.toContain(LAST_CHANGED_USER_HEADER);
      expect(Object.keys(del.body)).not.toContain(LAST_CHANGED_USER_FIELD);
    }

    // (6) Hermeticity, asserted rather than assumed: the ONLY mutating request the browser made
    // was the mocked `DELETE` to `/api/animals/{Id}`. Anything else would mean a delete reached
    // the real database (see the Mocking strategy note on Server Actions).
    expect(unmockedWrites).toEqual([]);
  });
});
