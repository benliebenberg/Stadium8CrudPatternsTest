/**
 * Shared Playwright API interceptors for this project.
 *
 * Created by story 2's spec, the second spec in the epic, per
 * `generated-docs/architecture.md` § Playwright spec conventions #7 ("shared interceptors
 * live in `web/e2e/fixtures/api-mocks.ts` once a second spec needs them"). The remaining
 * stories' specs import from here rather than re-declaring their own `page.route()` calls.
 *
 * Two rules this module exists to enforce, both from architecture.md Decision 1:
 *
 * 1. **Intercept the app's OWN route handlers** — `/api/animals`, `/api/habitats` — never
 *    the Linx base URL (`http://localhost:10002/crud-patterns/**`). The Linx call is made
 *    from the Next.js server tier, which `page.route()` cannot see; routing the Linx URL
 *    would silently match nothing and let a spec hit the REAL backend and, for the write
 *    stories, mutate the real database.
 * 2. **Bodies come from the shared entity factories**, imported by RELATIVE path — never
 *    the `@/` alias, which Playwright's runtime does not resolve, and never hand-written
 *    inline. That shared source is what stops the Vitest and Playwright layers drifting
 *    onto different response bodies.
 *
 * There is deliberately no auth interceptor: this project has no login, no session, and no
 * userinfo endpoint (project.md §Authentication, brief BR15).
 */

import type { Page } from '@playwright/test';

import type { DefaultResponse } from '../../src/types/api';
import type { AnimalRead, HabitatRead } from '../../src/types/api-generated';
import { createAnimal, createAnimalList } from '../../src/mocks/data/animal';
import { createHabitatList } from '../../src/mocks/data/habitat';
import { createWriteError } from '../../src/mocks/data/write-result';

/**
 * Matches the browser's request for the animal LIST — the app's own `/api/animals` route
 * handler — on any origin and with or without a query string.
 *
 * A regex rather than the glob `**\/api\/animals**` this module started with, because that
 * glob's trailing `**` also swallowed `/api/animals/4`: story 4 needs the list AND the
 * single-record interceptor active at the same time (roster → detail → back to roster), and
 * with an overlapping glob the winner depended on which helper happened to be called last
 * (Playwright uses the most recently registered matching handler). These two patterns are
 * disjoint, so registration order no longer changes what a spec gets.
 */
const ANIMALS_LIST_ROUTE = /\/api\/animals(?:\?[^#]*)?$/;

/**
 * Matches the browser's request for ONE animal — `/api/animals/{Id}` — on any origin.
 *
 * Deliberately excludes the bare list path (a non-empty, slash-free id segment is
 * required), so it can never answer a roster fetch.
 */
const ANIMAL_DETAIL_ROUTE = /\/api\/animals\/[^/?#]+(?:\?[^#]*)?$/;

/** The app's own habitats route handler. */
const HABITATS_ROUTE = '**/api/habitats**';

/**
 * EVERY request the browser makes to the app's own API surface, whatever the path or method.
 * Used only by {@link abortUnmatchedApiRequests} as a last-resort safety net.
 */
const ANY_APP_API_ROUTE = '**/api/**';

const JSON_CONTENT_TYPE = 'application/json';

/**
 * Serve the animal roster successfully: HTTP 200 with the `{ Animals: [...] }` envelope.
 *
 * @param animals Omit for the canonical four-animal set; pass `[]` for the
 *   "no animals yet" state, or a bespoke array built from `createAnimal(...)`.
 *
 * @example await mockAnimals(page);              // canonical roster
 * @example await mockAnimals(page, []);          // empty backend
 */
export async function mockAnimals(
  page: Page,
  animals?: AnimalRead[],
): Promise<void> {
  await page.route(ANIMALS_LIST_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: JSON_CONTENT_TYPE,
      body: JSON.stringify(createAnimalList(animals)),
    }),
  );
}

/**
 * Fail the animal roster request, so the screen must render its failed-to-load state.
 *
 * Answers HTTP 500 with a `DefaultResponse` envelope, which is how this backend reports
 * every failure (project.md NFR-base-6 — never a conventional 4xx). `createWriteError()`
 * is the shared source for that envelope; its name reflects where the shape was first
 * needed (writes), not a restriction on where it can occur.
 *
 * Register this AFTER a success interceptor to override it — Playwright uses the
 * most-recently-registered matching handler — then reload to re-drive the fetch.
 */
export async function mockAnimalsFailure(page: Page): Promise<void> {
  await page.route(ANIMALS_LIST_ROUTE, (route) =>
    route.fulfill({
      status: 500,
      contentType: JSON_CONTENT_TYPE,
      body: JSON.stringify(createWriteError()),
    }),
  );
}

/**
 * Serve ONE animal successfully from `/api/animals/{Id}`: HTTP 200 with the `AnimalRead`
 * **unwrapped**.
 *
 * The shape is the point of this helper. `GET /v1/animals/{Id}` returns the record
 * directly — NOT the `{ Animals: [...] }` envelope the list uses, and NOT the
 * `DefaultResponse` envelope every write uses (brief BR8, R12). A mock that wrapped it
 * would let a detail view that reads the wrong shape pass here and break against the real
 * backend.
 *
 * The same record is served for ANY id, so navigate to the id you passed in
 * (`/animals/${animal.Id}`) — this helper does not match ids for you.
 *
 * @param animal Omit for the canonical default animal (Anaya), or pass one built from
 *   `createAnimal(...)` / picked out of `createAnimals()`.
 */
export async function mockAnimal(
  page: Page,
  animal: AnimalRead = createAnimal(),
): Promise<void> {
  await page.route(ANIMAL_DETAIL_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: JSON_CONTENT_TYPE,
      body: JSON.stringify(animal),
    }),
  );
}

/**
 * Answer `/api/animals/{Id}` with HTTP 200 and an empty object — one of the two plausible
 * things this backend does for an id that does not exist.
 *
 * The single-animal read has no not-found path in the Linx solution: it is a "first row"
 * read with no `TryCatch` and no `If` branch, so an unknown `Id` yields no clean 404
 * (brief BR9/R14). This models the "read found nothing and returned nothing" outcome; the
 * UI must show its not-found state rather than a record of blanks.
 *
 * **Unverified against the live backend** — see `state.json` `unverifiedAssumptions`, and
 * confirm while building story 4. `mockAnimalFailure()` models the other candidate.
 *
 * Register AFTER `mockAnimal()` to override it (Playwright uses the most recently
 * registered matching handler), then navigate or reload to re-drive the fetch.
 */
export async function mockAnimalEmptyResponse(page: Page): Promise<void> {
  await page.route(ANIMAL_DETAIL_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: JSON_CONTENT_TYPE,
      body: '{}',
    }),
  );
}

/**
 * Answer `/api/animals/{Id}` with HTTP 500 and a `DefaultResponse` envelope — the other
 * plausible answer for an unknown id (brief BR9/R14, BR11: this backend reports every
 * failure as a 500 with an envelope, never a conventional 4xx).
 *
 * Note what this body is NOT: it is not an `AnimalRead`. Because a successful single read
 * is an unwrapped `AnimalRead` (BR8), an envelope arriving on this endpoint means the
 * record could not be read — which is why story 4 treats it as not-found rather than as the
 * retryable failed-to-load state.
 *
 * Register AFTER `mockAnimal()` / `mockAnimalEmptyResponse()` to override them.
 */
export async function mockAnimalFailure(page: Page): Promise<void> {
  await page.route(ANIMAL_DETAIL_ROUTE, (route) =>
    route.fulfill({
      status: 500,
      contentType: JSON_CONTENT_TYPE,
      body: JSON.stringify(createWriteError()),
    }),
  );
}

/**
 * Serve the habitat list successfully: HTTP 200 with the `{ Habitats: [...] }` envelope.
 *
 * @param habitats Omit for the canonical three habitats; pass `[]` for the empty state.
 */
export async function mockHabitats(
  page: Page,
  habitats?: HabitatRead[],
): Promise<void> {
  await page.route(HABITATS_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: JSON_CONTENT_TYPE,
      body: JSON.stringify(createHabitatList(habitats)),
    }),
  );
}

/**
 * Fail — loudly — any request to the app's own `/api/**` surface that no other interceptor
 * in the spec answered.
 *
 * **Install this FIRST in every spec that can issue a write.** Playwright matches handlers
 * in REVERSE registration order, so registering this before the specific interceptors makes
 * it the last resort: anything they cover is still answered by them, and anything they miss
 * is aborted instead of travelling on to the Next.js route handler and from there to the
 * REAL Linx backend.
 *
 * Why this exists at all: `dataSource` is `existing-api` and there is no MSW runtime layer,
 * so a missed interception on a write spec does not merely fail a test — it changes a row in
 * the user's real database (architecture.md Decision 1). An aborted request produces a
 * visible failure in the screen under test; a real one produces a silent green test and a
 * mutated database. The first is a bug report, the second is data loss.
 */
export async function abortUnmatchedApiRequests(page: Page): Promise<void> {
  await page.route(ANY_APP_API_ROUTE, (route) => route.abort('failed'));
}

/** One write request the browser actually sent, captured for assertion. */
export interface CapturedWrite {
  /** `PUT`, `POST`, `DELETE` — the verb the app chose. */
  readonly method: string;
  /** The full URL, so a spec can pin the record id in the path. */
  readonly url: string;
  /** Request headers, keys lower-cased by Playwright. */
  readonly headers: Record<string, string>;
  /** The parsed JSON request body. */
  readonly body: Record<string, unknown>;
}

/**
 * Parse a captured request body into a plain object, throwing rather than returning a
 * fallback: a write whose body is missing or is not a JSON object is a real defect, and it
 * should fail the spec at the point of capture instead of turning into an assertion against
 * `{}` further down.
 */
function parseWriteBody(rawBody: string | null): Record<string, unknown> {
  if (rawBody === null || rawBody.trim() === '') {
    throw new Error('The intercepted write carried no request body');
  }

  const parsed: unknown = JSON.parse(rawBody);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `The intercepted write body was not a JSON object: ${rawBody}`,
    );
  }

  return parsed as Record<string, unknown>;
}

/**
 * Parse a captured request body that is ALLOWED to be absent, as a `DELETE`'s is.
 *
 * `DELETE /v1/animals/{Id}` takes the record id in the path and the change-name in a header;
 * it carries no payload at all (see `generated-docs/specs/api-spec.yaml`, `AnimalDelete`), so
 * a missing body is correct there rather than the defect {@link parseWriteBody} rightly throws
 * on for a `POST`/`PUT`. An absent body is normalised to `{}` — which keeps
 * {@link CapturedWrite.body} a plain object for every verb, so the "no `LastChangedUser` in
 * the body" assertion reads identically whether the app sent nothing or sent `{}`.
 *
 * Anything that IS present still goes through `parseWriteBody`, so a `DELETE` that shipped a
 * non-JSON or non-object payload fails loudly at the point of capture.
 */
function parseOptionalWriteBody(
  rawBody: string | null,
): Record<string, unknown> {
  if (rawBody === null || rawBody.trim() === '') {
    return {};
  }

  return parseWriteBody(rawBody);
}

/**
 * Intercept `PUT /api/animals/{Id}` — the app's own route handler for an animal update —
 * answering with the given `DefaultResponse` envelope, and RECORD what the browser sent.
 *
 * Two things make this safe to combine with the read interceptors:
 *
 * 1. It answers **only** `PUT`. Any other method on the same path is passed on with
 *    `route.fallback()`, so a GET of `/api/animals/{Id}` still reaches `mockAnimal()` and can
 *    never be answered with a write envelope (which is exactly the response-shape confusion
 *    brief BR8 warns about).
 * 2. Because Playwright matches handlers in reverse registration order, register this
 *    **after** `mockAnimal()`. Both patterns are `ANIMAL_DETAIL_ROUTE`, and this one has to
 *    be consulted first for the fallback chain to work at all.
 *
 * @param response The envelope the backend answers with. Pass
 *   `createWriteSuccess({ Messages: ['Animal updated successfully'] })` for the success path
 *   (R21), `createDuplicateWarning()` or `createWriteError()` with `status` 500 for story 8's
 *   rejection paths.
 * @param status The HTTP status. Defaults to `200`; pass `500` for `Warning`/`Error`
 *   envelopes, because this backend reports BOTH business rejections and technical failures
 *   as HTTP 500 (architecture.md Decision 2 — `MessageType` is the only real discriminator).
 * @returns A live array that every intercepted `PUT` is appended to, in order — so a spec can
 *   assert what actually went on the wire (the five writable fields, and no
 *   `LastChangedUser`).
 */
export async function mockAnimalUpdate(
  page: Page,
  response: DefaultResponse,
  status = 200,
): Promise<CapturedWrite[]> {
  const captured: CapturedWrite[] = [];

  await page.route(ANIMAL_DETAIL_ROUTE, async (route) => {
    const request = route.request();

    if (request.method() !== 'PUT') {
      await route.fallback();
      return;
    }

    captured.push({
      method: request.method(),
      url: request.url(),
      headers: await request.allHeaders(),
      body: parseWriteBody(request.postData()),
    });

    await route.fulfill({
      status,
      contentType: JSON_CONTENT_TYPE,
      body: JSON.stringify(response),
    });
  });

  return captured;
}

/**
 * Intercept `DELETE /api/animals/{Id}` — the app's own route handler for removing an animal —
 * answering with the given `DefaultResponse` envelope, and RECORD what the browser sent.
 *
 * **This is the interceptor with the least margin for error in the whole suite.** A missed
 * `POST` invents a row someone can delete; a missed `DELETE` destroys a row nobody can get
 * back. `dataSource` is `existing-api` with no MSW runtime layer (architecture.md Decision 1),
 * so anything not intercepted here travels through the app's route handler to Linx and removes
 * a real animal from the real database. Install
 * {@link abortUnmatchedApiRequests} FIRST in any spec that calls this, so a request this
 * handler does not match is aborted rather than forwarded.
 *
 * The same two safety properties as {@link mockAnimalUpdate}, on the same detail path:
 *
 * 1. It answers **only** `DELETE`. Every other method is passed on with `route.fallback()`, so
 *    the detail view's `GET` still reaches `mockAnimal()` and is never answered with a write
 *    envelope — which matters especially here, because story 4 treats an envelope arriving on
 *    the single-read endpoint as "animal not found" (brief BR8/BR9).
 * 2. Playwright matches handlers in reverse registration order, so register this **after**
 *    `mockAnimal()`: both use `ANIMAL_DETAIL_ROUTE`, and this one has to be consulted first for
 *    the fallback chain to work at all.
 *
 * @param response The envelope the backend answers with. Pass
 *   `createWriteSuccess({ Id, Messages: ['...'] })` for the success path (R22/R23) —
 *   `Messages[0]` is the wording the UI must show rather than inventing its own.
 * @param status The HTTP status. Defaults to `200` and should stay there: the app's own route
 *   handler normalises every write to HTTP 200 and returns the envelope verbatim, so the
 *   browser-side promise RESOLVES and the caller branches on `MessageType`
 *   (architecture.md Decision 3). A delete fixture served at 500 would test a contract this app
 *   does not have.
 * @returns A live array that every intercepted `DELETE` is appended to, in order — so a spec
 *   can assert what actually went on the wire: the record id in the path, and no
 *   `LastChangedUser` in any browser-set header or body (BR3/R5 — the server tier injects it).
 *   `DELETE` carries no payload, so `body` is `{}` unless the app wrongly sent one.
 */
export async function mockAnimalDelete(
  page: Page,
  response: DefaultResponse,
  status = 200,
): Promise<CapturedWrite[]> {
  const captured: CapturedWrite[] = [];

  await page.route(ANIMAL_DETAIL_ROUTE, async (route) => {
    const request = route.request();

    if (request.method() !== 'DELETE') {
      await route.fallback();
      return;
    }

    captured.push({
      method: request.method(),
      url: request.url(),
      headers: await request.allHeaders(),
      body: parseOptionalWriteBody(request.postData()),
    });

    await route.fulfill({
      status,
      contentType: JSON_CONTENT_TYPE,
      body: JSON.stringify(response),
    });
  });

  return captured;
}

/**
 * Intercept `POST /api/animals` — the app's own route handler for creating an animal —
 * answering with the given `DefaultResponse` envelope, and RECORD what the browser sent.
 *
 * The same two safety properties as {@link mockAnimalUpdate}, on the LIST path instead of the
 * detail path:
 *
 * 1. It answers **only** `POST`. Any other method on `/api/animals` is passed on with
 *    `route.fallback()`, so the roster's `GET` still reaches `mockAnimals()` and can never be
 *    answered with a write envelope.
 * 2. Playwright matches handlers in reverse registration order, so register this **after**
 *    `mockAnimals()` — both use `ANIMALS_LIST_ROUTE`, and this one must be consulted first for
 *    the fallback chain to work.
 *
 * @param response The envelope the backend answers with — `createWriteSuccess()` for the
 *   success path (R17: `MessageType: "Success"`, `Messages: ["Animal successfully created"]`,
 *   and the new `Id`), `createDuplicateWarning()` / `createWriteError()` with `status` 500 for
 *   story 8's rejection paths.
 * @param status The HTTP status. Defaults to `200`; pass `500` for `Warning`/`Error`
 *   envelopes, since this backend reports both business rejections and technical failures as
 *   HTTP 500 (architecture.md Decision 2 — `MessageType` is the only real discriminator).
 * @param rosterAfterCreate When supplied, every roster `GET` that happens **after** a create
 *   has been answered is served this list instead of falling through to `mockAnimals()`. That
 *   models the only thing the backend really does — the new animal is in the list from then
 *   on — and is what lets a spec prove R23's "visible in the roster without a manual reload"
 *   as a genuine change (4 rows before, 5 after) rather than by pre-seeding the answer.
 * @returns A live array that every intercepted `POST` is appended to, in order — so a spec can
 *   assert what actually went on the wire (exactly the five writable fields, and no
 *   `LastChangedUser`: that is a server-injected header, story 1 / BR3).
 */
export async function mockAnimalCreate(
  page: Page,
  response: DefaultResponse,
  status = 200,
  rosterAfterCreate?: AnimalRead[],
): Promise<CapturedWrite[]> {
  const captured: CapturedWrite[] = [];

  await page.route(ANIMALS_LIST_ROUTE, async (route) => {
    const request = route.request();

    if (request.method() !== 'POST') {
      if (captured.length > 0 && rosterAfterCreate !== undefined) {
        await route.fulfill({
          status: 200,
          contentType: JSON_CONTENT_TYPE,
          body: JSON.stringify(createAnimalList(rosterAfterCreate)),
        });
        return;
      }

      await route.fallback();
      return;
    }

    captured.push({
      method: request.method(),
      url: request.url(),
      headers: await request.allHeaders(),
      body: parseWriteBody(request.postData()),
    });

    await route.fulfill({
      status,
      contentType: JSON_CONTENT_TYPE,
      body: JSON.stringify(response),
    });
  });

  return captured;
}
