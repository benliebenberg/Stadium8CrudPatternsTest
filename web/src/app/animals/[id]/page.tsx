'use client';

/**
 * One animal's full record — reached by selecting a row in the roster (R12).
 *
 * A **client** component reading `/api/animals/{Id}` through the API client
 * (architecture.md § Decision 1). Two consequences worth stating, because both are easy to
 * undo by "modernising" this file:
 *
 * - The id comes from `useParams()`, not from a `params` prop. In this version of Next the
 *   prop is a Promise, which a client component cannot read without `use()`; `useParams()` is
 *   the agreed way in for this project.
 * - The default export must stay synchronous and renderable in jsdom. An `async` server
 *   component would read the record server-side, where neither Playwright's `page.route()` nor
 *   the Vitest seam can see it — which is the whole reason Decision 1 exists.
 *
 * It renders no `<main>` of its own: the app shell owns the single `<main>` landmark
 * (Critical Rule 6, `web/src/components/layout/AppShell.tsx`).
 *
 * Four states, and the third is the one this screen exists to get right:
 *
 * | State | What the user sees |
 * |---|---|
 * | loading | the shared loading placeholder — never a blank screen (NFR-2) |
 * | loaded | the record, with the last-changed date exactly as the backend sent it |
 * | not found | a plain "animal not found" page with a way back — never a row of blanks (R14) |
 * | failed | the shared failure state with a Retry that re-issues the load (R6/NFR-base-5) |
 *
 * "Not found" is the app's own in-shell state, deliberately not Next's `notFound()`: the
 * address the person typed stays in the address bar, the app's shell and navigation stay
 * around them, and the way back to the roster is part of the page rather than the browser's
 * back button. `useAnimalDetail` decides which of not-found and failed applies, from the
 * response body rather than its status (BR9 — the single read has no clean 404 path).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { AnimalRecord } from '@/components/animals/AnimalRecord';
import { FailureState } from '@/components/feedback/FailureState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { Card, CardContent } from '@/components/ui/card';
import {
  useAnimalDetail,
  type AnimalDetailState,
} from '@/hooks/use-animal-detail';
import { animalDisplayName } from '@/lib/animals/animal-display';
import { ANIMALS_ROUTE } from '@/lib/routes';

/**
 * User-visible copy.
 *
 * The failure wording and the not-found wording are kept clearly different on purpose: "we
 * could not load this" and "this animal is not here" are different facts about the world, and
 * a reader who cannot tell them apart cannot act on either. Only the first is retryable.
 */
const BACK_TO_ROSTER = 'Back to the animal roster';
const LOADING_LABEL = 'Loading animal record';
const RECORD_FAILED_TITLE = 'This animal’s record could not be loaded';
const NOT_FOUND_TITLE = 'Animal not found';
const NOT_FOUND_DETAIL =
  'There is no animal on record at this address. It may already have been removed, or the address may be wrong.';

/** The heading shown before the record arrives, when the animal's name is not yet known. */
const PENDING_TITLE = 'Animal record';

/**
 * The animal id out of the route.
 *
 * A dynamic segment is typed as possibly an array (catch-all routes) and possibly absent, so
 * both are narrowed here rather than asserted away. It is passed on exactly as it appears in
 * the address bar: the route handler is what decides whether it could be an animal id at all,
 * and it answers a junk segment with a proper not-found.
 */
function routeSegment(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

/**
 * The page heading for the current state.
 *
 * Once the record is here, the heading is the animal's own name — the page is *about* that one
 * animal, so naming it is the heading's job (and it is what tells the reader the right record
 * loaded). Before then there is no name to use, and when there is no record at all the heading
 * has to say so, because "Animal not found" is the whole message.
 */
function headingFor(state: AnimalDetailState): string {
  switch (state.status) {
    case 'loaded':
      return animalDisplayName(state.animal);
    case 'not-found':
      return NOT_FOUND_TITLE;
    default:
      return PENDING_TITLE;
  }
}

export default function AnimalDetailPage() {
  const params = useParams();
  const { state, reload } = useAnimalDetail(routeSegment(params.id));

  return (
    <div className="flex flex-col gap-6">
      {/* The single link back to the roster, present in every state — including the ones where
          there is nothing else to do. `ANIMALS_ROUTE` is the root path: the roster IS the home
          screen, and there is no `/animals` index. */}
      <Link
        href={ANIMALS_ROUTE}
        className="text-primary rounded-small text-body w-fit underline-offset-4 hover:underline focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
      >
        {BACK_TO_ROSTER}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-secondary text-h3 tracking-tight">
          {headingFor(state)}
        </h1>
        {/* Record-level actions land here: Edit (story 7) and Remove (story 9). Deliberately
            empty for now — this story builds neither. */}
      </div>

      {state.status === 'loading' && (
        <LoadingState label={LOADING_LABEL} rows={4} />
      )}

      {state.status === 'failed' && (
        <FailureState
          title={RECORD_FAILED_TITLE}
          detail={state.detail}
          onRetry={reload}
        />
      )}

      {state.status === 'not-found' && (
        // No field rows at all, blank or otherwise (R14): a record that is not there has no
        // values to label.
        <Card>
          <CardContent>
            <p className="text-body text-muted-foreground">
              {NOT_FOUND_DETAIL}
            </p>
          </CardContent>
        </Card>
      )}

      {state.status === 'loaded' && <AnimalRecord animal={state.animal} />}
    </div>
  );
}
