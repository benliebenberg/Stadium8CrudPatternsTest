/**
 * Integration Test: the browser-side API client
 *
 * `web/src/lib/api/client.ts` is the seam every screen in this app fetches through, so what
 * it puts on the wire and how it reports a failure are pinned here.
 *
 * This file was rewritten by epic `zoo-animal-manager` story 1, which deliberately REMOVED
 * three template behaviours the tests used to assert. Those assertions are gone rather than
 * weakened, because the behaviour is gone:
 *
 * - **A caller-supplied `lastChangedUser`.** `LastChangedUser` is a required backend header,
 *   but it is fixed deployment configuration injected server-side — never a caller argument
 *   (brief R5/BR3). `post`/`put`/`del` no longer take one.
 * - **A `requiresAuth` flag reading `NEXT_PUBLIC_API_TOKEN`.** The credential is a shared
 *   secret held server-side; a `NEXT_PUBLIC_*` var is baked into the browser bundle, so it
 *   was exactly the wrong place for it (project.md §Authentication).
 * - **Status-code-specific error messages** ("Not Found: …", "Internal Server Error: …").
 *   This backend answers business rejections, technical faults AND some successes with HTTP
 *   500 carrying a `DefaultResponse` envelope, so a switch on 401/403/404/500 invents
 *   distinctions the backend does not make. The failure reason now comes from the body
 *   (architecture.md § Decision 2).
 *
 * The endpoints below are this app's OWN `/api/*` route handlers, because those are the only
 * things the browser may call: they are what reach the Linx backend, injecting the
 * server-only key (architecture.md § Decision 1).
 */

import { vi, type Mock } from 'vitest';

import { apiClient, del, get, post } from '@/lib/api/client';
import { createAnimalList } from '@/mocks/data/animal';
import { createDuplicateWarning } from '@/mocks/data/write-result';
import type { APIError } from '@/types/api';

// Mock the global fetch function
global.fetch = vi.fn();

/** The URL the client actually resolved for its most recent request. */
function requestedUrl(): string {
  const [url] = (global.fetch as Mock).mock.calls[0] as [string];
  return url;
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  };
}

/** A response with no body at all — what the Linx host sends for a refused key. */
function bodylessResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: new Headers(),
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
  };
}

describe('API Client Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('same-origin requests', () => {
    it('fetches data and parses the JSON response', async () => {
      const roster = createAnimalList();
      (global.fetch as Mock).mockResolvedValueOnce(jsonResponse(200, roster));

      const result = await get<typeof roster>('/api/animals');

      expect(result).toEqual(roster);
    });

    /**
     * The whole point of this assertion is the *resolved* URL, not the endpoint string
     * passed in. The template prefixed a backend base URL onto every endpoint, which would
     * turn this call into `http://localhost:10002/crud-patterns/api/animals`: the Linx host,
     * on a path that does not exist there, with the backend's address now visible in the
     * browser and the request doomed to fail on CORS. Nothing else in either test layer
     * catches that — Vitest mocks this module elsewhere, and a Playwright glob matches the
     * wrong absolute URL just as happily (architecture.md § Decision 1).
     */
    it('sends the request to the relative path it was given, with no backend host prefixed', async () => {
      (global.fetch as Mock).mockResolvedValueOnce(
        jsonResponse(200, createAnimalList()),
      );

      await get('/api/animals');

      expect(requestedUrl()).toBe('/api/animals');
    });

    it('refuses an absolute endpoint instead of calling it', async () => {
      // A cross-origin call from the browser would mean the shared API key had to travel
      // with it. There is no legitimate caller for this, so it fails loudly.
      await expect(
        get('http://localhost:10002/crud-patterns/v1/animals'),
      ).rejects.toThrow(/same-origin/i);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('appends query parameters to the relative path', async () => {
      (global.fetch as Mock).mockResolvedValueOnce(
        jsonResponse(200, createAnimalList()),
      );

      await get('/api/animals', { habitat: 2, diet: 'Herbivore' });

      expect(requestedUrl()).toBe('/api/animals?habitat=2&diet=Herbivore');
    });

    it('sends a POST body without any caller-supplied change-name', async () => {
      const animal = { Name: 'Tandi', Species: 'Black Rhinoceros' };
      const envelope = createDuplicateWarning();
      (global.fetch as Mock).mockResolvedValueOnce(jsonResponse(200, envelope));

      const result = await post<typeof envelope>('/api/animals', animal);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/animals',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(animal),
        }),
      );
      // `LastChangedUser` is injected by the route handler, from server configuration —
      // there is no argument for it and the browser never sets the header.
      const [, init] = (global.fetch as Mock).mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(Object.keys(init.headers)).not.toContain('LastChangedUser');
      expect(result).toEqual(envelope);
    });

    it('returns nothing for a 204 No Content response', async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      });

      const result = await del('/api/animals/1');

      expect(result).toBeUndefined();
    });
  });

  describe('failure reporting', () => {
    it('takes its message from the response envelope, not from the status code', async () => {
      // HTTP 500 is this backend's answer for everything, including a recoverable duplicate
      // name — so the status says nothing and the envelope says everything.
      const rejection = createDuplicateWarning();
      (global.fetch as Mock).mockResolvedValueOnce(
        jsonResponse(500, rejection),
      );

      await expect(
        apiClient('/api/animals', { method: 'POST' }),
      ).rejects.toMatchObject({
        message: 'Animal already exists',
        details: ['Animal already exists'],
        // Carried through so a caller can tell a business rejection from a fault.
        messageType: 'Warning',
        statusCode: 500,
      } satisfies APIError);
    });

    it('still reports a readable failure when the response has no body', async () => {
      (global.fetch as Mock).mockResolvedValueOnce(bodylessResponse(401));

      await expect(get('/api/habitats')).rejects.toMatchObject({
        message: expect.stringMatching(/failed \(HTTP 401\)/) as unknown,
        // No envelope arrived, so there is no MessageType to report.
        messageType: undefined,
      });
    });

    it('reports a refused connection as a network failure', async () => {
      (global.fetch as Mock).mockRejectedValueOnce(
        new TypeError('Failed to fetch'),
      );

      await expect(get('/api/animals')).rejects.toMatchObject({
        message: expect.stringContaining('Network error') as unknown,
        statusCode: 0,
      });
    });
  });
});
