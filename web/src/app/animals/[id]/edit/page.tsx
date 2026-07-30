'use client';

/**
 * Change an existing animal (R21) — reached from that animal's own page.
 *
 * The same form as add: `AnimalForm` owns the five entries, the rules, the habitat choices and
 * the outcome handling, and this screen supplies only the prefill, the wording, the verb (`put`)
 * and where a saved animal lands. R21 asks for one form, and the reason to keep it that way is
 * concrete — the Age rule and the mandatory habitat (BR5) are the only validation that exists
 * anywhere in this system (R19), so a second copy of the form would eventually mean a second,
 * weaker copy of the rules.
 *
 * A **client** component, for the same two reasons the detail view is one
 * (architecture.md § Decision 1) — and here the stakes are higher than on a read screen:
 *
 * - **Not a Server Action, and not an `async` server component.** Both the prefill read and the
 *   `PUT` happen browser-side, through the API client, against the app's own `/api/animals/{Id}`
 *   handler — the only thing that reaches Linx (it injects the server-only `X-API-Key` and the
 *   fixed `LastChangedUser` header, R5/BR3). A Server Action would post to the page URL, where
 *   neither Playwright's `page.route()` nor the Vitest seam can see it; with
 *   `dataSource: existing-api` and no mock runtime, an E2E run would then **modify real rows in
 *   the real database**.
 * - The id comes from `useParams()`. In this version of Next the `params` prop is a Promise,
 *   which a client component cannot read without `use()`; `useParams()` is this project's way in.
 *
 * ## The prefill decides when the form may render
 *
 * `AnimalForm` reads `initialValues` **once**, as react-hook-form's defaults. So the form is
 * mounted only after the record has arrived — a prefill pushed in later would be ignored, and
 * mounting an empty form first would flash blank entries at someone about to edit them. That is
 * why this screen carries the same four states as the detail view rather than rendering the form
 * straight away.
 *
 * ## PUT replaces the whole record
 *
 * `PUT /v1/animals/{Id}` writes what it is given, over everything that was there — and the
 * backend validates nothing (R19). So the body is always all five writable fields, including the
 * ones the person never touched: a "changed fields only" body would blank the rest of the
 * animal. `animalWriteFromForm` builds exactly those five, which is what keeps `Id`,
 * `HabitatName` and the change-tracking pair out of it.
 *
 * It renders no `<main>` of its own: the app shell owns the single `<main>` landmark
 * (Critical Rule 6).
 */

import { useParams, useRouter } from 'next/navigation';

import { AnimalForm } from '@/components/animals/AnimalForm';
import { FailureState } from '@/components/feedback/FailureState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { Card, CardContent } from '@/components/ui/card';
import { useAnimalDetail } from '@/hooks/use-animal-detail';
import { put } from '@/lib/api/client';
import { animalEndpoint } from '@/lib/api/endpoints';
import { animalDisplayName } from '@/lib/animals/animal-display';
import { animalDetailRoute, routeSegment } from '@/lib/routes';
import { animalFormFromRecord } from '@/lib/validation/schemas';
import type { DefaultResponse } from '@/types/api';

/**
 * User-visible copy.
 *
 * The submit control says "Save changes" rather than "Save animal": on this screen the thing
 * being saved is the edit, and the person already knows which animal they opened.
 */
const SAVE_CHANGES = 'Save changes';
const PENDING_TITLE = 'Edit animal';
const LOADING_LABEL = 'Loading the animal to edit';
const INTRO =
  'All five entries are still needed, and the habitat has to be one the zoo already has on record.';
const RECORD_FAILED_TITLE = 'This animal’s current details could not be loaded';
const RECORD_FAILED_HINT =
  'The form has to start from the animal’s stored values, so try loading them again.';

/**
 * Not-found wording, kept clearly apart from the failure wording above: "we could not load this"
 * and "this animal is not here" are different facts, and only the first is worth retrying. The
 * edit form has its own version of the second, because there is nothing here to edit.
 */
const NOT_FOUND_TITLE = 'Animal not found';
const NOT_FOUND_DETAIL =
  'There is no animal on record at this address, so there is nothing to edit. It may already have been removed, or the address may be wrong.';

export default function EditAnimalPage() {
  const params = useParams();
  const router = useRouter();
  const id = routeSegment(params.id);
  const { state, reload } = useAnimalDetail(id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-secondary text-h3 tracking-tight">
          {/* Once the record is here the heading names the animal being changed, so the person
              can see they opened the right one; before then there is no name to use. */}
          {state.status === 'loaded'
            ? `Edit ${animalDisplayName(state.animal)}`
            : PENDING_TITLE}
        </h1>
        {state.status === 'loaded' && (
          <p className="text-body text-muted-foreground">{INTRO}</p>
        )}
      </div>

      {state.status === 'loading' && (
        <LoadingState label={LOADING_LABEL} rows={4} />
      )}

      {state.status === 'failed' && (
        <FailureState
          title={RECORD_FAILED_TITLE}
          detail={`${state.detail} ${RECORD_FAILED_HINT}`}
          onRetry={reload}
        />
      )}

      {state.status === 'not-found' && (
        // No form at all: an empty form here would invite someone to "save" an animal that does
        // not exist, and this backend would happily create whatever it was sent (R19).
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-body-md text-foreground">{NOT_FOUND_TITLE}</p>
            <p className="text-body text-muted-foreground">
              {NOT_FOUND_DETAIL}
            </p>
          </CardContent>
        </Card>
      )}

      {state.status === 'loaded' && (
        <Card className="w-full max-w-2xl">
          <CardContent>
            <AnimalForm
              submitLabel={SAVE_CHANGES}
              // Read once as the form's defaults, which is why the form is mounted only now.
              initialValues={animalFormFromRecord(state.animal)}
              // The record's own endpoint, with the id in the path — never in the body.
              save={(animal) =>
                put<DefaultResponse>(animalEndpoint(id), animal)
              }
              onSaved={() => {
                // The animal's own page, so the saved values are visible immediately (R23).
                // Client-side, so the whole journey costs one document load and the detail
                // view refetches as it mounts — which is what "without a manual reload" means.
                router.push(animalDetailRoute(id));
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
