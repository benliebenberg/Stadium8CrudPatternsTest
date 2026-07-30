'use client';

/**
 * The habitat list, loaded in the browser from the app's own `/api/habitats` handler.
 *
 * The third sibling of `use-animal-roster.ts` / `use-animal-detail.ts`, with the same shape and
 * the same guards (architecture.md § Decision 1: the browser never reaches Linx directly, and a
 * server-component read would be invisible to both test layers).
 *
 * Two things this hook owns so no screen re-derives them:
 *
 * - **The response shape.** `GET /v1/habitats` answers with the `{ Habitats: [...] }` envelope,
 *   and the app's route handler answers a refused Linx read with a message body carrying no
 *   `Habitats` at all. The API client only rejects on a non-2xx, so "resolved" does not mean
 *   "habitat list" — a body without a `Habitats` **array** is a failure, never an empty zoo.
 * - **Retry semantics.** One request per attempt, and a stale or unmounted response is
 *   discarded rather than published.
 *
 * There are only three states, unlike the single-animal read: `GET /v1/habitats` is a
 * collection, so "not found" does not exist — an empty collection is a legitimate success.
 *
 * **Habitats are read-only on this backend** (BR7): only `GET /v1/habitats` exists, so there is
 * deliberately no mutation counterpart to this hook and no cache to invalidate after a write.
 *
 * Used by the habitats reference screen (`/habitats`) and by any form that needs the habitats a
 * new animal can be assigned to — note that a habitat **picker** must read the full list from
 * here, whereas the roster's habitat **filter** derives its choices from the loaded roster
 * (`habitatsInRoster`), because a filter may only offer values that can actually match.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { get } from '@/lib/api/client';
import { HABITATS_ENDPOINT } from '@/lib/api/endpoints';
import { describeReadFailure } from '@/lib/api/read-failure';
import type { HabitatRead, HabitatReadList } from '@/types/api-generated';

/** What the habitat list knows right now. `habitats` exists only once a list actually arrived. */
export type HabitatsState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly habitats: readonly HabitatRead[] }
  | { readonly status: 'failed'; readonly detail: string };

export interface HabitatsResult {
  readonly state: HabitatsState;
  /** Re-attempt the load — the Retry affordance R6/NFR-base-5 require. */
  readonly reload: () => void;
}

/**
 * The habitats out of a response body, or `null` when the body is not a habitat list at all.
 *
 * `Array.isArray` rather than a truthiness check, for the same reason the roster hook uses it:
 * the refused-read body carries `Messages` and no `Habitats`, and reading that as "no habitats"
 * would report an outage as a zoo with nowhere to put an animal.
 */
function readHabitats(body: unknown): readonly HabitatRead[] | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const habitats = (body as Partial<HabitatReadList>).Habitats;
  return Array.isArray(habitats) ? habitats : null;
}

export function useHabitats(): HabitatsResult {
  const [state, setState] = useState<HabitatsState>({ status: 'loading' });

  /**
   * The attempt currently allowed to publish a result. A slow first response must not overwrite
   * the answer to a retry the user has already triggered, and an unmounted screen must not be
   * updated at all.
   */
  const currentAttempt = useRef(0);
  const mounted = useRef(true);

  /**
   * Issue one habitats request and publish its outcome.
   *
   * Deliberately does NOT set the loading state itself: the hook's initial state is already
   * `loading`, so the placeholder is on screen from the first render and the effect below can
   * start the request without writing state synchronously (which cascades renders — see
   * `react-hooks/set-state-in-effect`). Resetting to `loading` belongs to {@link reload}, where
   * it happens inside a user event instead.
   */
  const load = useCallback(() => {
    const attempt = currentAttempt.current + 1;
    currentAttempt.current = attempt;

    const isStillWanted = () =>
      mounted.current && currentAttempt.current === attempt;

    void get<unknown>(HABITATS_ENDPOINT).then(
      (body) => {
        if (!isStillWanted()) {
          return;
        }

        const habitats = readHabitats(body);

        setState(
          habitats === null
            ? { status: 'failed', detail: describeReadFailure(undefined) }
            : { status: 'loaded', habitats },
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
