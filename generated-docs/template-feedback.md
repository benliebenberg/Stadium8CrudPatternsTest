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

---

## `next.config.ts` `output: 'standalone'` fights `playwright.config.ts`'s `next start`

**Found:** epic `zoo-animal-manager`, story 4 (2026-07-30).

**Symptom.** Two template files ship contradictory assumptions. `next.config.ts` sets
`output: 'standalone'` (for the Docker image), while `playwright.config.ts`'s `E2E_PROD=1` path
starts the server with `npm run start` (`next start`). Next itself warns on every prod-mode E2E run:

```
"next start" does not work with "output: standalone" configuration.
Use "node .next/standalone/server.js" instead.
```

**Impact.** Cosmetic *so far* — the specs served and passed correctly here — but the warning is Next
telling us this combination is unsupported, and `E2E_PROD=1` is the path the **epic-end batched
Playwright run** uses. If a future Next version makes it a hard failure rather than a warning, every
epic-end E2E run breaks at once, and the warning is buried in `[WebServer]` output where it reads
like noise.

**Workaround used.** None needed — ran `E2E_PROD=1` as-is and ignored the warning.

**Suggested fix.** Make the two configs agree: either have the `E2E_PROD` `webServer.command` run
`node .next/standalone/server.js` (copying `public/` and `.next/static` in first, as a standalone
deploy requires), or move `output: 'standalone'` behind an env flag the Docker build sets, so local
prod-mode E2E uses an ordinary `next start` build.

---

## `E2E_PROD=1` prod-mode E2E times out on the first attempt when several spec files run together

**Found:** epic `zoo-animal-manager`, story 4 (2026-07-30).

**Symptom.** Running three spec files in one `E2E_PROD=1` invocation reported **5 flaky** — every one
of them failed its first attempt with `Test timeout of 30000ms exceeded` and passed on the retry.
Running the same spec file on its own immediately passed in 1.6s and 3.9s. So the tests are fine; the
first attempt is racing the freshly started prod server while Playwright's auto-scaled workers all hit
it at once.

**Impact.** Masked by `retries: 1` locally, but CI uses `retries: 2` with `workers: 1`, and the
epic-end batched run executes all of an epic's specs in one invocation. "Flaky" results are exactly
the signal a reader is trained to distrust, so real flakiness gets harder to spot — and if a first
attempt ever fails in a way a retry cannot recover, the failure is attributed to a story rather than
to server warm-up.

**Workaround used.** None required (retries absorbed it); confirmed per-file runs are stable.

**Suggested fix.** Give the prod `webServer` a warm-up: either raise `use.navigationTimeout` /
`expect.timeout` for the prod path, or add a `webServer` readiness probe that fetches a real route
(not just the root URL's TCP accept) before releasing the workers.
