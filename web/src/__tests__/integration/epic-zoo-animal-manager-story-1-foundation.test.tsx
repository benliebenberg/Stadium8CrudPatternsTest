/**
 * Story Metadata:
 * - Route: none — non-routable (this story ships no UI at all)
 * - Target File: web/src/lib/api/server/linx-client.ts
 * - Page Action: create_new
 *
 * Epic `zoo-animal-manager`, Story 1 — server-side backend access foundation.
 *
 * There is nothing to render here, so this file tests the two things a server client
 * makes observable: **the outbound request it produces** and **the result object it
 * returns**. `fetch` is stubbed with real `Response` objects (not hand-shaped literals)
 * so the client meets the same body/status surface it will meet at runtime — which is
 * what makes the "401 with no body at all" case (AC-4) honest rather than simulated.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THESE TESTS PIN — implement `web/src/lib/api/server/linx-client.ts` to it
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * Six functions, named after the spec's own `operationId`s so the module and
 * `generated-docs/specs/api-spec.yaml` stay traceable to one another:
 *
 *   animalGetList()               -> Promise<LinxReadResult<AnimalReadList>>
 *   animalGetById(id: number)     -> Promise<LinxReadResult<AnimalRead>>   // unwrapped, BR8
 *   habitatGetList()              -> Promise<LinxReadResult<HabitatReadList>>
 *   animalCreate(body: AnimalWrite)            -> Promise<LinxWriteResult>
 *   animalUpdate(id: number, body: AnimalWrite) -> Promise<LinxWriteResult>
 *   animalDelete(id: number)                    -> Promise<LinxWriteResult>
 *
 * Two result unions. Nothing here ever throws or rejects — a caller always gets a
 * value it can branch on, because a refused backend is a normal state of the world
 * for this app, not an exception (R6 / NFR-base-5):
 *
 *   type LinxReadResult<T> =
 *     | { outcome: 'success'; data: T }
 *     | { outcome: 'failed'; messages: string[] };
 *
 *   type LinxWriteResult =
 *     | { outcome: 'success'; id: number; messages: string[] }  // MessageType 'Success'
 *     | { outcome: 'rejected'; messages: string[] }             // MessageType 'Warning' — business rejection
 *     | { outcome: 'failed'; messages: string[] };              // MessageType 'Error', or a transport/auth failure
 *
 * `outcome` is derived from `DefaultResponse.MessageType` in the backend's own casing
 * (`Success` / `Warning` / `Error`) and NEVER from the HTTP status — a 500 carrying
 * `Warning` is a business rejection (BR4/BR10/BR11). Reads have no `rejected` state:
 * only writes carry a `DefaultResponse` envelope.
 *
 * Two implementation requirements the tests below depend on:
 *
 *  1. **Read configuration at request time**, inside the function — `process.env.API_KEY`,
 *     `process.env.LAST_CHANGED_USER`, and the base URL — not into a module-level `const`
 *     at import time. That is correct for a Next.js server module anyway (env is resolved
 *     per-request in a server runtime), and it is what lets these tests configure it.
 *  2. **Call `fetch(url, init)`** with an absolute URL string and a plain `init` — the
 *     conventional form the existing template client uses.
 *
 * These tests will FAIL until the module exists (TDD red).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  animalCreate,
  animalDelete,
  animalGetById,
  animalGetList,
  animalUpdate,
  habitatGetList,
} from '@/lib/api/server/linx-client';
// Project-wide entity factories — the single source of truth for these response
// bodies, shared with the Playwright layer. Response shapes are never hand-written here.
import { createAnimal, createAnimalList } from '@/mocks/data/animal';
import type { DefaultResponse } from '@/types/api';
import type { AnimalRead, AnimalWrite } from '@/types/api-generated';

/**
 * The canonical API description this story owns. Reading it from a test is legitimate:
 * it is a real, versioned contract artifact of this story (AC-1), not an implementation
 * detail — and the base address it records is the one the client below must actually use.
 */
const SPEC_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../generated-docs/specs/api-spec.yaml',
);

function readSpec(): string {
  return readFileSync(SPEC_PATH, 'utf8');
}

/**
 * The `servers[0].url` the spec declares. Anchored to the `servers:` block on purpose —
 * the file's provenance header quotes the *wrong* embedded address several times while
 * explaining why it was corrected, so a naive substring search would find either value.
 */
function specBaseUrl(spec: string): string {
  const match = /^servers:\s*\n\s*-\s*url:\s*(\S+)\s*$/m.exec(spec);
  if (!match) {
    throw new Error(`${SPEC_PATH} declares no servers[0].url`);
  }
  return match[1];
}

const SPEC_BASE_URL = specBaseUrl(readSpec());

/** Every operation the app proxies, alphabetically — the spec must declare exactly these. */
const OPERATION_IDS = [
  'AnimalCreate',
  'AnimalDelete',
  'AnimalGetById',
  'AnimalGetList',
  'AnimalUpdate',
  'HabitatGetList',
];

/**
 * Obviously-fake credentials. A real key is never read, referenced, or asserted on —
 * these are stubbed over whatever the environment happens to hold, so the suite is
 * deterministic and can never leak or depend on a deployment secret.
 */
const SERVER_ONLY_API_KEY = 'test-api-key-not-a-real-secret';
const BROWSER_READABLE_TOKEN = 'test-browser-readable-token-must-be-ignored';
const CONFIGURED_CHANGE_NAME = 'Test Deployment Name';
const CALLER_SUPPLIED_CHANGE_NAME = 'Caller Supplied Name';

/**
 * Write envelopes (`DefaultResponse`). Typed rather than loose so a change to the
 * envelope shape breaks these at compile time. Kept local because no `DefaultResponse`
 * entity factory exists yet — see the note returned to the orchestrator about promoting
 * one for stories 6–9 and their Playwright specs.
 */
const ANIMAL_CREATED: DefaultResponse = {
  Id: 12,
  MessageType: 'Success',
  Messages: ['Animal successfully created'],
};

const ANIMAL_DELETED: DefaultResponse = {
  Id: 1,
  MessageType: 'Success',
  Messages: ['Animal deleted successfully'],
};

/** A duplicate name: HTTP 500, but `Warning` — a business rejection (BR10). */
const DUPLICATE_REJECTION: DefaultResponse = {
  Id: 0,
  MessageType: 'Warning',
  Messages: ['Animal already exists'],
};

/** A technical fault: HTTP 500 with the raw database text in `Messages[0]` (BR11). */
const RAW_DATABASE_MESSAGE =
  'Violation of PRIMARY KEY constraint. Cannot insert duplicate key in object dbo.Animal.';

const TECHNICAL_FAILURE: DefaultResponse = {
  Id: 0,
  MessageType: 'Error',
  Messages: [RAW_DATABASE_MESSAGE],
};

/**
 * The writable surface is exactly five fields — derived from the shared animal factory
 * so the request body can never drift from the entity the rest of the suite uses.
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

const ANIMAL_TO_WRITE = writableFieldsOf(
  createAnimal({ Name: 'Tandi', Species: 'Black Rhinoceros', Age: 5, HabitatId: 1 }),
);

const fetchMock = vi.fn();

interface OutboundRequest {
  url: string;
  method: string;
  /** Header names lower-cased, so an implementation using `new Headers()` reads the same. */
  headers: Record<string, string>;
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  const normalized: Record<string, string> = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
    return normalized;
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (
        Array.isArray(entry) &&
        typeof entry[0] === 'string' &&
        typeof entry[1] === 'string'
      ) {
        normalized[entry[0].toLowerCase()] = entry[1];
      }
    }
    return normalized;
  }

  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        normalized[key.toLowerCase()] = value;
      }
    }
  }

  return normalized;
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  throw new Error(
    'the server client called fetch with an unrecognised first argument',
  );
}

function outboundRequests(): OutboundRequest[] {
  return fetchMock.mock.calls.map((call) => {
    const init = (call[1] ?? {}) as { method?: unknown; headers?: unknown };
    return {
      url: urlOf(call[0]),
      method: typeof init.method === 'string' ? init.method.toUpperCase() : 'GET',
      headers: normalizeHeaders(init.headers),
    };
  });
}

/**
 * The single request the client sent for this operation, identified by method + path.
 * Throws a descriptive failure when it was never sent — so an assertion on its headers
 * can never pass vacuously.
 */
function requestTo(method: string, endpoint: string): OutboundRequest {
  const sent = outboundRequests();
  const match = sent.find(
    (request) => request.method === method && request.url.includes(endpoint),
  );

  if (!match) {
    const summary =
      sent.length === 0
        ? '(no request at all)'
        : sent.map((request) => `${request.method} ${request.url}`).join(', ');
    throw new Error(
      `Expected a ${method} request to ${endpoint}, but the server client sent ${summary}`,
    );
  }

  return match;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * A rejected key comes back from the Linx host as a bare 401 — no JSON, no
 * `DefaultResponse`, nothing. Calling `.json()` on this rejects, which is exactly the
 * trap AC-4 exists to close.
 */
function bodylessResponse(status: number): Response {
  return new Response(null, { status });
}

describe('Epic zoo-animal-manager, Story 1: server-side backend access foundation', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('API_KEY', SERVER_ONLY_API_KEY);
    vi.stubEnv('LAST_CHANGED_USER', CONFIGURED_CHANGE_NAME);
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', SPEC_BASE_URL);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('the canonical API description', () => {
    // AC-1
    it('records the corrected backend base address, not the wrong one embedded in the Linx solution', () => {
      // The embedded document declares `http://localhost:10002`, which 404s; the Linx
      // runtime's own Base URI setting is authoritative and 401s (project.md §Data Source).
      expect(SPEC_BASE_URL).toBe('http://localhost:10002/crud-patterns');
    });

    // AC-1
    it('covers exactly the six backend operations the server tier proxies', () => {
      const declared = [...readSpec().matchAll(/^\s+operationId:\s*(\S+)\s*$/gm)]
        .map((match) => match[1])
        .sort();

      expect(declared).toEqual(OPERATION_IDS);
    });
  });

  describe('the outbound request', () => {
    // AC-1, AC-2
    it('goes to the corrected base address even when no base-URL override is configured', async () => {
      // Unset, so the client must fall back to its own default — which must be the
      // corrected base, not the template's `http://localhost:8042`.
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
      fetchMock.mockResolvedValue(jsonResponse(200, createAnimalList()));

      const result = await animalGetList();

      expect(requestTo('GET', '/v1/animals').url).toBe(
        `${SPEC_BASE_URL}/v1/animals`,
      );
      expect(result).toEqual({ outcome: 'success', data: createAnimalList() });
    });

    // AC-2
    it('carries the shared key from the server-only API_KEY on both reads and writes, never a browser-readable token', async () => {
      // A browser-readable token IS present in the environment. It must never be the
      // source of a credential: the whole point of the server tier is that the key
      // cannot be reached from the bundle (project.md §Authentication).
      vi.stubEnv('NEXT_PUBLIC_API_TOKEN', BROWSER_READABLE_TOKEN);
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, createAnimal()))
        .mockResolvedValueOnce(jsonResponse(200, ANIMAL_DELETED));

      await animalGetById(1);
      await animalDelete(1);

      const read = requestTo('GET', '/v1/animals/1');
      const write = requestTo('DELETE', '/v1/animals/1');

      expect(read.headers['x-api-key']).toBe(SERVER_ONLY_API_KEY);
      expect(write.headers['x-api-key']).toBe(SERVER_ONLY_API_KEY);
      expect(Object.values(read.headers)).not.toContain(BROWSER_READABLE_TOKEN);
      expect(Object.values(write.headers)).not.toContain(BROWSER_READABLE_TOKEN);
    });

    // AC-2
    it('carries the fixed change-name from LAST_CHANGED_USER on every write', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, ANIMAL_CREATED));

      await animalCreate(ANIMAL_TO_WRITE);
      await animalUpdate(4, ANIMAL_TO_WRITE);

      expect(requestTo('POST', '/v1/animals').headers['lastchangeduser']).toBe(
        CONFIGURED_CHANGE_NAME,
      );
      expect(requestTo('PUT', '/v1/animals/4').headers['lastchangeduser']).toBe(
        CONFIGURED_CHANGE_NAME,
      );
    });

    // AC-5
    it('ignores a change-name a caller tries to supply, using the server-configured one instead', async () => {
      // Not a hypothetical: the template threads a `lastChangedUser` argument through
      // post/put/del. This story removes it — the value is deployment configuration, so
      // nothing a caller passes may reach the header.
      const smuggled = {
        ...ANIMAL_TO_WRITE,
        LastChangedUser: CALLER_SUPPLIED_CHANGE_NAME,
      };
      fetchMock.mockResolvedValue(jsonResponse(200, ANIMAL_CREATED));

      await animalCreate(smuggled);

      const request = requestTo('POST', '/v1/animals');
      expect(request.headers['lastchangeduser']).toBe(CONFIGURED_CHANGE_NAME);
      expect(Object.values(request.headers)).not.toContain(
        CALLER_SUPPLIED_CHANGE_NAME,
      );
    });
  });

  describe("a write's outcome, decided by MessageType and never by HTTP status", () => {
    // AC-3
    it('treats a 500 carrying "Warning" as a business rejection, passing the backend message through', async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, DUPLICATE_REJECTION));

      const result = await animalCreate(ANIMAL_TO_WRITE);

      expect(result).toMatchObject({
        outcome: 'rejected',
        messages: expect.arrayContaining(['Animal already exists']),
      });
    });

    // AC-3
    it('treats a 500 carrying "Error" as a technical failure, keeping the backend text', async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, TECHNICAL_FAILURE));

      const result = await animalCreate(ANIMAL_TO_WRITE);

      // Same status as the rejection above, opposite outcome — that is the whole point.
      // The raw text is preserved rather than swallowed (Critical Rule 3); deciding how
      // much of it a person sees is the write story's job, not this helper's.
      expect(result).toMatchObject({
        outcome: 'failed',
        messages: expect.arrayContaining([RAW_DATABASE_MESSAGE]),
      });
    });

    // AC-3
    it('treats "Success" — in the backend\'s own casing — as success, carrying the new Id', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, ANIMAL_CREATED));

      const result = await animalCreate(ANIMAL_TO_WRITE);

      // `Success`, not `SUCCESS`. An implementation comparing against the template's
      // uppercase APIMessageType values cannot pass this.
      expect(result).toEqual({
        outcome: 'success',
        id: 12,
        messages: ['Animal successfully created'],
      });
    });
  });

  describe('a backend that cannot be reached or refuses the key', () => {
    // AC-4
    it('resolves a refused connection into a readable failure result instead of throwing', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      // Awaiting proves it resolves: an unhandled rejection would fail this test.
      const result = await animalGetList();

      expect(result).toMatchObject({
        outcome: 'failed',
        messages: expect.arrayContaining([
          expect.stringMatching(/reach|connect|unavailable/i),
        ]),
      });
    });

    // AC-4
    it('resolves a rejected key (401 with no body at all) into a readable failure, not an empty success', async () => {
      fetchMock.mockResolvedValue(bodylessResponse(401));

      const result = await habitatGetList();

      // Parsing a body that isn't there must not blow up — and `failed` (rather than a
      // success carrying an empty list) is what stops an unreadable habitat list from
      // rendering as a habitat list that happens to be empty.
      expect(result).toMatchObject({
        outcome: 'failed',
        messages: expect.arrayContaining([
          expect.stringMatching(/api key|credential|authoris|authoriz/i),
        ]),
      });
    });
  });
});
