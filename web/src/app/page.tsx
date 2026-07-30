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

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AnimalRosterTable } from '@/components/animals/AnimalRosterTable';
import { RosterFilters } from '@/components/animals/RosterFilters';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FailureState } from '@/components/feedback/FailureState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { Button } from '@/components/ui/button';
import { useAnimalRoster } from '@/hooks/use-animal-roster';
import { filterRoster, habitatsInRoster } from '@/lib/animals/roster-filters';
import { ANIMAL_CREATE_ROUTE } from '@/lib/routes';
import type { AnimalRead } from '@/types/api-generated';

/**
 * User-visible copy. Three states that are easy to conflate and must never read alike:
 * a failed load is not a result (R10), an empty zoo is a result, and a roster narrowed to
 * nothing by a search term is a third, narrower fact — the person's own term is the reason,
 * and the wording has to say so or they will read it as "the zoo is empty" (R11).
 */
const ROSTER_FAILED_TITLE = 'The animal roster could not be loaded';
const NO_ANIMALS_TITLE = 'No animals yet';
const NO_ANIMALS_DETAIL =
  'As soon as an animal is recorded in the backend, it appears here.';
const NO_MATCHES_TITLE = 'No animals match your search';
const NO_MATCHES_DETAIL =
  'Try a shorter term, or choose a different habitat, to widen the results.';
const ADD_ANIMAL = 'Add animal';

/** A stable identity for "no animals", so the memos below do not recompute every render. */
const NO_ANIMALS: readonly AnimalRead[] = [];

export default function HomePage() {
  const { state, reload } = useAnimalRoster();

  /**
   * The two narrowing controls, held here as plain state and applied in memory. Nothing
   * below re-issues a request or touches the URL: `GET /v1/animals` accepts no search,
   * filter, sort or paging parameters (BR6), so the roster already in the browser is the
   * only thing there is to narrow.
   */
  const [term, setTerm] = useState('');
  const [habitat, setHabitat] = useState<string | null>(null);

  const animals = state.status === 'loaded' ? state.animals : NO_ANIMALS;
  const habitats = useMemo(() => habitatsInRoster(animals), [animals]);
  const visibleAnimals = useMemo(
    () => filterRoster(animals, { term, habitat }),
    [animals, term, habitat],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-secondary text-h3 tracking-tight">Animals</h1>
          <p className="text-body text-muted-foreground">
            Every animal on record, with its habitat and diet.
          </p>
        </div>

        {/* A real anchor, not a button that pushes a route: the add form is a page of its own, so
            it has to be deep-linkable and openable in a new tab. Rendered in every state —
            including the empty zoo, which is precisely when someone needs it (R17). */}
        <Button asChild>
          <Link href={ANIMAL_CREATE_ROUTE}>{ADD_ANIMAL}</Link>
        </Button>
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
        (animals.length === 0 ? (
          // Nothing to narrow, so the controls would be an empty affordance.
          <EmptyState
            title={NO_ANIMALS_TITLE}
            description={NO_ANIMALS_DETAIL}
          />
        ) : (
          <>
            <RosterFilters
              term={term}
              onTermChange={setTerm}
              habitat={habitat}
              onHabitatChange={setHabitat}
              habitats={habitats}
            />

            {visibleAnimals.length === 0 ? (
              <EmptyState
                title={NO_MATCHES_TITLE}
                description={NO_MATCHES_DETAIL}
              />
            ) : (
              <AnimalRosterTable animals={visibleAnimals} />
            )}
          </>
        ))}
    </div>
  );
}
