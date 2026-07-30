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

### The `buildUrl()` trap — closed in story 1

`buildUrl()` in `web/src/lib/api/client.ts` used to prefix `API_BASE_URL` onto **every** endpoint, so a
browser-side `get('/api/animals')` resolved to `http://localhost:10002/crud-patterns/api/animals` —
leaking the Linx base URL to the browser and dying on CORS. Both test layers could pass while the
deployed app was broken (Vitest mocks `get`; Playwright's glob matches the wrong absolute URL too).

**Now:** no base URL is prefixed — an endpoint is used as given, and `buildUrl()` **throws** on
anything that is not a root-relative path (absolute URLs and protocol-relative `//host/...`). The
resolved URL is asserted in `web/src/__tests__/integration/api-client.test.ts`.

Rules that follow: browser-side endpoints are always `/api/...`; the Linx base URL is consumed only by
`web/src/lib/api/server/linx-client.ts`.

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

As implemented: a successful read's body is passed through **verbatim**; a failed read answers HTTP 500
with an `Error` envelope (the single failure shape this backend produces, NFR-base-6), and a path
segment that cannot be an animal id answers 404 with the same envelope shape.

**Not-found is decided from the body, not the status** (BR9 — the backend has no clean 404 path): a
successful read is an unwrapped `AnimalRead`, so an empty object, or a body carrying `MessageType`,
means "not found" rather than a retryable failure.

That leaves one ambiguity on the single-animal read, since a missing record and a broken backend both
arrive as HTTP 500 + an `Error` envelope. The discriminator is **whose words the message is**: the
app's own infrastructure wording (`failure-messages.ts`, plus `unusableResponseMessages()`) means the
request never got an answer about the record → the retryable **failed** state; anything else came
from the backend talking about this specific read → **not found**, which no retry can fix.
`isInfrastructureReadFailure()` in `web/src/lib/api/read-failure.ts` owns that call; every
single-record read uses it rather than re-deciding.

---

## Reusable code

### Already in the template — extend, don't duplicate

| What | Where | Note |
|---|---|---|
| Toast notifications | `web/src/contexts/ToastContext.tsx`, `web/src/components/toast/` | `useToast()` / `showToast({ variant, title, message })`. Use for every write confirmation and failure. Do not add a second notification system. |
| `DefaultResponse` type | `web/src/types/api.ts` | **Canonical.** Not re-emitted in `api-generated.ts`. |
| Validation helpers | `web/src/lib/validation/schemas.ts` | `validateRequest()` / `validateRequestAsync()` / `formFieldSchemas`, plus this project's own `animalFormSchema` / `AnimalFormValues` / `EMPTY_ANIMAL_FORM` / `animalWriteFromForm()` — the five-field write surface, its rules, and the string→number mapping to `Required<AnimalWrite>` — and `animalFormFromRecord(animal)`, the mirror mapping that turns a stored `AnimalRead` into the five string entries an edit form starts from (a missing field becomes an empty entry, refused on save rather than written back). The template's email/password/userId schemas are unused by this project. |
| Shadcn primitives | `web/src/components/ui/` | Present: `button`, `card`, `input`, `label`, `table`, `skeleton`, `alert`, `select`, `form`. Add others via the CLI (Critical Rule 1) — never hand-roll; `--yes` does NOT cover the "file already exists, overwrite?" prompt a dependency triggers, so pipe `yes n |` and re-format the output with `prettier --write` (the CLI's output is not Prettier-formatted and `format:check` gates it). Note `CardTitle` ships `font-semibold`; the brand uses weights 400/500 only, so override with `font-medium` if you use it. A Vitest file that opens `select` needs jsdom shims for `hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`/`scrollIntoView`/`ResizeObserver` (Radix uses all five); `Label asChild` renders label typography on a `<span>` when the thing being named is a button rather than a labelable control. |

### Built in this project — reuse, don't rebuild

| What | Where | Capability |
|---|---|---|
| Server tier → Linx | `web/src/lib/api/server/linx-client.ts` | `animalGetList` / `animalGetById` / `habitatGetList` / `animalCreate` / `animalUpdate` / `animalDelete`, named for the spec's `operationId`s. Injects `X-API-Key` + `LastChangedUser`, reads env per request, never throws — returns `LinxReadResult<T>` / `LinxWriteResult`. Server-only: nothing the browser runs may import it. |
| Write-result interpretation | `web/src/lib/api/write-result.ts` | `interpretWriteResponse(body, status)` → `LinxWriteResult` (`success` / `rejected` / `failed`) from `MessageType` alone; `writeResultToEnvelope()` for route handlers; `parseWriteEnvelope(body)` to recognise a `DefaultResponse` (also how a read detects "not found"). Environment-neutral — the one interpretation both sides of the proxy use. |
| Backend failure wording | `web/src/lib/api/failure-messages.ts` | `BACKEND_UNREACHABLE_MESSAGE`, `API_KEY_REJECTED_MESSAGE`, `API_KEY_MISSING_MESSAGE`, `unusableResponseMessages(status)`. Never names or echoes the credential. |
| Route-handler plumbing | `web/src/lib/api/server/route-helpers.ts` | `respondToRead` / `respondToWrite` (Decision 3), `readAnimalWriteBody` (five writable fields only), `parseAnimalId`, and the unknown-id / unreadable-body responses. |
| App's own API surface | `web/src/app/api/animals/route.ts`, `.../animals/[id]/route.ts`, `.../habitats/route.ts` | `GET`/`POST` on the collection, `GET`/`PUT`/`DELETE` on one animal, `GET` habitats. All six Linx operations are proxied — no further route handler is needed by any later story. |
| Browser-side client | `web/src/lib/api/client.ts` | `get` / `post` / `put` / `del` against same-origin `/api/*` only; failures become an `APIError` whose message comes from the response envelope, carrying `messageType`. No credential and no change-name parameter exists. |
| Linx base-URL default | `web/src/lib/utils/constants.ts` | `LINX_API_BASE_URL_DEFAULT` — server-consumed only. (Replaces the template's `API_BASE_URL`.) |
| Browser endpoint paths | `web/src/lib/api/endpoints.ts` | `ANIMALS_ENDPOINT`, `HABITATS_ENDPOINT`, `animalEndpoint(id)` — the app's own root-relative `/api/*` paths. Never write an endpoint string inline. |
| Screen routes | `web/src/lib/routes.ts` | `ANIMALS_ROUTE` (`/`), `HABITATS_ROUTE`, `ANIMAL_CREATE_ROUTE` (`/animals/new`), `animalDetailRoute(id)`, `animalEditRoute(id)` (built from the detail route, so a form can never hang off a different path than its record) — the pages a person navigates to. Also `routeSegment(params.x)`: one dynamic segment out of `useParams()` narrowed to a string (arrays and absent values handled once), used by every screen that reads an id from its route. |
| App shell | `web/src/components/layout/AppShell.tsx` + `AppNav.tsx` | Owns the **single** `<main>` landmark and the only `navigation` landmark (Animals / Habitats, current section marked with `aria-current="page"`). Mounted by `layout.tsx` inside `ToastProvider`. **No page may render its own `<main>`.** |
| Read-state components | `web/src/components/feedback/` | `LoadingState` (`role="status"` + an accessible name saying what is loading, over Shadcn skeletons), `EmptyState` (quiet card — no `alert`, no retry), `FailureState` (destructive `Alert` + an adjacent Retry button, outside the live region). Every read screen renders these three rather than inventing its own; keep each screen's empty and failure wording distinct from one another. |
| Animal roster table | `web/src/components/animals/AnimalRosterTable.tsx` | Shadcn `Table` with Name / Species / Age / Habitat / Diet; Name is an anchor to `animalDetailRoute(Id)`; never re-sorts, never filters, never drops a row. Absent fields go through the shared display helpers below. |
| Recorded-field display | `web/src/lib/animals/animal-display.ts` | `NOT_RECORDED`, `recordedText` / `recordedNumber` / `recordedYears` ("6 years"), `animalDisplayName(animal)` (falls back to `Animal {Id}` so a heading/link always has a name). Every field on the generated types is optional, so this is how a gap renders — never `undefined` / `NaN`. **`recordedText` returns the value verbatim**: nothing here reformats, which is what keeps `LastChangedDate` un-reconverted (BR13). The `recorded*` helpers are entity-neutral despite the path — the habitats screen uses them too, so a gap reads identically on every screen. React-free, fetch-free. |
| One animal's record | `web/src/components/animals/AnimalRecord.tsx` | `<dl>` in a Shadcn `Card`: `<dt>` label + `<dd>` value per field, values asserted against their own labels by both test layers. Owns the two audit-field rules — `LastChangedDate` rendered character-for-character with the zone named in the **label** (`Last changed (SAST)`), and `LastChangedUser` labelled `System source` with no attribution phrasing anywhere (BR13/BR14). No `new Date` / `Intl` / date library may enter this file. |
| Roster loading + retry | `web/src/hooks/use-animal-roster.ts` | `useAnimalRoster()` → `{ state: loading \| loaded \| failed, reload }`. One request per attempt (filtering must work over `state.animals` in memory, never re-fetch), `Array.isArray(body.Animals)` shape guard so a non-roster body is a **failure** not an empty zoo, and stale/unmounted responses are discarded. |
| One animal loading + retry | `web/src/hooks/use-animal-detail.ts` | `useAnimalDetail(id)` → `{ state: loading \| loaded \| not-found \| failed, reload }`. Same attempt-counter/unmount guards as the roster hook. Owns the BR8/BR9 shape reading: an envelope body or an object with no `Id`/`Name` is **not-found**, and a rejection is split by `isInfrastructureReadFailure()`. Any screen needing one animal (detail, edit) uses this rather than calling `get(animalEndpoint(id))` itself. |
| Habitats loading + retry | `web/src/hooks/use-habitats.ts` | `useHabitats()` → `{ state: loading \| loaded \| failed, reload }`. Same attempt-counter/unmount guards as the roster hook, and the same `Array.isArray(body.Habitats)` shape guard so a non-list body is a **failure** not an empty zoo. No `not-found` state — a collection read has none. **Anything needing the full habitat list reads it here**, including a create/edit form's habitat picker; do not call `get(HABITATS_ENDPOINT)` directly and do not derive a picker's options from the roster (see the filter-vs-picker rule below). |
| Habitat reference table | `web/src/components/habitats/HabitatReference.tsx` | Shadcn `Table` with Name / `Last changed (SAST)` / `System source`, a visible caption stating the whole set is present, and the BR14 fixed-deployment-name note. **Ships no add/edit/delete affordance and no Actions column by requirement** (R16/BR7 — habitats are read-only on the backend, a capability limit rather than a permission rule), and no column-sort controls. Same two audit rules as `AnimalRecord`: date printed character-for-character with the zone in the heading, `LastChangedUser` never phrased as attribution. No `new Date` / `Intl` / date library may enter this file. |
| Shared animal form | `web/src/components/animals/AnimalForm.tsx` | `<AnimalForm submitLabel initialValues? save onSaved />` — **the one form for create AND edit** (R21). Owns the five entries (`Name`/`Species`/`Age`/`Diet` as `Input`s, `Habitat` as a Shadcn `Select`), Zod validation via react-hook-form's resolver, the habitat choices from `useHabitats()`, the submit-disabled-while-in-flight state, and the outcome branch off `interpretWriteResponse` (only `Success` calls `onSaved`; a refusal keeps every value and re-enables submit). **The two refusals are presented differently, by requirement (R20/R24):** a `rejected` (`Warning`) outcome becomes the **Name** entry's own field error via `setError` — `aria-invalid` + accessible description through `FormControl`/`FormMessage`, the same wiring validation uses, and **no** form-level `role="alert"`, because it is fixable; a `failed` (`Error`, or a write that got no answer) outcome becomes a form-level destructive `Alert` that marks **no** entry, readable wording first with the backend's raw `Messages` kept below it as labelled secondary detail (Critical Rule 3). One shared "something went wrong" treatment for both is a defect. `Warning` is routed to `Name` because the backend's only rejection path is its duplicate-record check — the rule itself is the backend's and this form implements no duplicate check of its own. The caller supplies only per-mode wording, the prefill, the verb (`post`/`put`) and the destination. Contract points that are load-bearing for every consumer: field values are held as **strings** and become numbers in `animalWriteFromForm`; `Age` is a text input with `inputMode="numeric"` (a `type="number"` swallows the keystrokes whose rejection message R19 makes the only guard); the Radix trigger is named with `aria-labelledby` on its own `FormLabel`, because a `<label for>` cannot name a button and the trigger's content becomes the chosen habitat; nothing is preselected (BR5) and no habitat-creation affordance exists (R16/BR7). **The five entries render only once `useHabitats()` has answered** (a shared `LoadingState` stands in until then): Radix's `Select` can only display a prefilled `HabitatId` after the matching option exists, so a form painted earlier would show a filled-in animal with a blank habitat. Anything mounting this component with a prefill must therefore have the record in hand — `initialValues` is read once as react-hook-form's defaults and a later value is ignored. |
| Roster narrowing rules | `web/src/lib/animals/roster-filters.ts` | `habitatsInRoster(animals)` → the distinct `HabitatName`s the loaded roster occupies, sorted; `filterRoster(animals, { term, habitat })` → case-insensitive **substring** match on Name **or** Species, **intersected** with an exact habitat. Pure, React-free, fetch-free: narrowing is always derived state over the roster already in memory, never a request (BR6). |
| Roster filter controls | `web/src/components/animals/RosterFilters.tsx` | Controlled search box (named by a real `<Label>`, `type="search"`) + Shadcn `Select` habitat filter named with `aria-labelledby` (a `<label for>` cannot name Radix's button trigger, whose content is the selected value) and an "All habitats" reset option. Choices are passed in — this component never fetches. **A habitat _filter_ derives its choices from the loaded roster; a habitat _picker_ in a create/edit form must read `/api/habitats` instead, or an unoccupied habitat could never be assigned.** |
| Read-failure wording | `web/src/lib/api/read-failure.ts` | `describeReadFailure(error)` → one curated sentence (transport failure → `BACKEND_UNREACHABLE_MESSAGE`; an envelope's own message; wrong shape → `UNUSABLE_RESPONSE_MESSAGE`). `isInfrastructureReadFailure(error)` → whether a rejected read was the plumbing (retryable) or the backend answering about the record (see Decision 3). Also `isAPIError()`. No raw backend/database text reaches a screen. |

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
9. `E2E_PROD=1` serves the **prebuilt** `.next` (`next start`, port 3100) and does not build. Run `(cd web && npm run build)` first when running a spec for a route added since the last build, or the new route answers **404** and the failure looks like an implementation bug.

---

## Cross-epic debt

_Open items that later work should close._

- **`api-generated.ts` marks every field optional**, faithfully reflecting a spec with no `required:`
  arrays. `AnimalWrite` therefore cannot type-enforce the five-field writable surface: the enforcement
  is `animalFormSchema` at runtime plus `animalWriteFromForm()`'s `Required<AnimalWrite>` return type
  at compile time. Anything else building a write body should return `Required<AnimalWrite>` too.
- **The spec declares no `required:` fields and the backend validates nothing.** Any field-level
  guarantee in this app is the frontend's own.
- **`API_KEY` is not set in `web/.env.local`.** Every screen renders its failure state until a real
  key is pasted in; no automated test can catch this, since all of them stub the key.
- **The proxy itself is covered only by `web/src/__tests__/integration/api-route-handlers.test.ts`.**
  The story test files mock `@/lib/api/client` and the Playwright specs intercept `/api/*`, so neither
  layer exercises a route handler. Extend that file rather than assuming a story test covers it.
