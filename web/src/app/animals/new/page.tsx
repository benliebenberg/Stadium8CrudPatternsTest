'use client';

/**
 * Add an animal (R17) — reached from the roster's "Add animal" action.
 *
 * A **client** component. The create is a browser-side `post` to the app's own `/api/animals`
 * route handler, which is the only thing that reaches Linx (it injects the server-only
 * `X-API-Key` and the fixed `LastChangedUser` header). Two consequences worth stating, because
 * both are easy to undo by "modernising" this file:
 *
 * - **Not a Server Action.** A Server Action posts to the page URL, so the write happens
 *   Node-side where no test can intercept it — and with `dataSource: existing-api` and no mock
 *   runtime, an E2E run would then insert real rows into the real database (architecture.md
 *   Decision 1). The form must stay a browser-side submit.
 * - The default export stays synchronous and renderable in jsdom — never an `async` server
 *   component.
 *
 * The screen itself is thin on purpose: the five entries, the rules, the habitat choices and the
 * outcome handling all live in `AnimalForm`, which the edit screen renders too (R21). All this
 * page decides is the wording of the task and where a saved animal lands — the roster, so the new
 * animal is visible straight away rather than leaving the user on a form wondering (R23).
 *
 * It renders no `<main>` of its own: the app shell owns the single `<main>` landmark
 * (Critical Rule 6).
 */

import { useRouter } from 'next/navigation';

import { AnimalForm } from '@/components/animals/AnimalForm';
import { Card, CardContent } from '@/components/ui/card';
import { post } from '@/lib/api/client';
import { ANIMALS_ENDPOINT } from '@/lib/api/endpoints';
import { ANIMALS_ROUTE } from '@/lib/routes';
import type { DefaultResponse } from '@/types/api';

/**
 * User-visible copy. The heading and the submit control say the same thing, because the button
 * completes the sentence the heading starts.
 */
const ADD_ANIMAL = 'Add animal';
const INTRO =
  'All five entries are needed, and the habitat has to be one the zoo already has on record.';

export default function AddAnimalPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-secondary text-h3 tracking-tight">{ADD_ANIMAL}</h1>
        <p className="text-body text-muted-foreground">{INTRO}</p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardContent>
          <AnimalForm
            submitLabel={ADD_ANIMAL}
            save={(animal) => post<DefaultResponse>(ANIMALS_ENDPOINT, animal)}
            onSaved={() => {
              // Client-side, so the whole journey costs one document load; the roster refetches
              // as it mounts, which is what makes the new animal appear without a reload (R23).
              router.push(ANIMALS_ROUTE);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
