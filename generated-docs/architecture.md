# Architecture & Reuse Registry

Shared decisions and reusable code for this project. Agents read this before building so they
extend what exists instead of inventing a parallel version. Epic-scoped notes say which epic
introduced them.

---

## Decision 1 — Data fetching is client-side, through the app's own `/api/*` route handlers

**Introduced by:** `zoo-animal-manager` story 1 (foundation), applies to every screen in the project.

### The shape

```
browser (client component)
  → fetch('/api/animals')                     ← same-origin, no credentials in the browser
      → Next.js route handler (web/src/app/api/animals/route.ts)
          → server Linx client (web/src/lib/api/server/linx-client.ts)
              → injects X-API-Key + LastChangedUser
                  → http://localhost:10002/crud-patterns/v1/animals
```

The browser **never** learns the API key or the Linx base URL. The route handler is the only thing
that talks to Linx.

### Why client-side rather than server components

Three reasons, in order of weight:

1. **Testability.** Playwright can only intercept requests the *browser* makes. The Linx call
   happens Node-side, so `page.route('http://localhost:10002/**')` matches nothing. If screens read
   their data in a server component, every E2E spec would fall through to the **real backend** — and
   since this project has `dataSource: existing-api` with no MSW runtime layer, the write specs
   (stories 6, 7, 9) would create and delete rows in the actual database. Client-side fetching makes
   `page.route('**/api/animals**')` the interception point and keeps E2E hermetic.
2. **The approved acceptance criteria require client state.** Retry-on-failure, a loading
   placeholder distinct from empty, and "searching never triggers another data load" are all
   client-side behaviours. A server-component read cannot satisfy them without a client wrapper
   anyway.
3. **Filtering happens in the browser regardless.** The backend supports no search, filter, sort or
   paging, so the full roster must already be in browser memory for story 3 to filter it.

### What this costs, stated honestly

An extra same-origin hop, and no React Server Component streaming for the data. For an internal CRUD
tool over a small dataset this is a fair trade for hermetic tests. If the roster ever grows large
enough that this matters, the fix is server-side pagination — which needs a **backend** change
first, since Linx exposes no paging parameters.

### Rules that follow from it

- Screens that read data are **client components** (`"use client"`) fetching from `/api/*`.
  `page.tsx`'s default export must stay renderable in jsdom — **not** an `async` server component.
- **Never** call `fetch` against the Linx base URL from anything the browser runs.
- **Never** call `fetch()` directly in a component (Critical Rule 2) — go through the API client layer.
  Both test layers mock the seam `vi.mock('@/lib/api/client')`, so the client layer is also the
  agreed test boundary.
- Playwright specs intercept `**/api/animals**` / `**/api/habitats**`. **Never**
  `http://localhost:10002/crud-patterns/**` — that pattern silently matches nothing and lets the
  spec hit the real backend.

### ⚠ The `buildUrl()` trap — a green-but-wrong hazard story 1 must close

`buildUrl()` in `web/src/lib/api/client.ts` prefixes `API_BASE_URL` onto **every** endpoint. So a
browser-side `get('/api/animals')` currently resolves to
`http://localhost:10002/crud-patterns/api/animals` — the Linx host, with an `/api` path that doesn't
exist there.

**Both test layers can pass while the deployed app is broken:**

- Vitest mocks `get`, so it never sees the resolved URL.
- Playwright's `page.route('**/api/animals**')` glob **also matches the wrong absolute URL**, so the
  interception succeeds either way.

The real app would then leak the Linx base URL to the browser and die on CORS (the Linx host sends no
`Access-Control-Allow-Origin`).

**Story 1's client rework must keep `/api/*` endpoints relative and same-origin**, and that behaviour
needs a test asserting the *resolved* URL for an `/api/*` endpoint — not just the endpoint string
passed in. This is on the manual-test "check these first" list because no existing test catches it.

---

## Decision 2 — `MessageType` is the only success/failure discriminator

**Introduced by:** `zoo-animal-manager` story 1.

The backend returns **HTTP 500** for both business rejections and technical failures, and can return
`MessageType: "Success"` on a 500. Status codes are therefore useless as an outcome signal.

| `MessageType` | Meaning | How the UI treats it |
|---|---|---|
| `Success` | The write worked | Show the backend's own message; refresh the affected view |
| `Warning` | Business rejection (e.g. `"Animal already exists"`) | Recoverable, field-level, keep the user's input |
| `Error` | Technical failure; raw DB text in `Messages[0]` | Readable message, keep input, offer retry |

Casing is the backend's: `Success` / `Warning` / `Error`. Do **not** compare case-insensitively — the
template's uppercase `APIMessageType` was a defect fixed in story 1, not a convention to work around.

One shared result helper owns this interpretation. Every write path consumes it; none re-implements it.

---

## Decision 3 — Writes normalise to HTTP 200 + envelope; reads keep normal HTTP semantics

**Introduced by:** `zoo-animal-manager` story 1. Settled by the orchestrator after two parallel
test-generator runs pinned contradictory assumptions — this is the binding version.

### Writes (`POST` / `PUT` / `DELETE` on `/api/animals*`)

The app's route handler **always answers HTTP 200** and returns the `DefaultResponse` envelope
verbatim, whatever status Linx used.

Why: Linx returns 500 for business rejections, technical failures **and** sometimes success, so its
status carries no information (Decision 2). Passing it through would make the API client *throw*, and
the caller would then have to dig the envelope out of an error object to tell a fixable duplicate
name from a database fault — losing precisely the distinction the UI needs.

So on the browser side:

- the write promise **resolves** — a refused write is not an exception, it's a result
- the caller branches on `MessageType` (`Success` / `Warning` / `Error`)
- a transport-level failure (Linx unreachable, handler crashed) is the only case that rejects

**Test fixtures must therefore resolve, not reject, and be served with status 200** — including the
duplicate-name (`createDuplicateWarning()`) and technical-failure (`createWriteError()`) cases.
`mockAnimalUpdate(page, createDuplicateWarning())` with the default 200 is correct; passing `500`
would test a contract this app doesn't have.

### Reads (`GET` on `/api/animals*`, `/api/habitats`)

Ordinary HTTP semantics: 200 with the data on success, non-2xx on failure. The API client throws, and
the screen renders its failure-with-retry state. There is no envelope on a successful read —
`GET /v1/animals/{Id}` returns a bare `AnimalRead` (BR8).

**Not-found is decided from the body, not the status** (BR9 — the backend has no clean 404 path): a
successful read is an unwrapped `AnimalRead`, so an empty object, or a body carrying `MessageType`,
means "not found" rather than a retryable failure.

---

## Reusable code

### Already in the template — extend, don't duplicate

| What | Where | Note |
|---|---|---|
| Toast notifications | `web/src/contexts/ToastContext.tsx`, `web/src/components/toast/` | `useToast()` / `showToast({ variant, title, message })`. Use for every write confirmation and failure. Do not add a second notification system. |
| `DefaultResponse` type | `web/src/types/api.ts` | **Canonical.** Not re-emitted in `api-generated.ts`. |
| Validation helpers | `web/src/lib/validation/schemas.ts` | `validateRequest()` / `validateRequestAsync()` / `formFieldSchemas`. Add the animal schema alongside these. The template's email/password/userId schemas are unused by this project. |
| Shadcn primitives | `web/src/components/ui/` | Present: `button`, `card`, `input`, `label`. Add others via the CLI (Critical Rule 1) — never hand-roll. |

### Generated pre-BUILD for this epic

| What | Where |
|---|---|
| Canonical API spec | `generated-docs/specs/api-spec.yaml` — extracted from the Linx solution, `servers:` corrected |
| Generated types | `web/src/types/api-generated.ts` — `AnimalRead`, `AnimalReadList`, `AnimalWrite`, `HabitatRead`, `HabitatReadList` |
| Animal fixtures | `web/src/mocks/data/animal.ts` — `createAnimal`, `createAnimals`, `createAnimalList` |
| Habitat fixtures | `web/src/mocks/data/habitat.ts` — `createHabitat`, `createHabitats`, `createHabitatList` |
| Write-result fixtures | `web/src/mocks/data/write-result.ts` — `createWriteSuccess`, `createDuplicateWarning`, `createWriteError` |

Both test layers import the same fixtures — that shared source is what stops Vitest and Playwright
drifting onto different response bodies. `createAnimal` derives `HabitatName` from `HabitatId` so
fixtures cannot fall out of step with the habitat list; the orphaned-animal case must be constructed
deliberately (`createAnimal({ HabitatId: 999, HabitatName: undefined })`) and is never the default.

### Playwright spec conventions

Established by story 1's spec; the other eight follow them.

1. Filename `epic-zoo-animal-manager-story-<N>-<slug>.spec.ts`, slug from the story file's `Slug:` field.
2. A `Story Metadata:` header block (Route / Target File / Page Action), then a `Mocking strategy:` block, then imports.
3. Exactly one `test.describe` per spec, titled `Epic zoo-animal-manager, Story <N>: <title>`.
4. Intercept the app's own routes — see Decision 1. Use the **disjoint regexes** in
   `web/e2e/fixtures/api-mocks.ts`, not a bare `**/api/animals**` glob: that glob's trailing `**`
   also matches `/api/animals/4`, so a list interceptor and a detail interceptor overlap and the
   winner depends on registration order.
   ```ts
   const ANIMALS_LIST_ROUTE   = /\/api\/animals(?:\?[^#]*)?$/;
   const ANIMAL_DETAIL_ROUTE  = /\/api\/animals\/[^/?#]+(?:\?[^#]*)?$/;
   ```
   Available helpers: `mockAnimals`, `mockAnimalsFailure`, `mockAnimal`,
   `mockAnimalEmptyResponse`, `mockAnimalFailure`, `mockHabitats`.
5. Mock bodies come from the shared factories via **relative** import (`../src/mocks/data/animal`), not the `@/` alias.
6. **No auth chain.** No login, session, sign-out or `userinfo` exists in this project — no credential fixtures, no cookie clearing, no `identity.ts`.
7. Shared interceptors live in `web/e2e/fixtures/api-mocks.ts` once a second spec needs them.
8. The epic's axe baseline lives in **story 2's** spec — the first routable surface and the shared shell. Story 1 is non-routable and cannot carry it.

---

## Cross-epic debt

_Open items that later work should close._

- **`web/src/__tests__/integration/api-client.test.ts` must be updated by story 1's developer, not
  duplicated.** Six of its tests assert behaviour this project deliberately removes, and four will
  not compile once `lastChangedUser` / `requiresAuth` leave `APIRequestConfig`:
  the `post()`-with-`lastChangedUser` test, the `LastChangedUser`-header test, the 404 and 500
  status-code-message tests, and the whole `describe('requiresAuth flag')` block (which asserts
  `getAuthHeader()` reading browser-exposed `NEXT_PUBLIC_API_TOKEN`).
- **`api-generated.ts` marks every field optional**, faithfully reflecting a spec with no `required:`
  arrays. `AnimalWrite` therefore cannot type-enforce the five-field writable surface — the Zod
  schemas are the only enforcement. Relevant to story 6.
- **The `LAST_CHANGED_USER` default (`Animal Manager`) is not pinned by any automated test** — the
  story-1 tests stub an explicit fake value. It is covered by manual verification via story 2.
- **The spec declares no `required:` fields and the backend validates nothing.** Any field-level
  guarantee in this app is the frontend's own.
