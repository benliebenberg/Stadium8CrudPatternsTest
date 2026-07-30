'use client';

/**
 * One animal's record, loaded in the browser from the app's own `/api/animals/{Id}` handler.
 *
 * The sibling of `use-animal-roster.ts`, with the same client-side shape (architecture.md
 * § Decision 1: the browser never reaches Linx directly, and a server-component read would be
 * invisible to both test layers) — plus one state the roster does not need: **not found**.
 *
 * Three things this hook owns, so no screen has to re-derive them:
 *
 * 1. **The response shape.** `GET /v1/animals/{Id}` answers with an `AnimalRead`
 *    **unwrapped** — not the `{ Animals: [...] }` envelope the roster uses, and not the
 *    `DefaultResponse` envelope every write uses (BR8). So a body that *is* an envelope, or
 *    an empty object, is not a record.
 * 2. **Not-found without a 404.** The single read has no not-found branch in the Linx
 *    solution — the event is `ReadAnimal → Return`, with no `TryCatch` and no `If` (BR9) — so
 *    the decision is made from the **body**, never from the status. See
 *    {@link readAnimalBody} and `isInfrastructureReadFailure`.
 * 3. **Retry semantics.** Only a plumbing failure is retryable; "this animal does not exist"
 *    is not something trying again can fix, and offering a Retry there would be a lie.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { get } from '@/lib/api/client';
import { animalEndpoint } from '@/lib/api/endpoints';
import {
  describeReadFailure,
  isInfrastructureReadFailure,
} from '@/lib/api/read-failure';
import { parseWriteEnvelope } from '@/lib/api/write-result';
import type { AnimalRead } from '@/types/api-generated';

/**
 * What the screen knows right now.
 *
 * `not-found` and `failed` are deliberately separate: one says the record is not there, the
 * other says we could not find out. Collapsing them would either offer a pointless retry or
 * tell a user their animal was deleted because the backend was restarting.
 */
export type AnimalDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly animal: AnimalRead }
  | { readonly status: 'not-found' }
  | { readonly status: 'failed'; readonly detail: string };

export interface AnimalDetailResult {
  readonly state: AnimalDetailState;
  /** Re-attempt the load — the Retry affordance R6/NFR-base-5 require. */
  readonly reload: () => void;
}

/**
 * Interpret a read that **resolved**: HTTP 2xx, with a body the client parsed.
 *
 * A usable record has to identify itself — an `Id` or a `Name`. That is what separates the
 * real thing from the empty object this backend returns for an id that does not exist, and it
 * does not depend on any single field being present (the API spec declares no `required:`
 * fields at all, so nothing can be assumed beyond identity).
 *
 * A body that is not an object at all — `null`, an array, a bare string — is neither a record
 * nor an answer about one, so it is reported as a failure rather than as "not found".
 */
function readAnimalBody(body: unknown): AnimalDetailState {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { status: 'failed', detail: describeReadFailure(undefined) };
  }

  // An envelope on this endpoint can only mean the record was not read: a successful single
  // read is an unwrapped `AnimalRead` (BR8).
  if (parseWriteEnvelope(body) !== null) {
    return { status: 'not-found' };
  }

  const candidate = body as AnimalRead;

  if (typeof candidate.Id !== 'number' && typeof candidate.Name !== 'string') {
    return { status: 'not-found' };
  }

  return { status: 'loaded', animal: candidate };
}

/**
 * Interpret a read that **rejected**. The API client throws on any non-2xx, so this is where
 * the 500-carrying-an-envelope case that BR9 creates has to be told apart from a real outage
 * — which is exactly what `isInfrastructureReadFailure` decides.
 */
function readRejection(error: unknown): AnimalDetailState {
  return isInfrastructureReadFailure(error)
    ? { status: 'failed', detail: describeReadFailure(error) }
    : { status: 'not-found' };
}

/**
 * @param id The animal id from the route. Passed through as given: the route handler is what
 *   validates that it could be an animal id at all, and answers a junk segment with a proper
 *   not-found rather than this hook second-guessing the address bar.
 */
export function useAnimalDetail(id: string): AnimalDetailResult {
  const [state, setState] = useState<AnimalDetailState>({ status: 'loading' });

  /**
   * The attempt currently allowed to publish a result — same guard as the roster hook. A slow
   * first response must not overwrite the answer to a retry the user has already triggered,
   * and an unmounted screen must not be updated at all.
   */
  const currentAttempt = useRef(0);
  const mounted = useRef(true);

  /**
   * Issue one request and publish its outcome.
   *
   * Deliberately does NOT set the loading state itself: the hook starts in `loading`, so the
   * placeholder is on screen from the first render and the effect below can start the request
   * without writing state synchronously (which cascades renders — `react-hooks/set-state-in-effect`,
   * the lint failure story 2 hit). Resetting to `loading` belongs to {@link reload}, where it
   * happens inside a user event instead.
   */
  const load = useCallback(() => {
    const attempt = currentAttempt.current + 1;
    currentAttempt.current = attempt;

    const isStillWanted = () =>
      mounted.current && currentAttempt.current === attempt;

    void get<unknown>(animalEndpoint(id)).then(
      (body) => {
        if (!isStillWanted()) {
          return;
        }

        setState(readAnimalBody(body));
      },
      (error: unknown) => {
        if (!isStillWanted()) {
          return;
        }

        setState(readRejection(error));
      },
    );
  }, [id]);

  /**
   * Re-attempt the load, back to the loading placeholder first so the retry is visibly doing
   * something. Called from a click handler, never from an effect. The attempt counter in
   * {@link load} discards whatever the previous, still-open request answers.
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
