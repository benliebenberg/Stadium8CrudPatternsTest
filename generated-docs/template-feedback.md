# Template Feedback

Issues found in the **template's own** tooling/scaffolding (not this project's app code) while
building. Each entry is a symptom, where it bit, and the workaround used.

---

## `playwright.config.ts` — dev-mode E2E silently runs against an unrelated app on port 3000

**Found:** epic `zoo-animal-manager`, story 2 (2026-07-30).

**Symptom.** `npm run test:e2e` (dev mode) hard-codes port 3000 with
`reuseExistingServer: !isCI`. Another project's Next dev server was already listening on :3000, so
Playwright "reused" it and ran the specs against a completely different application. The failures
looked like app bugs — `getByRole('table')` not found, two `main` landmarks — and the page snapshot
in `test-results/.../error-context.md` showed another product's sign-in screen. Nothing in the
output says "this is not your server", so the natural reading is that the story's implementation is
broken.

**Impact.** A false failure that is expensive to interpret, and it points the reader at the wrong
file. It cost one investigation cycle here.

**Workaround used.** Ran the spec the way the epic-end batched run does — `E2E_PROD=1`, which uses
port 3100 with `reuseExistingServer: false` and so can never adopt a stray server. Both tests
passed immediately. (This means the epic-end batched run is already immune; only the ad-hoc
dev-mode command is affected.)

**Suggested fix.** Either give dev mode a project-specific port like prod mode has, or, before
reusing an existing server, fetch `url` and confirm it is this app (e.g. a known route or a
`x-powered-by`-style marker) — and fail with "port 3000 is serving a different application" rather
than running the suite against it.
