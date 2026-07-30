'use client';

/**
 * The habitat list, loaded in the browser from the app's own `/api/habitats` handler.
 *
 * The third sibling of `use-animal-roster.ts` / `use-animal-detail.ts`, with the same shape and
 * the same guards (architecture.md § Decision 1: the browser never reaches Linx directly, and a
 * server-component read would be invisible to both test layers) — those guards are literally the
 * same code, `use-tracked-read`'s.
 *
 * What this hook owns, so no screen re-derives it: **the response shape.**
 * `GET /v1/habitats` answers with the `{ Habitats: [...] }` envelope, and the app's route handler
 * answers a refused Linx read with a message body carrying no `Habitats` at all. The API client
 * only rejects on a non-2xx, so "resolved" does not mean "habitat list" — a body without a
 * `Habitats` **array** is a failure, never an empty zoo.
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

import { useTrackedRead } from '@/hooks/use-tracked-read';
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

/** Module-level, because `use-tracked-read` treats a new `loading` value as a new read. */
const LOADING: HabitatsState = { status: 'loading' };

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

/** A habitats read that resolved: the list, or a failure if the body was not one. */
function habitatsFromBody(body: unknown): HabitatsState {
  const habitats = readHabitats(body);

  return habitats === null
    ? { status: 'failed', detail: describeReadFailure(undefined) }
    : { status: 'loaded', habitats };
}

/** A habitats read that rejected. A collection read has no not-found state to reach. */
function habitatsFromRejection(error: unknown): HabitatsState {
  return { status: 'failed', detail: describeReadFailure(error) };
}

export function useHabitats(): HabitatsResult {
  return useTrackedRead({
    endpoint: HABITATS_ENDPOINT,
    loading: LOADING,
    fromBody: habitatsFromBody,
    fromRejection: habitatsFromRejection,
  });
}
