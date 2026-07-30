'use client';

/**
 * The read machinery every one of this project's data hooks needs, owned in one place.
 *
 * `use-animal-roster`, `use-animal-detail` and `use-habitats` each held their own copy of the
 * same forty lines — an attempt counter, an unmount guard, one request per attempt, and a
 * `reload` that shows the placeholder again — differing only in which endpoint they read and
 * what they make of the answer. Three copies of a race guard is three places for it to be
 * subtly wrong, and a fourth read hook would have been a fourth copy. So the guards live here,
 * and each hook keeps only the part that is genuinely its own: what a resolved body means, and
 * what a rejection means.
 *
 * What a caller gets, and what every read screen depends on:
 *
 * - **One request per attempt.** Nothing here re-fetches on a render, so narrowing a loaded list
 *   is always derived state over what is already in memory, never a second request (BR6).
 * - **A stale answer is discarded.** A slow first response cannot overwrite the answer to a
 *   retry the user has already triggered.
 * - **An unmounted screen is never updated.**
 * - **The loading state is the hook's initial state**, so the placeholder is on screen from the
 *   first render and the effect can start the request without writing state synchronously (which
 *   cascades renders — `react-hooks/set-state-in-effect`, the lint failure story 2 hit). Going
 *   back to it belongs to `reload`, which runs inside a user event instead.
 *
 * Client-side, through the API client, against this app's own `/api/*` handlers — never the Linx
 * base URL (architecture.md § Decision 1): the browser never reaches Linx directly, and a
 * server-component read would be invisible to both test layers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { get } from '@/lib/api/client';

/** What a tracked read exposes: the current state, and a way to attempt it again. */
export interface TrackedRead<TState> {
  readonly state: TState;
  /** Re-attempt the load — the Retry affordance R6/NFR-base-5 require. */
  readonly reload: () => void;
}

interface TrackedReadOptions<TState> {
  /**
   * The app's own root-relative endpoint to read — `/api/animals`, `/api/habitats`. Derive it
   * from `@/lib/api/endpoints` rather than writing it inline. A change of endpoint (an id in the
   * path changing, say) is a new read, so it re-issues the request.
   */
  readonly endpoint: string;
  /**
   * The state to start in, and to return to on a retry.
   *
   * **Must be referentially stable** — declare it as a module-level constant, never as an object
   * literal built during render, or every render would count as a new read.
   */
  readonly loading: TState;
  /**
   * What a response that RESOLVED means.
   *
   * The body is `unknown` on purpose: the API client only rejects on a non-2xx, so "resolved"
   * does not mean "the shape this screen asked for" — a refused read arrives as a
   * `DefaultResponse` with `Messages` and none of the data — and each hook has to check for
   * itself. **Must be referentially stable** (a module-level function).
   */
  readonly fromBody: (body: unknown) => TState;
  /**
   * What a read that REJECTED means. **Must be referentially stable** (a module-level function).
   */
  readonly fromRejection: (error: unknown) => TState;
}

export function useTrackedRead<TState>({
  endpoint,
  loading,
  fromBody,
  fromRejection,
}: TrackedReadOptions<TState>): TrackedRead<TState> {
  const [state, setState] = useState<TState>(loading);

  /**
   * The attempt currently allowed to publish a result, and whether this screen is still there to
   * publish it to. A slow first response must not overwrite the answer to a retry the user has
   * already triggered, and an unmounted screen must not be updated at all.
   */
  const currentAttempt = useRef(0);
  const mounted = useRef(true);

  const load = useCallback(() => {
    const attempt = currentAttempt.current + 1;
    currentAttempt.current = attempt;

    const isStillWanted = () =>
      mounted.current && currentAttempt.current === attempt;

    void get<unknown>(endpoint).then(
      (body) => {
        if (!isStillWanted()) {
          return;
        }

        setState(fromBody(body));
      },
      (error: unknown) => {
        if (!isStillWanted()) {
          return;
        }

        setState(fromRejection(error));
      },
    );
  }, [endpoint, fromBody, fromRejection]);

  /**
   * Re-attempt the load, back to the loading state first so the retry is visibly doing
   * something. Called from a click handler, never from an effect, so setting state here is the
   * ordinary event-driven path. The attempt counter in {@link load} discards whatever the
   * previous, still-open request answers.
   */
  const reload = useCallback(() => {
    setState(loading);
    load();
  }, [load, loading]);

  useEffect(() => {
    mounted.current = true;
    load();

    return () => {
      mounted.current = false;
    };
  }, [load]);

  return { state, reload };
}
