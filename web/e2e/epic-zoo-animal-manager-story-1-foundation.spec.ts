/**
 * Story Metadata:
 * - Route: none — non-routable (`route: null`, `isInfrastructureOnly: true`)
 * - Target File: web/src/lib/api/server/linx-client.ts
 * - Page Action: create_new
 *
 * Mocking strategy:
 * - Not applicable to this spec — it has no live test, so it intercepts nothing.
 *   The convention it establishes for the eight sibling specs in this epic:
 *   - Backend calls are ALWAYS mocked; a Playwright spec never contacts the Linx
 *     backend and never uses the real `API_KEY`
 *     (testing-policy.md § "Playwright runs against mocks, never live").
 *   - Intercept the app's OWN route handlers — `page.route('**\/api\/animals**')`,
 *     `page.route('**\/api\/habitats**')` — NOT the Linx base URL
 *     (`http://localhost:10002/crud-patterns/**`). Per R1/BR1 the Linx call is made
 *     from the Next.js server tier (Node-side), which `page.route()` cannot see;
 *     the browser only ever talks to `/api/...`. Routing the Linx URL would silently
 *     match nothing and let a spec hit the real backend.
 *   - Implementation pattern this implies: each screen's fetch of `/api/...` must
 *     happen browser-side (a client-component fetch), because `page.route()` cannot
 *     intercept a Server Action or a server-component fetch. A server-component read
 *     would need MSW (Node) instead, and `web/src/mocks/` is currently data-only —
 *     no handlers are wired.
 *   - Response bodies come from the project-wide entity factories
 *     (`../src/mocks/data/animal`, `../src/mocks/data/habitat`), imported by RELATIVE
 *     path — never the `@/` alias, which Playwright's runtime does not resolve — and
 *     never hand-written inline, so this layer cannot drift from the Vitest layer.
 *   - There is no auth chain to mock: this project has no login, no session, and no
 *     userinfo endpoint (project.md §Authentication, brief BR15). No `identity.ts`
 *     factory exists and none should be invented; `context.clearCookies()` hooks and
 *     `./fixtures/credentials` imports are not applicable to any spec in this epic.
 *
 * E2E spec for Epic zoo-animal-manager, Story 1: Server-side backend access foundation.
 *
 * This story is NON-ROUTABLE. It builds the server tier only — the canonical API spec
 * and derived types, the Linx server client that injects `X-API-Key` and
 * `LastChangedUser`, the route handlers under `web/src/app/api/...`, and the shared
 * write-result helper. It renders nothing and adds no URL, so there is no page for a
 * browser to visit and nothing a user can observe. All five of its acceptance criteria
 * are tagged `vitest`; zero are tagged `playwright`.
 *
 * Per Critical Rule 9 the spec file still exists so the structure is in place for later
 * promotion, but every `test()` below calls `test.fixme()` in its body.
 */
import { test } from '@playwright/test';

test.describe('Epic zoo-animal-manager, Story 1: Server-side backend access foundation', () => {
  // Non-routable: the server-tier proxy and its credential injection have no UI; covered by
  // Vitest in epic-zoo-animal-manager-story-1-foundation.test.tsx (AC-1, AC-2, AC-5) and
  // exercised end-to-end through story 2's roster spec, which reads through these handlers.
  test('server tier injects X-API-Key and LastChangedUser without exposing either to the browser', () => {
    test.fixme(); // skips at runtime; behaves consistently across Playwright
    // versions, unlike the declarative test.fixme('title', fn) form
  });

  // Non-routable: write-result interpretation and connectivity-failure handling have no surface
  // of their own; covered by Vitest in epic-zoo-animal-manager-story-1-foundation.test.tsx
  // (AC-3, AC-4) and surfaced to a user first in story 8's refused-saves spec.
  test('write outcomes and connection failures resolve from the response body, not the HTTP status', () => {
    test.fixme(); // skips at runtime; behaves consistently across Playwright
    // versions, unlike the declarative test.fixme('title', fn) form
  });
});
