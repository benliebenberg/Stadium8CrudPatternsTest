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
 *
 * `fetch` is stubbed with real `Response` objects, so the handlers meet the same body and
 * status surface they will meet at runtime.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GET as getAnimal,
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

      const response = await createAnimalRoute(
        new Request('http://localhost/api/animals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ Name: 'Anaya', HabitatId: 1 }),
        }),
      );

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
});
