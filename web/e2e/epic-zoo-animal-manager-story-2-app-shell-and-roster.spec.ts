/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/page.tsx
 * - Page Action: modify_existing
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked; this spec never contacts the Linx backend and never
 *   uses the real `API_KEY` (testing-policy.md § "Playwright runs against mocks, never
 *   live").
 * - Interception happens on the app's OWN route handler — `**\/api\/animals**` — via the
 *   shared helpers in `./fixtures/api-mocks`. NOT the Linx base URL
 *   (`http://localhost:10002/crud-patterns/**`): per R1/BR1 the Linx call is made from the
 *   Next.js server tier (Node-side), which `page.route()` cannot see, so that pattern would
 *   silently match nothing and let this spec hit the real backend
 *   (architecture.md Decision 1).
 * - Implementation pattern this REQUIRES (architecture.md Decision 1): the roster's fetch
 *   of `/api/animals` must happen BROWSER-side — a `"use client"` component fetching
 *   through the API client layer. `page.route()` cannot intercept a server-component fetch
 *   or a Server Action, and `web/src/mocks/` is data-only (no MSW handlers are wired), so a
 *   server-side read would make this spec fall through to the live backend. If the roster
 *   is implemented as a server component, these tests will not pass.
 * - Response bodies come from the project-wide entity factories
 *   (`../src/mocks/data/animal` via the fixtures module), never hand-written inline, so
 *   this layer cannot drift from the Vitest layer.
 * - No cookie/storage assumptions, and no auth chain to mock: this project has no login, no
 *   session, and no userinfo endpoint (project.md §Authentication, brief BR15). No
 *   `./fixtures/credentials` import and no `context.clearCookies()` hook applies to any
 *   spec in this epic.
 *
 * E2E spec for Epic zoo-animal-manager, Story 2: App shell and animal roster home screen.
 *
 * Covers the two `playwright`-tagged criteria:
 * - AC-1 — `/` renders the roster inside the shared frame, with Animals/Habitats navigation
 *   and Animals marked current; the starter welcome page is gone; no auth affordance exists
 *   anywhere (BR15).
 * - AC-6 — the home screen exposes exactly ONE `main` landmark and passes a real-browser
 *   axe scan. This spec carries the EPIC's accessibility baseline: story 1 is non-routable
 *   and cannot (architecture.md § Playwright spec conventions #8).
 *
 * AC-2..AC-5 (field display, loading, empty, failure+retry) are jsdom-observable and live in
 * `web/src/__tests__/integration/epic-zoo-animal-manager-story-2-app-shell-and-roster.test.tsx`
 * — they are deliberately not re-asserted here.
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockAnimals, mockAnimalsFailure } from './fixtures/api-mocks';

/**
 * WCAG 2.1 Level AA — exactly the bar `NFR-base-1` sets. Axe's defaults ALSO run
 * best-practice rules, which would fail this spec on issues outside the agreed standard.
 */
const WCAG_21_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Any affordance that would imply a sign-in / account / sign-out surface. There is none in
 * this project — no login, no user store, no session, no sign-out (BR15) — and its absence
 * is a real requirement, not an omission, so it is asserted rather than assumed.
 */
const AUTH_AFFORDANCE =
  /sign[\s-]?(in|out|up)|log[\s-]?(in|out)|account|profile/i;

test.describe('Epic zoo-animal-manager, Story 2: App shell and animal roster home screen', () => {
  // AC-1
  test('the root route renders the animal roster in the shared frame, with Animals the current section and no auth affordance', async ({
    page,
  }) => {
    await mockAnimals(page);

    await page.goto('/');

    // The roster IS the home screen — a real row from the mocked response, which also
    // confirms the browser-side fetch reached the intercepted `/api/animals` handler.
    const roster = page.getByRole('table');
    await expect(roster).toBeVisible();
    await expect(roster.getByRole('cell', { name: 'Anaya' })).toBeVisible();

    // (1) The starter template's welcome page is gone — replaced, not nested (R7,
    // Critical Rule 6). Its distinctive copy lived in the template's `app/page.tsx`.
    await expect(page.getByRole('heading', { name: 'Welcome' })).toHaveCount(0);
    await expect(
      page.getByText('Replace this with your feature implementation.'),
    ).toHaveCount(0);

    // (2) The shared frame's navigation offers both sections, with Animals indicated as the
    // current one. `aria-current="page"` is the assertion because it is what conveys "you
    // are here" to assistive technology — a colour-only highlight would not.
    const nav = page.getByRole('navigation');
    const animalsLink = nav.getByRole('link', { name: 'Animals', exact: true });
    const habitatsLink = nav.getByRole('link', {
      name: 'Habitats',
      exact: true,
    });
    await expect(animalsLink).toBeVisible();
    await expect(animalsLink).toHaveAttribute('aria-current', 'page');
    // Presence and target only — `/habitats` does not exist until story 5, and this story
    // must not stub it, so the link is deliberately NOT followed.
    await expect(habitatsLink).toBeVisible();
    await expect(habitatsLink).toHaveAttribute('href', '/habitats');
    await expect(habitatsLink).not.toHaveAttribute('aria-current', 'page');

    // (3) No sign-in, account or sign-out affordance anywhere on the shell (BR15).
    await expect(page.getByRole('link', { name: AUTH_AFFORDANCE })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: AUTH_AFFORDANCE }),
    ).toHaveCount(0);
  });

  // AC-6 — the epic's accessibility baseline.
  test('the home screen exposes exactly one main landmark and has no accessibility violations', async ({
    page,
  }) => {
    await mockAnimals(page);

    await page.goto('/');

    // Exactly one `main`. The template shipped TWO — `layout.tsx` wraps children in a
    // `<main>` and `page.tsx` renders another — and two `main` landmarks fail an
    // accessibility scan (R7). The shell must resolve to a single one, so this is the point
    // of the assertion, not incidental to it.
    await expect(page.getByRole('main')).toHaveCount(1);

    // Scan a settled DOM: wait for the loaded roster, not the skeleton.
    await expect(page.getByRole('table')).toBeVisible();
    const populated = await new AxeBuilder({ page })
      .withTags(WCAG_21_AA_TAGS)
      .analyze();
    expect(populated.violations).toEqual([]);

    // Scan the failed-to-load state too — axe violations are usually state-specific, and an
    // error region plus a retry control is exactly where contrast and focus-order problems
    // hide (testing-policy.md §Accessibility). The failure BEHAVIOUR itself (AC-5) is
    // asserted in Vitest; the Retry control is only the settle anchor here.
    await mockAnimalsFailure(page);
    await page.reload();
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
    const failed = await new AxeBuilder({ page })
      .withTags(WCAG_21_AA_TAGS)
      .analyze();
    expect(failed.violations).toEqual([]);
  });
});
