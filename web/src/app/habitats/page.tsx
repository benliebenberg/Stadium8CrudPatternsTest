'use client';

/**
 * The habitats reference (R15) — the screen behind the shell's Habitats navigation entry.
 *
 * A **client** component reading `/api/habitats` through the API client (architecture.md
 * § Decision 1). The default export must stay synchronous and renderable in jsdom: an `async`
 * server component would read the list server-side, where neither Playwright's `page.route()`
 * nor the Vitest seam can see it, and could not satisfy retry-on-failure either.
 *
 * It renders no `<main>` of its own — the app shell owns the single `<main>` landmark
 * (Critical Rule 6, `web/src/components/layout/AppShell.tsx`).
 *
 * Three states, kept clearly apart because two of them are easy to conflate (R10/NFR-2):
 *
 * | State | What the user sees |
 * |---|---|
 * | loading | the shared loading placeholder — never a blank screen |
 * | loaded | the reference table, or a plain statement that the backend holds no habitats |
 * | failed | the shared failure state with a Retry that re-issues the load (R6/NFR-base-5) |
 *
 * "We could not load this" and "there is nothing here" are different facts about the world, so
 * the empty state raises no alert and offers no retry, and a response that is not a habitat list
 * is a **failure** rather than an empty reference (`useHabitats` makes that call).
 *
 * ── The design problem this screen exists to get right ──────────────────────────────────────
 *
 * Habitats cannot be added, changed or removed **anywhere in this app**, because only
 * `GET /v1/habitats` exists on the backend (R16/BR7). That has to read as deliberate rather than
 * unfinished, so nothing here is a placeholder for a control that never arrives: no Actions
 * column, no disabled buttons, no row menus, no "coming soon". The copy names habitats as
 * reference data and animals as the records this app keeps — which is the honest description of
 * the app's capabilities. It is framed as a property of the app, never of the reader: there is no
 * login, no role and no permission in this project (BR15), so nothing may suggest that some
 * other user could edit habitats.
 */

import { EmptyState } from '@/components/feedback/EmptyState';
import { FailureState } from '@/components/feedback/FailureState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { HabitatReference } from '@/components/habitats/HabitatReference';
import { useHabitats } from '@/hooks/use-habitats';

/**
 * User-visible copy.
 *
 * The intro does the AC-5 work: it says what habitats are *for* in this app, so a reader
 * understands the list is complete as it stands rather than waiting for controls. The empty and
 * failure wordings are deliberately unalike, and neither borrows the other's.
 */
const PAGE_TITLE = 'Habitats';
const PAGE_INTRO =
  'Every habitat an animal can live in. Habitats are reference data in the Zoo Animal Manager — it keeps the animal records, and shows the habitats they are assigned to.';

const NO_HABITATS_TITLE = 'No habitats recorded';
const NO_HABITATS_DETAIL =
  'The backend holds none, so there is nowhere for an animal to be assigned. Each habitat appears here as soon as it exists in the backend.';

const HABITATS_FAILED_TITLE = 'The habitat reference could not be loaded';

const LOADING_LABEL = 'Loading habitats';

export default function HabitatsPage() {
  const { state, reload } = useHabitats();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-secondary text-h3 tracking-tight">{PAGE_TITLE}</h1>
        <p className="text-body text-muted-foreground max-w-3xl">
          {PAGE_INTRO}
        </p>
      </div>

      {state.status === 'loading' && (
        <LoadingState label={LOADING_LABEL} rows={3} />
      )}

      {state.status === 'failed' && (
        <FailureState
          title={HABITATS_FAILED_TITLE}
          detail={state.detail}
          onRetry={reload}
        />
      )}

      {state.status === 'loaded' &&
        (state.habitats.length === 0 ? (
          // Nothing to offer beyond the fact itself: there is no habitat to create, so an
          // "Add the first habitat" call to action here would be a dead end (R16/BR7).
          <EmptyState
            title={NO_HABITATS_TITLE}
            description={NO_HABITATS_DETAIL}
          />
        ) : (
          <HabitatReference habitats={state.habitats} />
        ))}
    </div>
  );
}
