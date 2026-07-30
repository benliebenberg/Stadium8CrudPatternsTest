'use client';

/**
 * The home screen: the animal roster (R7).
 *
 * A **client** component, fetching from the app's own `/api/animals` handler through the API
 * client (architecture.md § Decision 1). A server-component read would be invisible to
 * Playwright's `page.route()` and could not satisfy retry-on-failure either.
 *
 * It renders no `<main>` of its own — the app shell owns the single `<main>` landmark
 * (Critical Rule 6, `web/src/components/layout/AppShell.tsx`).
 */

import { AnimalRosterTable } from '@/components/animals/AnimalRosterTable';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FailureState } from '@/components/feedback/FailureState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useAnimalRoster } from '@/hooks/use-animal-roster';

/**
 * User-visible copy. The empty and failure wording must stay clearly different from each
 * other — an empty zoo is a result, a failed load is not (R10) — and different from the
 * "nothing matched your search" wording the roster's filters use, which is a third, narrower
 * fact.
 */
const ROSTER_FAILED_TITLE = 'The animal roster could not be loaded';
const NO_ANIMALS_TITLE = 'No animals yet';
const NO_ANIMALS_DETAIL =
  'As soon as an animal is recorded in the backend, it appears here.';

export default function HomePage() {
  const { state, reload } = useAnimalRoster();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-secondary text-h3 tracking-tight">Animals</h1>
        <p className="text-body text-muted-foreground">
          Every animal on record, with its habitat and diet.
        </p>
      </div>

      {state.status === 'loading' && <LoadingState label="Loading animals" />}

      {state.status === 'failed' && (
        <FailureState
          title={ROSTER_FAILED_TITLE}
          detail={state.detail}
          onRetry={reload}
        />
      )}

      {state.status === 'loaded' &&
        (state.animals.length === 0 ? (
          <EmptyState
            title={NO_ANIMALS_TITLE}
            description={NO_ANIMALS_DETAIL}
          />
        ) : (
          <AnimalRosterTable animals={state.animals} />
        ))}
    </div>
  );
}
