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
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { get } from '@/lib/api/client';
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

export function useAnimalRoster(): AnimalRosterResult {
  const [state, setState] = useState<RosterState>({ status: 'loading' });

  /**
   * The attempt currently allowed to publish a result. A slow first response must not
   * overwrite the answer to a retry the user has already triggered, and an unmounted screen
   * must not be updated at all.
   */
  const currentAttempt = useRef(0);
  const mounted = useRef(true);

  /**
   * Issue one roster request and publish its outcome.
   *
   * Deliberately does NOT set the loading state itself: the hook's initial state is already
   * `loading`, so the placeholder is on screen from the first render, and the effect below can
   * start the request without writing state synchronously (which cascades renders — see
   * `react-hooks/set-state-in-effect`). Resetting to `loading` belongs to {@link reload},
   * where it happens inside a user event instead.
   */
  const load = useCallback(() => {
    const attempt = currentAttempt.current + 1;
    currentAttempt.current = attempt;

    const isStillWanted = () =>
      mounted.current && currentAttempt.current === attempt;

    void get<unknown>(ANIMALS_ENDPOINT).then(
      (body) => {
        if (!isStillWanted()) {
          return;
        }

        const animals = readRoster(body);

        setState(
          animals === null
            ? { status: 'failed', detail: describeReadFailure(undefined) }
            : { status: 'loaded', animals },
        );
      },
      (error: unknown) => {
        if (!isStillWanted()) {
          return;
        }

        setState({ status: 'failed', detail: describeReadFailure(error) });
      },
    );
  }, []);

  /**
   * Re-attempt the load, back to the loading placeholder first so the retry is visibly doing
   * something. Called from a click handler, never from an effect, so setting state here is the
   * ordinary event-driven path. The attempt counter in {@link load} discards whatever the
   * previous, still-open request answers.
   */
  const reload = useCallback(() => {
    setState({ status: 'loading' });
    load();
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    load();

    return () => {
      mounted.current = false;
    };
  }, [load]);

  return { state, reload };
}
