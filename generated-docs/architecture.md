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

A body the route handler itself refuses (unreadable JSON, or invalid per `animalWriteSchema`) answers
the same way — HTTP 200 + an **`Error`** envelope, never `400` and never `Warning`. `400` would make
the client throw; `Warning` is the duplicate-name rejection the form shows against its **Name** entry
(R20), which a malformed request is not.

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
| Toast notifications | `web/src/contexts/ToastContext.tsx`, `web/src/components/toast/` | `useToast()` / `showToast({ variant, title, message })`. Use for every write confirmation and failure. Do not add a second notification system. Four variants — `success` / `error` / `warning` / `info`. **The announcement channel is a behavioural contract, not styling:** `error` → `role="alert"` + `aria-live="assertive"`, every other variant → `role="status"` + `aria-live="polite"` (`Toast.tsx`'s `getAriaRole()` / `getAriaLive()`), and epic 1's story-9 test locates a failed removal by `role="alert"`. Also pinned: `aria-label="Dismiss notification"` on the control, `aria-label="Notifications"` on the container region, and `ToastContainer` rendering **`null`** while there is nothing to announce (so a spec asserts the region's *absence*, never an empty region). **Colours are theme tokens only** — `--card` / `--card-foreground` surface, `--border` hairline, a `border-l-4` accent per variant (`--destructive` / `--success` / `--warning`, and `--muted-foreground` for `info` so no accent is ever the brand orange), `--muted-foreground` for the message and dismiss control. There is deliberately **no** variant→colour map in `types/toast.ts`; `Toast.tsx` is the single place a notification's colour is decided. |
| `DefaultResponse` type | `web/src/types/api.ts` | **Canonical.** Not re-emitted in `api-generated.ts`. |
| Validation helpers | `web/src/lib/validation/schemas.ts` | `validateRequest()` / `validateRequestAsync()` / `formFieldSchemas`, plus this project's own `animalFormSchema` / `AnimalFormValues` / `EMPTY_ANIMAL_FORM` / `animalWriteFromForm()` — the five-field write surface, its rules, and the string→number mapping to `Required<AnimalWrite>` — and `animalWriteSchema` / `AnimalWriteBody`, the **wire** shape the server tier validates (`Age`/`HabitatId` as integers, `Age` ≥ 0, `HabitatId` positive, unknown keys stripped): use that one for anything validating a request body, and `animalFormSchema` (five strings) for anything validating what a person typed — and `animalFormFromRecord(animal)`, the mirror mapping that turns a stored `AnimalRead` into the five string entries an edit form starts from (a missing field becomes an empty entry, refused on save rather than written back). The template's email/password/userId schemas are unused by this project. |
| Shadcn primitives | `web/src/components/ui/` | Present: `button`, `card`, `input`, `label`, `table`, `skeleton`, `alert`, `select`, `form`, `alert-dialog`, `dropdown-menu`. Add others via the CLI (Critical Rule 1) — never hand-roll; `--yes` does NOT cover the "file already exists, overwrite?" prompt a dependency triggers, so pipe `yes n |` and re-format the output with `prettier --write` (the CLI's output is not Prettier-formatted and `format:check` gates it). Note `CardTitle` and `AlertDialogTitle` ship `font-semibold`; the brand uses weights 400/500 only, so override with `font-medium` if you use them. A Vitest file that opens `select` or an `alert-dialog` needs jsdom shims for `hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`/`scrollIntoView`/`ResizeObserver` (Radix uses all five); `Label asChild` renders label typography on a `<span>` when the thing being named is a button rather than a labelable control. **Three primitives diverge from the CLI default and must be re-applied if the CLI ever regenerates them.** (1) `button`'s `destructive` variant — `text-destructive-foreground` instead of a hard-coded `text-white`, and no `dark:bg-destructive/60`: a partial-opacity fill composites the token against the surface behind it and drops the paired foreground to ~3:1, so the verified destructive pair would never be the one on screen. (2) `alert`'s `destructive` variant — the description is `text-destructive`, not the CLI's `text-destructive/90`: that alpha reads 4.98:1 on the dark card but only **4.34:1** on the light one (`--card: #ffffff`), below the 4.5:1 AA floor, and it is the description of every failed read and every technically-failed save. **Any `/NN` alpha on a colour token needs checking against BOTH themes — light has far less headroom, because the light status tokens are already near their AA floor (4.7–4.8:1) while the dark ones sit at 6.6–8.2:1.** (3) `alert-dialog`'s overlay keeps **`bg-black/50`** — the one raw colour in this project's components, and deliberate: a scrim must dim in both themes, so `bg-foreground/50` (a cream wash in dark) and `bg-background/50` (no scrim in light) are both wrong, and there is no scrim token. Do not "tokenise" it. **`dropdown-menu`'s `DropdownMenuContent` also diverges — the CLI's `DropdownMenuPrimitive.Portal` wrapper is removed**, so the menu renders in place instead of on `document.body`. Unobservable in a browser (Radix Popper is `position: fixed`, and no ancestor of this app's chrome clips or repositions it), but load-bearing for Vitest: a test that renders `RootLayout` nests the app's own `<html>`/`<body>` inside RTL's container `<div>`, and with the content mounted outside that nested tree the opening `pointerup` never returns — no DOM call, no timer, no test-timeout, the run just hangs. Anything that later needs the content to escape a clipping ancestor must re-introduce the portal with a `container` **inside** the app's tree, never `document.body`. |

### Built in this project — reuse, don't rebuild

| What | Where | Capability |
|---|---|---|
| Server tier → Linx | `web/src/lib/api/server/linx-client.ts` | `animalGetList` / `animalGetById` / `habitatGetList` / `animalCreate` / `animalUpdate` / `animalDelete`, named for the spec's `operationId`s. Injects `X-API-Key` + `LastChangedUser`, reads env per request, never throws — returns `LinxReadResult<T>` / `LinxWriteResult`. Server-only: nothing the browser runs may import it. |
| Write-result interpretation | `web/src/lib/api/write-result.ts` | `interpretWriteResponse(body, status)` → `LinxWriteResult` (`success` / `rejected` / `failed`) from `MessageType` alone; `writeResultToEnvelope()` for route handlers; `parseWriteEnvelope(body)` to recognise a `DefaultResponse` (also how a read detects "not found"); `describeUnansweredWrite(error)` → the one sentence for a write that got no answer at all (the single case a browser-side write rejects), used by every write surface so that event has one wording. Environment-neutral — the one interpretation both sides of the proxy use. |
| Backend failure wording | `web/src/lib/api/failure-messages.ts` | `BACKEND_UNREACHABLE_MESSAGE`, `API_KEY_REJECTED_MESSAGE`, `API_KEY_MISSING_MESSAGE`, `unusableResponseMessages(status)`. Never names or echoes the credential. |
| Route-handler plumbing | `web/src/lib/api/server/route-helpers.ts` | `respondToRead` / `respondToWrite` (Decision 3), `validateAnimalWriteBody` (parses **and** validates a write body against `animalWriteSchema` → `{ valid, body }` \| `{ valid, messages }`; five writable fields only, extras stripped), `respondToRefusedWriteBody`, `parseAnimalId`, and the unknown-id response. Every write handler validates through this one function — server-side validation is the last check that exists, since the backend performs none (R19). |
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
| Shared animal form | `web/src/components/animals/AnimalForm.tsx` | `<AnimalForm submitLabel initialValues? save onSaved />` — **the one form for create AND edit** (R21). Owns the five entries (`Name`/`Species`/`Age`/`Diet` as `Input`s, `Habitat` as a Shadcn `Select`), Zod validation via react-hook-form's resolver, the habitat choices from `useHabitats()`, the submit-disabled-while-in-flight state, and the outcome branch off `interpretWriteResponse` (only `Success` calls `onSaved`; a refusal keeps every value and re-enables submit). **The two refusals are presented differently, by requirement (R20/R24):** a `rejected` (`Warning`) outcome becomes the **Name** entry's own field error via `setError` — `aria-invalid` + accessible description through `FormControl`/`FormMessage`, the same wiring validation uses, and **no** form-level `role="alert"`, because it is fixable; a `failed` (`Error`, or a write that got no answer) outcome becomes a form-level destructive `Alert` that marks **no** entry, readable wording first with the backend's raw `Messages` kept below it as labelled secondary detail (Critical Rule 3). One shared "something went wrong" treatment for both is a defect. `Warning` is routed to `Name` because the backend's only rejection path is its duplicate-record check — the rule itself is the backend's and this form implements no duplicate check of its own. The caller supplies only per-mode wording, the prefill, the verb (`post`/`put`) and the destination. Contract points that are load-bearing for every consumer: field values are held as **strings** and become numbers in `animalWriteFromForm`; `Age` is a text input with `inputMode="numeric"` (a `type="number"` swallows the keystrokes whose rejection message R19 makes the only guard); the Radix trigger is named with `aria-labelledby` on its own `FormLabel`, because a `<label for>` cannot name a button and the trigger's content becomes the chosen habitat; nothing is preselected (BR5) and no habitat-creation affordance exists (R16/BR7). **The five entries render only once `useHabitats()` has answered** (a shared `LoadingState` stands in until then): Radix's `Select` can only display a prefilled `HabitatId` after the matching option exists, so a form painted earlier would show a filled-in animal with a blank habitat. Anything mounting this component with a prefill must therefore have the record in hand — `initialValues` is read once as react-hook-form's defaults and a later value is ignored. **A prefilled `HabitatId` that is not among the loaded habitats is cleared and the entry carries a "no longer on record, choose again" field error**, so the displayed value and the submitted value always agree and the mandatory-habitat rule blocks the save itself — never write an unresolvable `HabitatId` back (BR5), and never substitute or preselect one. |
| Confirmed animal removal | `web/src/components/animals/RemoveAnimalAction.tsx` | `<RemoveAnimalAction animalId animalName onRemoved />` — the destructive-write counterpart to `AnimalForm`: owns the trigger **button** (never a link — an unrecoverable delete must not be reachable by URL), the Shadcn `AlertDialog` confirmation (names the animal and states in words that the removal cannot be undone, R22 — a generic "Are you sure?" is not a confirmation of anything), the browser-side `del(animalEndpoint(id))` with no body and no change-name, and the outcome branch off `interpretWriteResponse`. Only `Success` calls `onRemoved`; a `Warning` becomes a warning toast led by the backend's own sentence, an `Error`/unanswered write an error toast with readable wording first and the raw backend text as labelled detail — and **both refusals name the animal**, because the confirmation has closed by the time the toast is read. The confirm control is a plain `Button variant="destructive"` rather than `AlertDialogAction`, which would close the dialog before the backend answered; it is disabled in flight while Cancel stays live (no request timeout exists). Caller supplies only which animal and where a removed animal lands. |
| Roster narrowing rules | `web/src/lib/animals/roster-filters.ts` | `habitatsInRoster(animals)` → the distinct `HabitatName`s the loaded roster occupies, sorted; `filterRoster(animals, { term, habitat })` → case-insensitive **substring** match on Name **or** Species, **intersected** with an exact habitat. Pure, React-free, fetch-free: narrowing is always derived state over the roster already in memory, never a request (BR6). |
| Roster filter controls | `web/src/components/animals/RosterFilters.tsx` | Controlled search box (named by a real `<Label>`, `type="search"`) + Shadcn `Select` habitat filter named with `aria-labelledby` (a `<label for>` cannot name Radix's button trigger, whose content is the selected value) and an "All habitats" reset option. Choices are passed in — this component never fetches. **A habitat _filter_ derives its choices from the loaded roster; a habitat _picker_ in a create/edit form must read `/api/habitats` instead, or an unoccupied habitat could never be assigned.** |
| Theme contract | `web/src/lib/theme/theme-preference.ts` + `theme-init-script.ts` | The single source for Decision 4: `THEME_STORAGE_KEY`, `LIGHT_THEME` / `DARK_THEME`, `DARK_THEME_CLASS`, `SYSTEM_DARK_MEDIA_QUERY`, plus `readStoredPreference()` / `writeStoredPreference()` (System **removes** the key), `systemPrefersDark()`, `subscribeToSystemDarkChanges()`, `resolveTheme(preference, prefersDark)` and `applyResolvedTheme()` — which writes the class **only when it is actually wrong**, because setting a `class` attribute to the value it already holds still notifies a `MutationObserver` and story 1's no-flash assertion reads exactly those notifications. `THEME_INIT_SCRIPT` is the inline `<head>` script source, with every contract value interpolated from the same constants. React-free and environment-neutral: safe to import from a server component, and total where `localStorage` throws or `matchMedia` is absent (jsdom). **Never hardcode the key, the stored values or the class.** |
| Theme control | `web/src/components/layout/ThemeControl.tsx` | `<ThemeControl />` — the icon dropdown offering Light / Dark / System, mounted inside `AppNav`'s existing `<nav aria-label="Sections">` (the only button there; the two sections stay links). Named by `aria-label` because the icon is decorative, and the active choice is published as `aria-checked` by `DropdownMenuRadioGroup` — never a highlight or a bare tick. Reads and writes the theme only through `useTheme()`, so a pick applies in the same document with no navigation or reload. The trigger icon is swapped by the `dark` class itself (`dark:hidden` / `hidden dark:block`) rather than from state, so it is correct at the first paint and cannot mismatch during hydration. |
| Theme state | `web/src/contexts/ThemeContext.tsx` | `ThemeProvider` (mounted in `layout.tsx`, outside `ToastProvider`) + `useTheme()` → `{ preference, resolvedTheme, setPreference }`. Owns the live `prefers-color-scheme` listener and **every class write after hydration**; the pre-paint script owns the first paint, and the hand-over is silent because both resolve through `theme-preference.ts`. Any control that shows or changes the theme reads it here — never `localStorage` or `classList` directly. |
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

## Decision 4 — The theme contract

**Introduced by:** `theme-switching` story 1. Settled by the orchestrator before the remaining specs
were generated, because story 1's spec pinned a storage key and story 2's did not — this is the binding
version, and every story, spec and component in the epic must use it.

| | |
|---|---|
| **Storage key** | `localStorage['theme']` — production code must export a `THEME_STORAGE_KEY` constant; nothing may hardcode the string |
| **Stored values** | `'light'` or `'dark'` only |
| **"Follow the OS"** | represented by **absence of the key**. Choosing *System* **clears** it. There is no stored `'system'` string |
| **Applied class** | `dark` on `<html>`. Light is the **absence** of that class — there is no `light` class |
| **OS source** | `window.matchMedia('(prefers-color-scheme: dark)')`, for both the pre-paint read and the live listener |
| **Storage may throw** | private browsing / blocked storage. Fall back to `prefers-color-scheme`; a throw inside the pre-paint script takes the class with it and breaks the first paint |

**The pre-paint script must run before `<body>` is parsed** — an inline `<script>` in `<head>`, or at the
very top of `<body>` ahead of the shell. `next/script` with `afterInteractive`, a client-component
effect, or anything hydration-timed fails story 1's AC-2, which asserts the resolved class is already
correct at parser-time checkpoints where `document.readyState === 'loading'`.

**As implemented (story 1) — structure stories 2–5 must not disturb.** `layout.tsx` renders an explicit
`<head>` holding the inline script (verified: Next 16 keeps its own metadata in that head, `<title>`
included), and `<html>` carries **no** server-rendered theme class — only `lang="en"`, the three
`next/font` variable classes and `suppressHydrationWarning`. Of the two placements the spec allows, only
`<head>` was safe: at the probe's `body` checkpoint the class must already be resolved, and a script at
the top of `<body>` runs *after* the parser has inserted `<body>`. A consequence worth knowing: with
JavaScript disabled nothing sets the class, so the app renders in light.

### `suppressHydrationWarning` is required but **not assertable**

React treats it as a reserved prop and **never writes it to the DOM** (verified in
`react-dom-client.development.js` — `setProp` hits a bare `break`); it is stripped in `renderToString`
too. So story 1's developer must add it to `<html>`, but no test at any layer can hold them to it. It is
a **code-review** item, not a test target. Do not write a test that appears to check it — such a test
can never fail.

### Testing the theme

- **Never assert colours, hex values or computed styles** (`.claude/policies/styling-centralisation.md`).
  Assert the *mechanism*: presence/absence of the `dark` class, and whether it changed.
- Playwright emulates the OS setting with `colorScheme` / `page.emulateMedia({ colorScheme })` — that is
  how OS-following and the light-theme scans are exercised. No manual OS switching.
- jsdom implements **no** `matchMedia`. Any Vitest file that renders the shell must shim it in
  `beforeAll` (reporting `matches: false`, never firing a change) or the whole shell throws on render.
  Radix's `dropdown-menu` additionally needs the four pointer/scroll shims epic 1 already uses for
  `select` and `alert-dialog`.
- **The light-theme axe scan belongs to story 5**, not story 1 — light is still unfixed at story 1, so a
  both-themes scan there would be red until story 5 lands. Epic 1's dark-only scan in
  `epic-zoo-animal-manager-story-2-app-shell-and-roster.spec.ts` stays where it is.

### ⚠ Epic 1's axe baseline will start measuring the LIGHT roster

Playwright's default `colorScheme` is **`'light'`**, and epic 1's story-2 axe test emulates none — it
passed only because `layout.tsx` hardcoded the dark class. Once story 1 makes the theme OS-driven, that
same test begins scanning the app in **light**.

**This is a feature, not a break.** It becomes an early-warning signal for light-theme contrast, and it
is precisely what should fail if a light surface carries orange text. So:

- **Do not** emulate dark into epic 1's spec to keep it quiet, and do not loosen its tags. That would
  hide the exact defect this epic exists to prevent.
- **Do** expect it to be red between stories 1 and 4/5, and fix it by fixing the colours — which is
  stories 4 and 5's whole job.
- The per-story light gate only runs lint + test-quality, so this won't surface until the epic-end
  Playwright run, by which point stories 4 and 5 will have landed.

**Outcome (story 4): this worked exactly as intended and is now green again.** The scan caught one
real light-theme violation, and only one — `color-contrast` at **4.34:1** (`#ce4e51` on `#ffffff`,
expected 4.5:1) on the destructive `AlertDescription`, in the **failed-load** state the spec scans
alongside the populated roster. Cause: `alert.tsx`'s CLI-default `text-destructive/90` alpha (see the
Shadcn primitives row). Fixed by dropping the alpha; both scanned states pass in light. So story 5's
both-themes scan starts from a green light baseline, and the roster's own light colours — the
`text-primary` name links (5.4:1), `--muted-foreground` body copy (5.5:1 on the page, 5.8:1 on a
card) and table text (19:1) — needed no change.

### Surface separation is token-level, and deliberately symmetric between themes

Measured across every screen in story 4's light audit: the hairline that separates a surface from
the page behind it is **equally faint in both themes** — `--border` is 1.38:1 on the light page
(`#dad6cb` on `#fff9ec`) and 1.58:1 on the dark one (`#333333` on `#090909`); an input's boundary is
1.45:1 on the light card and 1.41:1 on the dark one. Light additionally gets Tailwind's black-based
`shadow-*`, which is near-invisible on `#090909`, so if anything light is the better-defined of the
two.

So **"the borders are too faint in light" is a token complaint, not a component one.** The fix is
`--border` / `--input` under `:root` in `design-tokens.css`, applied once; adding a per-component
border, ring or `bg-*` lift to one card or one input is not. Every surface in this app
(`Card`, `Toast`, `AlertDialogContent`, `SelectContent`, `DropdownMenuContent`) already carries a
`border` in both themes — none relies on being lighter than the page.

Corollary for anything that composites: `--card` (`#ffffff`) is **lighter** than the light page
(`#fff9ec`), so light does have a raised direction available — but at 1.05:1 it is not a usable
separation cue on its own. Only the border is.

### The both-themes axe scan (story 5) — proven to bite, and what it cannot see

`epic-theme-switching-story-5-light-states-and-a11y.spec.ts` runs the WCAG 2.1 AA scan as
`colorScheme` **`light` × `dark`** over five surfaces (roster, roster failed-to-load, an animal's
detail, habitats, the add form), each on its own page, asserting the resolved theme *before* each
scan. Epic 1's baseline is extended, never replaced.

**It bites — verified, not assumed.** Adding `text-brand-primary` to `FailureState`'s `AlertTitle`
and rebuilding turns the **light** half red (`color-contrast`, serious, on the alert title) while the
**dark** half still passes: orange is 2.7:1 on the light card and ~5.8:1 on the dark one. That
asymmetry is the entire reason the scan is parameterised. Re-run that one-line mutation if the scan's
value is ever doubted — a green both-themes run is otherwise indistinguishable from a vacuous one.

**What it does not cover.** Only those five surfaces in their default state. The states story 5 is
*about* — both empty states, "no matches", not-found (detail and edit), every loading placeholder,
and `AnimalForm`'s two refusals — are **unscanned**, because reaching them needs interception the
scan does not install. A contrast regression there is caught by eye at the manual-test gate, not by
any gate.

### Light's non-happy states needed no per-state fix (story 5)

Measured in a real browser against a production build, in both themes, across every state above:
each one is expressed purely in swapped semantic tokens, so nothing was tuned for dark and nothing
inverted badly on cream. In light, every text pair is **≥5.05:1** — destructive on the white card
5.05, muted body copy 5.79, `--primary` links 5.40, ink 18.98.

Two specifics worth not re-deriving:

- **The skeleton does not vanish on cream.** `Skeleton` is `bg-accent`, which is ~10% of the
  foreground over the background in *both* themes — 1.24:1 on the light page vs 1.35:1 on the dark
  one, and 1.30 vs 1.20 on a card. So it goes *darker* on cream rather than lighter, which is the
  failure mode the story was written to catch. Light is the better of the two on a card.
- **Both `AnimalForm` refusals are `--destructive` in both themes**, never the brand orange
  (AC-4/BR5): the duplicate-name `Warning` as the Name entry's own `FormMessage` + `aria-invalid`
  border (5.05:1 in light, 5.87:1 in dark), the technical `Error` as the form-level `Alert`.

### Nav shape the theme control must respect

The nav landmark holds **exactly two links** (`Animals`, `Habitats`) — pinned by epic 1 and re-pinned by
this epic's baseline. So the theme control must be a **button** (a dropdown trigger), never an anchor,
and there must be exactly **one** button in the nav — a three-inline-button toggle group fails. The
active option must declare itself through **semantics** (`aria-checked` on `menuitemradio` is the
expected route), never by highlight or a bare tick with no ARIA state.

---

## Cross-epic debt

- **`web/src/components/ui/form.tsx` emits a dangling `aria-describedby`.** `FormControl`
  unconditionally points at `${id}-form-item-description`, but no screen in this project renders
  `FormDescription`, so every entry on `AnimalForm` carries a broken ARIA reference. Harmless in
  practice — screen readers ignore missing IDs, and the pinned `toHaveAccessibleDescription`
  assertions are unaffected — but it is a real broken reference. **Deliberately not fixed:** this is
  verbatim Shadcn CLI output and `FormControl` cannot detect whether a description was rendered, so
  any fix diverges from the generated primitive (the same class of divergence as `button.tsx`'s
  destructive variant). Worth revisiting if a screen ever adds `FormDescription`, or on the next
  Shadcn upgrade. Found by the epic-end code review, severity low.

- **An `outline` button's boundary is below WCAG 2.1 SC 1.4.11's 3:1, in both themes.**
  `button.tsx`'s `outline` variant fills with `bg-background` — *identical* to the page — so its only
  boundary is `--border`: **1.38:1** in light and **1.24:1** in dark, measured on `FailureState`'s
  Retry control (the most consequential instance; `Cancel`, `Edit animal` and the dialog's Cancel are
  the same variant). SC 1.4.11 asks for 3:1 on the visual information that identifies a control.
  **Deliberately not fixed in story 5:** it is theme-symmetric and pre-dates this epic, so it is not
  a light-theme defect, and the boundary is a *token* value — lifting it for one control class would
  diverge from `--border` app-wide. axe cannot detect boundary contrast, so no gate catches it
  either. This needs a design decision, not a patch.

_Open items that later work should close._

- **`api-generated.ts` marks every field optional**, faithfully reflecting a spec with no `required:`
  arrays. `AnimalWrite` therefore cannot type-enforce the five-field writable surface: the enforcement
  is `animalFormSchema` at runtime plus `animalWriteFromForm()`'s `Required<AnimalWrite>` return type
  at compile time. Anything else building a write body should return `Required<AnimalWrite>` too.
- **The spec declares no `required:` fields and the backend validates nothing.** Any field-level
  guarantee in this app is the frontend's own, enforced in two places: `animalFormSchema` for what a
  person types, and `animalWriteSchema` in the route handler for every request body regardless of
  what sent it.
- **`API_KEY` is not set in `web/.env.local`.** Every screen renders its failure state until a real
  key is pasted in; no automated test can catch this, since all of them stub the key.
- **The proxy itself is covered only by `web/src/__tests__/integration/api-route-handlers.test.ts`.**
  The story test files mock `@/lib/api/client` and the Playwright specs intercept `/api/*`, so neither
  layer exercises a route handler. Extend that file rather than assuming a story test covers it.
