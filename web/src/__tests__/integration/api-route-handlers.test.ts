/**
 * Integration Test: this app's own `/api/*` route handlers
 *
 * The handlers are the seam between the browser and the Linx backend: the browser only ever
 * calls them, and they are the only code that reaches Linx (architecture.md § Decision 1).
 * That makes their HTTP surface — status and body — the observable behaviour every screen in
 * this project is built on.
 *
 * It is also the one contract in the epic that NOTHING else covers. The story test files mock
 * `@/lib/api/client`, so they never reach a handler; the Playwright specs intercept
 * `/api/animals` in the browser, so they replace the handlers wholesale. Both layers can be
 * green while the real proxy is broken, which is why this file exists.
 *
 * What it pins, from architecture.md § Decision 3:
 *
 * - **A write always answers HTTP 200 with the `DefaultResponse` envelope**, whatever status
 *   Linx used — so the browser-side promise resolves and the caller branches on
 *   `MessageType`. Linx returns 500 for a duplicate name AND for a database fault, so
 *   passing its status through would flatten a fixable rejection into a thrown error.
 * - **A read keeps ordinary HTTP semantics**, and passes the backend's body through
 *   untouched — including the unwrapped `AnimalRead` a single read returns (BR8).
 * - **Credentials are attached here, server-side**, and nothing a caller sends can supply or
 *   override the fixed change-name (R5/BR3).
 * - **A write's body is validated here**, and an invalid one never reaches the backend at all.
 *   The form's validation only covers requests the form made; this endpoint is reachable
 *   without it, and the backend stores whatever it is sent unchecked (R19).
 *
 * `fetch` is stubbed with real `Response` objects, so the handlers meet the same body and
 * status surface they will meet at runtime.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GET as getAnimal,
  PUT as updateAnimalRoute,
  DELETE as deleteAnimal,
} from '@/app/api/animals/[id]/route';
import {
  GET as getAnimals,
  POST as createAnimalRoute,
} from '@/app/api/animals/route';
import { createAnimal, createAnimalList } from '@/mocks/data/animal';
import {
  createDuplicateWarning,
  createWriteSuccess,
} from '@/mocks/data/write-result';
import type { DefaultResponse } from '@/types/api';

/** Obviously-fake credentials — a real key is never read or asserted on. */
const SERVER_ONLY_API_KEY = 'test-api-key-not-a-real-secret';
const CONFIGURED_CHANGE_NAME = 'Test Deployment Name';
const LINX_BASE_URL = 'http://localhost:10002/crud-patterns';

const fetchMock = vi.fn();

/** The route context Next hands a dynamic segment: params resolve asynchronously. */
function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function linxResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * A complete, correctly typed animal write body.
 *
 * `Age` and `HabitatId` are numbers, not the strings the form holds — by the time a body reaches
 * a route handler the client has already converted them (`animalWriteFromForm`).
 */
const VALID_ANIMAL_BODY = {
  Name: 'Tandi',
  Species: 'Black Rhinoceros',
  Age: 5,
  HabitatId: 2,
  Diet: 'Herbivore',
};

/** Send a create through the collection handler. */
function postAnimal(body: unknown): Promise<Response> {
  return createAnimalRoute(
    new Request('http://localhost/api/animals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

/** Send an edit through the single-animal handler. */
function putAnimal(id: string, body: unknown): Promise<Response> {
  return updateAnimalRoute(
    new Request(`http://localhost/api/animals/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    routeContext(id),
  );
}

/** The single request the handler forwarded to Linx. */
function forwardedRequest(): { url: string; headers: Headers; body: string } {
  const [url, init] = fetchMock.mock.calls[0] as [
    string,
    { headers: Record<string, string>; body?: string },
  ];

  return {
    url,
    headers: new Headers(init.headers),
    body: init.body ?? '',
  };
}

async function envelopeOf(response: Response): Promise<DefaultResponse> {
  return (await response.json()) as DefaultResponse;
}

describe("the app's own /api route handlers", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('API_KEY', SERVER_ONLY_API_KEY);
    vi.stubEnv('LAST_CHANGED_USER', CONFIGURED_CHANGE_NAME);
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', LINX_BASE_URL);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('reads', () => {
    it('serves the roster and attaches the shared key to the backend call itself', async () => {
      const roster = createAnimalList();
      fetchMock.mockResolvedValue(linxResponse(200, roster));

      const response = await getAnimals();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(roster);
      // The credential travels on the backend call, never to the browser.
      expect(forwardedRequest().headers.get('x-api-key')).toBe(
        SERVER_ONLY_API_KEY,
      );
    });

    it('serves one animal unwrapped, exactly as the backend sent it', async () => {
      // Not the `{ Animals: [...] }` envelope and not a `DefaultResponse` — a bare record
      // (BR8). A handler that re-wrapped it would break every detail screen.
      const animal = createAnimal({ Id: 7, Name: 'Thabo' });
      fetchMock.mockResolvedValue(linxResponse(200, animal));

      const response = await getAnimal(
        new Request('http://localhost/api/animals/7'),
        routeContext('7'),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(animal);
      expect(forwardedRequest().url).toBe(`${LINX_BASE_URL}/v1/animals/7`);
    });

    it('reports an unreachable backend as a readable failure, not an empty success', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      const response = await getAnimals();
      const envelope = await envelopeOf(response);

      expect(response.status).not.toBe(200);
      expect(envelope.MessageType).toBe('Error');
      expect(envelope.Messages[0]).toMatch(/reach|connect|unavailable/i);
    });
  });

  describe('writes', () => {
    it('answers a business rejection with HTTP 200 and the backend envelope, despite the backend using 500', async () => {
      // The duplicate-name path: recoverable, and the browser must be able to read it off a
      // resolved promise rather than out of a thrown error (Decision 3).
      const rejection = createDuplicateWarning();
      fetchMock.mockResolvedValue(linxResponse(500, rejection));

      // A complete body, so the request gets past this app's own validation and the backend's
      // answer is what is under test here.
      const response = await postAnimal({
        ...VALID_ANIMAL_BODY,
        Name: 'Anaya',
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(rejection);
    });

    it('injects the configured change-name and drops one a caller tried to send', async () => {
      fetchMock.mockResolvedValue(linxResponse(200, createWriteSuccess()));

      await createAnimalRoute(
        new Request('http://localhost/api/animals', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            LastChangedUser: 'Caller Supplied Name',
          },
          body: JSON.stringify({
            Name: 'Tandi',
            Species: 'Black Rhinoceros',
            Age: 5,
            HabitatId: 2,
            Diet: 'Herbivore',
            LastChangedUser: 'Caller Supplied Name',
          }),
        }),
      );

      const forwarded = forwardedRequest();
      expect(forwarded.headers.get('lastchangeduser')).toBe(
        CONFIGURED_CHANGE_NAME,
      );
      // Nor may it ride along in the body: the writable surface is five fields (R17).
      expect(forwarded.body).not.toContain('Caller Supplied Name');
    });

    it('falls back to the documented default change-name when none is configured', async () => {
      // The deployment default (project.md §`LastChangedUser` header, R5). Worth pinning
      // because an unconfigured server must still satisfy a header the backend requires —
      // the write would otherwise fail for a reason no screen could explain.
      vi.stubEnv('LAST_CHANGED_USER', '');
      fetchMock.mockResolvedValue(linxResponse(200, createWriteSuccess()));

      await deleteAnimal(
        new Request('http://localhost/api/animals/7', { method: 'DELETE' }),
        routeContext('7'),
      );

      expect(forwardedRequest().headers.get('lastchangeduser')).toBe(
        'Animal Manager',
      );
    });

    it('answers an unreachable backend with HTTP 200 and an Error envelope, so a refused delete stays readable', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      const response = await deleteAnimal(
        new Request('http://localhost/api/animals/7', { method: 'DELETE' }),
        routeContext('7'),
      );
      const envelope = await envelopeOf(response);

      expect(response.status).toBe(200);
      expect(envelope.MessageType).toBe('Error');
      expect(envelope.Messages[0]).toMatch(/reach|connect|unavailable/i);
    });
  });

  /**
   * Server-side validation of a write body (R19).
   *
   * The add/edit form validates what a person types, but this endpoint is reachable without the
   * form — curl, a stale tab, a future bug in client code — and the backend performs no
   * validation of its own: it inserts what it is sent straight into the database. So the check
   * that matters is that an invalid body is refused **and the backend is never called**, because
   * a row it accepts is permanent.
   */
  describe('write body validation', () => {
    it('forwards a valid body to the backend as the five writable fields', async () => {
      fetchMock.mockResolvedValue(linxResponse(200, createWriteSuccess()));

      const response = await postAnimal(VALID_ANIMAL_BODY);

      expect((await envelopeOf(response)).MessageType).toBe('Success');
      expect(JSON.parse(forwardedRequest().body)).toEqual(VALID_ANIMAL_BODY);
    });

    it('refuses a body with a field missing, without calling the backend', async () => {
      const response = await postAnimal({
        Name: VALID_ANIMAL_BODY.Name,
        Species: VALID_ANIMAL_BODY.Species,
        Age: VALID_ANIMAL_BODY.Age,
        HabitatId: VALID_ANIMAL_BODY.HabitatId,
      });
      const envelope = await envelopeOf(response);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(envelope.MessageType).toBe('Error');
      // The leading message is the readable one a write screen shows; the field detail follows
      // it as secondary detail rather than becoming the headline (R24).
      expect(envelope.Messages[0]).toMatch(/rejected|nothing was saved/i);
      expect(envelope.Messages.join(' ')).toContain('Diet');
    });

    it('refuses an age that is not a whole number, without calling the backend', async () => {
      const response = await postAnimal({ ...VALID_ANIMAL_BODY, Age: 2.5 });

      expect(fetchMock).not.toHaveBeenCalled();
      expect((await envelopeOf(response)).Messages.join(' ')).toContain('Age');
    });

    it('refuses a negative age, without calling the backend', async () => {
      const response = await postAnimal({ ...VALID_ANIMAL_BODY, Age: -1 });

      expect(fetchMock).not.toHaveBeenCalled();
      expect((await envelopeOf(response)).Messages.join(' ')).toContain('Age');
    });

    it('refuses a habitat id sent as text rather than a number, without calling the backend', async () => {
      // A string id would be stored verbatim in an integer column, and BR5 makes the
      // consequence permanent: the animal INNER JOINs to nothing and disappears from every list.
      const response = await putAnimal('7', {
        ...VALID_ANIMAL_BODY,
        HabitatId: '2',
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect((await envelopeOf(response)).Messages.join(' ')).toContain(
        'HabitatId',
      );
    });

    it('refuses an edit whose body is not JSON at all, without calling the backend', async () => {
      const response = await updateAnimalRoute(
        new Request('http://localhost/api/animals/7', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: 'not json',
        }),
        routeContext('7'),
      );
      const envelope = await envelopeOf(response);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(envelope.MessageType).toBe('Error');
      expect(envelope.Messages[0]).toMatch(/could not be read/i);
    });

    it('answers a refused body with HTTP 200 so the write promise still resolves', async () => {
      // Decision 3: a write's outcome is read off a resolved envelope, never a thrown error. A
      // 400 here would make the browser-side client throw and every write surface would have to
      // dig the reason out of an error object.
      const response = await postAnimal({});

      expect(response.status).toBe(200);
      // Not 'Warning': that is a business rejection the form shows against the Name entry as a
      // duplicate name (R20). A malformed request is not that.
      expect((await envelopeOf(response)).MessageType).toBe('Error');
    });
  });
});
