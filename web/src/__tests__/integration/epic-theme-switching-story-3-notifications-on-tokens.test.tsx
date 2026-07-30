/**
 * Story Metadata:
 * - Route: /animals/1
 * - Target File: web/src/components/toast/Toast.tsx
 * - Page Action: modify_existing
 *
 * Epic `theme-switching`, Story 3 — notifications follow the active theme.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THESE TESTS ARE EXPECTED TO BE **GREEN BEFORE IMPLEMENTATION** — THAT IS CORRECT
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * Story 3 is a **colour-only re-skin**: `Toast.tsx` and `ToastContainer.tsx` move off raw
 * Tailwind palette utilities (`bg-white`, `border-red-500`, `text-green-500`, `text-gray-*`)
 * onto the design tokens. **No behaviour changes** — so there is no red phase to observe
 * here, and the absence of one is not a generation failure. This file is a **regression
 * harness**: its whole job is to make it impossible to change the notifications' colours and
 * accidentally change how they are *announced* or *what they say*. It must be green before
 * the re-skin and still green after it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * NO COLOUR IS ASSERTED ANYWHERE BELOW — DELIBERATELY
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * This is the one story in the epic where asserting colour is most tempting, because the
 * story *is* about colour. It is nonetheless forbidden: no hex value, no class name, no
 * `toHaveClass`, no computed style, no CSS-variable read appears in this file
 * (`.claude/policies/styling-centralisation.md`, and `architecture.md` Decision 4 §Testing
 * the theme). A test pinning `bg-card` or `#c93a3e` would break on every token tweak while
 * proving nothing a person can perceive. Only roles, `aria-live`, accessible names and text
 * are asserted.
 *
 * Whether the re-skin actually *looks* right — legible in light (AC-1), unchanged in dark
 * (AC-2), and an error accent that never reads as the brand orange (AC-6) — is judged by eye
 * at the manual-test gate. AC-5 (a real removal raising its notification on a light page)
 * belongs to this story's Playwright spec.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRACT THESE TESTS PIN — inherited from epic 1, and it must not move
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * 1. **Announcement urgency is decided by variant, and only by variant** (AC-3):
 *      - `error`   → `role="alert"`  + `aria-live="assertive"` — a failed save or removal
 *                    interrupts, because the user's change did not happen;
 *      - `success` / `warning` / `info` → `role="status"` + `aria-live="polite"` — ordinary
 *                    progress, announced when the reader next pauses.
 *    Both halves are asserted: the expected role is present **and** the other one is absent,
 *    so a re-skin that collapses the two branches into one role fails here rather than
 *    quietly making every notification interrupt (or none of them).
 *    All **four** variants are covered even though this app only ever fires success, warning
 *    and error — `Toast.tsx` styles four, so the re-skin touches four.
 *    Epic 1 depends on this directly: `epic-zoo-animal-manager-story-9-remove-animal.test.tsx`
 *    finds a failed removal by `role="alert"`, and stories 6–8 rely on the same split.
 *
 * 2. **Content survives the re-skin** (AC-4): the title always renders, the optional message
 *    renders when supplied, and the dismiss control keeps its accessible name
 *    `Dismiss notification` and still removes the notification when pressed. The container
 *    keeps its `role="region"` named `Notifications`, and renders nothing at all when there
 *    is nothing to announce.
 *
 * 3. **The toast system is not re-implemented and its public API does not move.** The real
 *    `ToastProvider` / `ToastContainer` / `Toast` are used throughout — nothing here is
 *    mocked, because the only things worth mocking would be the code under test.
 *    `showToast({ variant, title, message })` stays the way every write surface raises a
 *    notification (`architecture.md` §Reusable code); no second notification system exists.
 *
 * Notes on scope and determinism:
 * - **No `matchMedia` shim is needed**: nothing below renders the app shell or the root
 *   layout, so no render path reaches story 1's `prefers-color-scheme` read (Decision 4).
 *   Keeping the shell out is also what keeps this file a *toast* regression harness rather
 *   than a second copy of the baseline.
 * - **No timers.** Auto-dismiss is raised with `duration: 0` so nothing schedules a
 *   `setTimeout`; auto-dismiss is not part of AC-3 or AC-4, and time-driven flows belong in
 *   Playwright via `page.clock` (testing-policy §Time-dependent behaviour), never to fake
 *   timers in jsdom.
 * - Aside from urgency, the announcement wrapper's `aria-atomic` is intentionally left
 *   unpinned — AC-3 is about urgency, and over-pinning the wrapper would make this harness
 *   brittle for no gain.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Toast } from '@/components/toast/Toast';
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider, useToast } from '@/contexts/ToastContext';

import type {
  Toast as ToastNotification,
  ToastOptions,
  ToastVariant,
} from '@/types/toast';

/** The accessible name of the container's live region — pinned by epic 1. */
const NOTIFICATIONS_REGION = 'Notifications';

/** The accessible name of every notification's dismiss control — pinned by epic 1. */
const DISMISS_CONTROL = 'Dismiss notification';

type AnnouncementRole = 'alert' | 'status';

/**
 * The urgency contract, variant by variant (contract point 1). `otherRole` is what must NOT
 * be in the document for that variant, which is what stops the two branches collapsing into
 * one without a test noticing.
 */
const ANNOUNCEMENT_CONTRACT: ReadonlyArray<{
  variant: ToastVariant;
  role: AnnouncementRole;
  otherRole: AnnouncementRole;
  live: 'assertive' | 'polite';
  title: string;
}> = [
  {
    variant: 'error',
    role: 'alert',
    otherRole: 'status',
    live: 'assertive',
    title: 'Could not remove Nyala from the roster',
  },
  {
    variant: 'success',
    role: 'status',
    otherRole: 'alert',
    live: 'polite',
    title: 'Nyala was removed from the roster',
  },
  {
    variant: 'warning',
    role: 'status',
    otherRole: 'alert',
    live: 'polite',
    title: 'Nyala is already on the roster',
  },
  {
    variant: 'info',
    role: 'status',
    otherRole: 'alert',
    live: 'polite',
    title: 'The roster was refreshed a moment ago',
  },
];

/**
 * One notification, exactly as `ToastContext` builds them (`web/src/types/toast.ts`).
 * `duration: 0` disables auto-dismiss so no test below depends on the clock.
 */
function notification(
  overrides: Partial<ToastNotification> & {
    variant: ToastVariant;
    title: string;
  },
): ToastNotification {
  return {
    id: `toast-${overrides.variant}`,
    duration: 0,
    dismissible: true,
    ...overrides,
  };
}

/** Held separately so it can be asserted (and negated) without widening to `undefined`. */
const REMOVAL_DETAIL = 'The roster no longer lists this animal.';

const WITH_MESSAGE: ToastOptions = {
  variant: 'success',
  title: 'Nyala was removed from the roster',
  message: REMOVAL_DETAIL,
  duration: 0,
};

const TITLE_ONLY: ToastOptions = {
  variant: 'warning',
  title: 'Nyala could not be removed just yet',
  duration: 0,
};

/**
 * A test driver, not a stand-in for production code: it raises real notifications through the
 * real `useToast()` so the assertions below run against the actual provider → container →
 * `Toast` chain. Its own buttons are named so that nothing they say can be confused with a
 * notification's own title or dismiss control.
 */
function NotificationHarness() {
  const { showToast } = useToast();

  return (
    <>
      <button type="button" onClick={() => showToast(WITH_MESSAGE)}>
        raise first
      </button>
      <button type="button" onClick={() => showToast(TITLE_ONLY)}>
        raise second
      </button>
    </>
  );
}

/** The provider and container composed exactly as `layout.tsx` composes them. */
function renderNotificationSurface() {
  return render(
    <ToastProvider>
      <NotificationHarness />
      <ToastContainer />
    </ToastProvider>,
  );
}

describe('Epic theme-switching, Story 3: notifications keep their semantics through the re-skin', () => {
  // No `beforeEach` reset is needed: there is no store, no clock and no module mock to undo,
  // and Testing Library unmounts each render for us.

  // AC-3 — a failure is still announced urgently; success, warning and informational
  // notifications are still announced as ordinary progress.
  it('announces an error assertively and every other variant politely', () => {
    for (const {
      variant,
      role,
      otherRole,
      live,
      title,
    } of ANNOUNCEMENT_CONTRACT) {
      const view = render(
        <Toast
          toast={notification({
            variant,
            title,
            message: `Detail shown beneath the ${variant} title.`,
          })}
          onDismiss={() => undefined}
        />,
      );

      const announced = screen.getByRole(role);
      expect(announced).toHaveAttribute('aria-live', live);

      // The other urgency must be absent — this is the half that fails if the two branches
      // are ever collapsed into a single role.
      expect(screen.queryByRole(otherRole)).toBeNull();

      // And the announcement is the thing carrying the wording, not an empty wrapper beside
      // it: a live region a reader would announce as blank is not an announcement.
      expect(within(announced).getByText(title)).toBeVisible();

      view.unmount();
    }
  });

  // AC-4 — each notification still shows its title and optional message, and can still be
  // dismissed by its dismiss control, which keeps its name.
  it('shows the title and optional message inside the named notifications region, and dismisses on the dismiss control', async () => {
    const user = userEvent.setup();
    renderNotificationSurface();

    // Nothing to announce yet, so no live region exists at all.
    expect(
      screen.queryByRole('region', { name: NOTIFICATIONS_REGION }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: 'raise first' }));

    const region = await screen.findByRole('region', {
      name: NOTIFICATIONS_REGION,
    });

    // Title and message both read inside the region — scoped, so the harness buttons cannot
    // satisfy either assertion.
    expect(within(region).getByText(WITH_MESSAGE.title)).toBeVisible();
    expect(within(region).getByText(REMOVAL_DETAIL)).toBeVisible();

    // The dismiss control keeps its name, and pressing it really removes the notification —
    // the container renders nothing once the last one is gone.
    await user.click(
      within(region).getByRole('button', { name: DISMISS_CONTROL }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole('region', { name: NOTIFICATIONS_REGION }),
      ).toBeNull();
    });
    expect(screen.queryByText(WITH_MESSAGE.title)).toBeNull();

    // A notification with no message still shows its title and still offers the same control
    // — the message is optional, the title and the dismiss affordance are not.
    await user.click(screen.getByRole('button', { name: 'raise second' }));

    const secondRegion = await screen.findByRole('region', {
      name: NOTIFICATIONS_REGION,
    });
    expect(within(secondRegion).getByText(TITLE_ONLY.title)).toBeVisible();
    expect(
      within(secondRegion).getByRole('button', { name: DISMISS_CONTROL }),
    ).toBeVisible();

    // The earlier notification's message did not come back with it.
    expect(within(secondRegion).queryByText(REMOVAL_DETAIL)).toBeNull();
  });
});
