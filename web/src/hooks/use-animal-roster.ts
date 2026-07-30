'use client';

/**
 * The animal roster, loaded in the browser from the app's own `/api/animals` handler.
 *
 * Owns the three states R10 requires — loading, loaded (possibly empty), failed-with-retry —
 * and nothing about how they look. Every screen that needs the full roster uses this hook, so
 * the shape guard and the retry semantics are written once:
 *
 * - **Client-side, through the API client** (architecture.md § Decision 1): the browser never
 *   reaches Linx directly, and a server-component read would be invisible to both test
 *   layers.
 * - **The body is `unknown` until it is checked.** A read the backend refused comes back as a
 *   `DefaultResponse` with `Messages` and no `Animals`, and the API client only rejects on a
 *   non-2xx. So "resolved" does not mean "roster" — an answer without an `Animals` array is a
 *   failure, never an empty zoo.
 * - **One roster load per attempt.** The backend accepts no search/filter/sort/paging
 *   parameters and always returns every animal sorted by `Name` (BR6), so filtering happens
 *   over `animals` in memory and must not re-issue the request.
 *
 * The attempt counter and unmount guard behind that last point are `use-tracked-read`'s, shared
 * with the other two read hooks so there is one implementation of the race to get right.
 */

import { useTrackedRead } from '@/hooks/use-tracked-read';
import { ANIMALS_ENDPOINT } from '@/lib/api/endpoints';
import { describeReadFailure } from '@/lib/api/read-failure';
import type { AnimalRead, AnimalReadList } from '@/types/api-generated';

/** What the roster knows right now. `animals` exists only once a roster actually arrived. */
export type RosterState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly animals: readonly AnimalRead[] }
  | { readonly status: 'failed'; readonly detail: string };

export interface AnimalRosterResult {
  readonly state: RosterState;
  /** Re-attempt the load — the Retry affordance R6/NFR-base-5 require. */
  readonly reload: () => void;
}

/** Module-level, because `use-tracked-read` treats a new `loading` value as a new read. */
const LOADING: RosterState = { status: 'loading' };

/**
 * The animals out of a response body, or `null` when the body is not a roster at all.
 *
 * `Array.isArray` rather than a truthiness check: the refused-read body carries `Messages`
 * and no `Animals`, and treating that as "no animals yet" would report an outage as an empty
 * zoo.
 */
function readRoster(body: unknown): readonly AnimalRead[] | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const animals = (body as Partial<AnimalReadList>).Animals;
  return Array.isArray(animals) ? animals : null;
}

/** A roster read that resolved: a roster, or a failure if the body was not one. */
function rosterFromBody(body: unknown): RosterState {
  const animals = readRoster(body);

  return animals === null
    ? { status: 'failed', detail: describeReadFailure(undefined) }
    : { status: 'loaded', animals };
}

/** A roster read that rejected. A collection read has no not-found state to reach. */
function rosterFromRejection(error: unknown): RosterState {
  return { status: 'failed', detail: describeReadFailure(error) };
}

export function useAnimalRoster(): AnimalRosterResult {
  return useTrackedRead({
    endpoint: ANIMALS_ENDPOINT,
    loading: LOADING,
    fromBody: rosterFromBody,
    fromRejection: rosterFromRejection,
  });
}
