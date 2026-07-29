# Epic: Zoo Animal Manager

Inherits roles, auth, data source, compliance, and styling from project.md.

---

## Goal

A complete animal-management app over the Linx CrudPatterns API — browse and search animals, view one
animal's full record, browse habitats, and add, edit or remove animals.

This is the **only epic** in the project and the **dependency root** (`dependsOn: []`). It replaces what
was originally planned as four sequential epics (`animal-list`, `animal-detail`, `habitat-reference`,
`animal-management`) — the user chose to build the entire product surface as one epic broken into many
stories instead. All 24 requirements below belong to this single epic; the four prior epic briefs are
superseded and being deleted.

Because this epic is large, the requirements below are ordered and layered deliberately so the story
planner can slice a sensible build sequence rather than treating all 24 as an unordered bag. See
**Build Sequence & Layering** immediately below.

---

## Build Sequence & Layering

Five layers, in dependency order. Each layer builds only on the layers before it.

| Layer | Requirements | What it delivers |
|---|---|---|
| **1. Foundation** | R1–R6 | No user-visible surface of its own. Server-side proxy to Linx, canonical API spec + generated types, env-var-driven credentials and `LastChangedUser` injection, the shared write-result (`MessageType`/`Messages[]`) interpretation helper, and connectivity-failure handling. Every later layer depends on this. |
| **2. Shell + animal list (read)** | R7–R11 | The app's real home screen and nav (replacing the starter template), and the primary animal list: display, per-animal habitat name, loading/empty/error states, and client-side search/filter. |
| **3. Animal detail (read)** | R12–R14 | Single-animal full-record view, reached from the list: last-changed display (SAST, no per-person attribution), and a not-found state. |
| **4. Habitats (read-only)** | R15–R16 | The habitats reference list and the deliberate absence of any habitat write affordance anywhere in the app. Depends on Layer 1 only, but is sequenced after the animal read surfaces since habitats are secondary to the primary animal-management use case. |
| **5. Writes (create / edit / delete)** | R17–R24 | Add, edit, and delete animal, including the shared form, its validation, the habitat picker (depends on Layer 4's habitat data), duplicate-name handling, success confirmation + refresh, and technical-failure handling. This is the layer with the most business logic and depends on everything above it. |

The story planner should generally slice stories along these layer boundaries (a layer may still span
multiple stories — e.g. Layer 5 is large enough to become several), and should not schedule a Layer *N*
story ahead of an unstarted Layer *N-1* dependency it needs (e.g. the habitat picker in R18 needs the
Layer 4 habitats fetch; the shared write-result helper in R4 is needed by every story in Layer 5).

---

## Data Model

| Entity | Fields | Notes |
|---|---|---|
| `AnimalRead` | `Id: number`, `Name: string`, `Species: string`, `Age: number`, `HabitatId: number`, `HabitatName: string`, `Diet: string`, `LastChangedUser: string`, `LastChangedDate: string` | `HabitatName` arrives pre-joined (backend `INNER JOIN`s Habitat) — see R9/BR5. `LastChangedDate` arrives pre-formatted, already converted to SAST — display verbatim, never re-parse (see R13/BR13). |
| `AnimalReadList` | `Animals: AnimalRead[]` | Response body of `GET /v1/animals`. |
| `AnimalWrite` | `Name: string`, `Species: string`, `Age: number`, `HabitatId: number`, `Diet: string` | Request body shape for `POST /v1/animals` and `PUT /v1/animals/{Id}` — the entire writable surface (see R17). Never includes `Id`, `HabitatName`, or `LastChangedDate`/`LastChangedUser` — those are server- or backend-derived. |
| `HabitatRead` | `Id: number`, `Name: string`, `LastChangedUser: string`, `LastChangedDate: string` | Used both for the habitats reference list (R15) and as the choice source for the animal form's habitat picker (R18). |
| `HabitatReadList` | `Habitats: HabitatRead[]` | Response body of `GET /v1/habitats`. |
| `DefaultResponse` | `Id: number`, `MessageType: "Success" \| "Warning" \| "Error"`, `Messages: string[]` | Shared write-result envelope; body arrives on every write (success **and** failure) via HTTP `500` for failures. See R4/BR4. Correct `web/src/types/api.ts`'s `APIMessageType` in place — it currently declares uppercase values (`SUCCESS`/`ERROR`/`WARNING`) while the backend sends `"Success"`/`"Warning"`/`"Error"` (see R3). |

---

## Functional Requirements

### Layer 1 — Foundation

**R1.** All calls to the Linx backend happen through the Next.js server tier (server components and/or
route handlers under `web/src/app/api/...`), which injects `X-API-Key` server-side; the browser never
calls Linx directly (it has no CORS headers, and the shared API key must remain a server secret).

**R2.** The canonical OpenAPI 3.0.1 document is extracted from
`documentation/BackendLinx6Api/CrudPatterns.project/CrudPatterns.folder/Api.folder/CrudPatterns.service/CrudPatterns.properties`
→ `ServiceData.Properties["API definition"]` to `generated-docs/specs/api-spec.yaml`, with the
`servers:` value **corrected** to `http://localhost:10002/crud-patterns` (the embedded value
`http://localhost:10002` is wrong — proven by probe: it 404s, while the corrected one 401s; see
project.md §Data Source). TypeScript types are derived from it for `AnimalRead`, `AnimalWrite`,
`HabitatRead`, and `DefaultResponse`.

**R3.** A server-only env var `API_KEY` holds the shared secret (never `NEXT_PUBLIC_*`);
`NEXT_PUBLIC_API_BASE_URL` is set to `http://localhost:10002/crud-patterns`. Per Critical Rule 6, the
starter template's existing `getAuthHeader()` (which reads a browser-exposed `NEXT_PUBLIC_API_TOKEN`)
and its status-code-switching `handleErrorResponse()` are both **replaced**, not extended or wrapped.
Also correct `web/src/types/api.ts`'s `APIMessageType` enum in place — it currently declares uppercase
values (`SUCCESS`/`ERROR`/`WARNING`) while the backend sends `"Success"`/`"Warning"`/`"Error"` — fix the
casing rather than comparing case-insensitively.

**R4.** A single shared result-interpretation helper reads every write's `DefaultResponse` body
(`{ Id, MessageType, Messages[] }`), branching on `MessageType` (`"Success"` / `"Warning"` /
`"Error"`) and surfacing `Messages[]`, rather than on HTTP status code — because failures arrive as
HTTP `500`, not conventional `4xx`. Every write path in Layer 5 consumes this one helper.

**R5.** A server-side `LastChangedUser` header, sourced from env var `LAST_CHANGED_USER` (default
`"Animal Manager"`), is injected on every write to `/v1/animals` (`POST`/`PUT`/`DELETE`) in the same
place `X-API-Key` is injected. This is deployment configuration only: no name prompt, no browser
storage, no "who are you?" dialog, no name shown anywhere in the app chrome, and no way for a user to
change it. It produces **no UI**.

**R6.** A refused connection or a rejected API key (`401`, empty body) produces a user-visible error
with a retry affordance — never a blank screen, never a silently swallowed failure (Critical Rule 3).

### Layer 2 — Shell + animal list

**R7.** The root route (`/`) renders the animal list as the home screen. A shared app shell provides
navigation between Animals and Habitats, **fully replacing** the starter template's welcome page
(Critical Rule 6 — replace, don't nest; note `web/src/app/layout.tsx` already renders a
`ToastProvider` and its own `<main>`, and `page.tsx` renders another `<main>` — two `<main>` landmarks
would fail an accessibility scan, so the replacement must resolve to a single `<main>`).

**R8.** `GET /v1/animals` returns `{ Animals: AnimalRead[] }`; the list displays **Name, Species, Age,
Habitat, and Diet** for every animal.

**R9.** Each animal's Habitat is shown directly from the backend-joined `HabitatName` field — no
second call is made to resolve it. Consequence: an animal whose `HabitatId` does not match a real
habitat **never appears in the list at all**, because an `INNER JOIN` silently drops it.

**R10.** The animal list renders three visually distinct states — **loading**, **no-animals-yet**, and
**failed-to-load** (with a retry action) — with the empty state presented as a legitimate success, not
an error.

**R11.** Users can search by name/species and filter by habitat entirely **client-side**, over the full
returned list — the backend accepts no search, filter, sort, or paging parameters and always returns
every animal sorted by `Name`. Record the scaling implication as a known limitation, not a problem to
solve now.

### Layer 3 — Animal detail

**R12.** `GET /v1/animals/{Id}` returns a single `AnimalRead` **directly**, not wrapped in
`DefaultResponse` the way writes are. A detail view, reached by selecting an animal from the list,
shows every recorded field for that animal.

**R13.** The detail view shows `LastChangedUser` and `LastChangedDate`, getting two things right: (1)
`LastChangedDate` arrives as pre-formatted text (`'yyyy-MM-dd HH:mm:ss'`) already converted from UTC to
South Africa Standard Time by the backend — display it exactly as given; never parse it as UTC, never
hand it to a date library that assumes UTC, never convert it a second time. (2) `LastChangedUser` reads
the same fixed deployment name on every record, since there is no per-person identity — label and
design this as a "when was this last touched" trail only, never as per-person attribution.

**R14.** Because the single-animal read has no explicit not-found path in the Linx solution (a "first
row" read with no `TryCatch`/`If` branch), a missing or already-deleted `Id` likely yields an empty or
error response rather than a clean 404. Show a proper "not found" state instead of crashing or
rendering a row of blanks. This is derived from the solution files, **not verified against the live
backend** — confirm the real behaviour while building this requirement.

### Layer 4 — Habitats (read-only)

**R15.** `GET /v1/habitats` returns `{ Habitats: HabitatRead[] }`. A reference list shows each
habitat's Name plus its last-changed details, with distinct loading, empty, and failed-to-load states
and a retry on failure. The same SAST/pre-formatted-text rule from R13 applies to its
`LastChangedDate`.

**R16.** Only `GET /v1/habitats` exists — there is **no** habitat create, update, or delete operation,
genuinely absent from the API, not merely unbuilt. No add, edit, or delete affordance for habitats may
appear anywhere — no buttons, no context menus, no "coming soon" placeholders, no disabled-but-present
controls implying the capability exists, and no "add a new habitat" shortcut inside the animal form.
Habitats serve exactly two purposes: this read-only reference list, and the choice list in R18. The
habitats screen should read as intentionally look-only and complete, not as an unfinished CRUD screen
missing its buttons — that framing is the main design problem here. This is a backend capability limit,
not a permission rule; never imply some other role could edit them.

### Layer 5 — Writes

**R17.** `POST /v1/animals` with Name, Species, Age, HabitatId, and Diet — those five fields are the
entire writable surface. The `LastChangedUser` header is added automatically by the server tier (R5);
it is not a form field and the user never sees or supplies it. Success returns `MessageType`
`"Success"` with `"Animal successfully created"` and the new `Id`. `Id`, `HabitatName`, and
`LastChangedDate` are never sent by the client.

**R18.** The habitat choice in the animal form comes from `GET /v1/habitats` (R15's data). A habitat is
**mandatory**: because the backend `INNER JOIN`s Habitat on read (R9/BR5), an animal saved against a
missing or non-existent `HabitatId` is created successfully and then becomes **permanently invisible**
in every list. The form must make skipping a valid habitat impossible.

**R19.** The backend performs no field validation of its own — it inserts straight to the database, so
whatever is sent is stored. All validation is the app's responsibility: validate all five entry fields
before submitting, with Age a whole number of zero or more, using Zod schemas in
`web/src/lib/validation/` per project convention.

**R20.** A duplicate is rejected as HTTP `500` with `MessageType` `"Warning"` and `Messages`
`["Animal already exists"]`, on both add and edit. Show it as a recoverable message against the Name
field, preserving everything the user typed — never a full-page error, never a wiped form. Style it
visibly as a business rejection (`"Warning"`), distinct from a technical failure. The exact uniqueness
rule is not visible in the backend files (most likely `Animal.Name`) and needs confirming against the
running backend.

**R21.** `PUT /v1/animals/{Id}` with the same five writable fields, prefilled from the single-animal
read (R12), with the same validation (R19) and duplicate handling (R20) as add. The `LastChangedUser`
header comes from the server tier (R5). Success returns `"Animal updated successfully"`. Prefer sharing
one form component between add and edit over duplicating it.

**R22.** `DELETE /v1/animals/{Id}` behind an **explicit** confirmation step that names the animal being
removed, with the `LastChangedUser` header from the server tier (R5). The backend has no error path on
delete, so deleting an already-removed animal is likely reported as success — confirm against the live
backend. Deletion is irreversible and the confirmation must make that clear.

**R23.** After a successful add, edit, or remove, show the backend's **own** confirmation message
(from `Messages[]`) rather than inventing wording, and refresh the affected list/detail so the change
is immediately visible without a manual reload. Think about where the user lands after each action — a
create should not dump them back on an unchanged-looking list.

**R24.** A technical failure arrives as HTTP `500` with `MessageType` `"Error"` and the raw
backend/database message in `Messages[0]`. Surface something readable, keep everything the user typed
so nothing is lost, and let them retry. Per Critical Rule 3, do not dismiss or swallow the error — but
also do not dump a raw SQL exception at the user as the primary message.

---

## Business Rules

**BR1.** No component or client-side code may call the Linx base URL directly; every request is
proxied through the Next.js server tier.

**BR2.** `X-API-Key` is attached server-side on all six Linx operations
(`GET/POST/PUT/DELETE /v1/animals[/{Id}]`, `GET /v1/habitats`) — there is no unauthenticated endpoint.

**BR3.** `LastChangedUser` is a required **header** (not a body field) on every write to
`/v1/animals`, injected server-side from a single fixed configuration value — never per-request, never
user-supplied, never shown or editable in the UI.

**BR4.** Success and failure for any write are determined solely by parsing
`DefaultResponse.MessageType` / `Messages[]`; HTTP status code alone (`500` for both technical and
business-rule failures) is never sufficient.

**BR5.** `HabitatName` is pre-joined via `INNER JOIN`; an `Animal.HabitatId` with no matching Habitat
row makes that animal invisible to `GET /v1/animals`, permanently, until its `HabitatId` is corrected —
existing backend behavior, not a defect to fix.

**BR6.** The backend performs no server-side search/filter/sort/paging; `GET /v1/animals` always
returns the complete set sorted by `Name`. All search and filter behavior is client-side over that full
set — a known scaling limitation for large datasets, not a problem to solve now.

**BR7.** Habitats have no create/update/delete endpoint at any layer — a genuine backend capability
limit, not a permission gate. No feature may imply a future role or permission could unlock habitat
editing.

**BR8.** `GET /v1/animals/{Id}` returns `AnimalRead` directly (unwrapped) — unlike every write, which
returns a `DefaultResponse` envelope. Client code must not assume a uniform response shape across reads
and writes.

**BR9.** The single-animal read has no explicit not-found path in the Linx solution (a "first row" read
with no `TryCatch`/`If` branch) — this is derived from the solution files and unverified live; confirm
actual behaviour for a missing/deleted `Id` during this epic.

**BR10.** Duplicate-name rejection is HTTP `500` + `MessageType` `"Warning"` + `Messages`
`["Animal already exists"]` on both create and update; the exact uniqueness rule (most likely
`Animal.Name` alone) is unconfirmed against the running backend.

**BR11.** Technical failures are HTTP `500` + `MessageType` `"Error"` with the raw backend/database
message in `Messages[0]` — never a conventional 4xx.

**BR12.** Delete has no explicit error path in the Linx solution; deleting an already-removed animal is
likely reported as success — unconfirmed against the running backend.

**BR13.** `LastChangedDate` arrives as pre-formatted text, already converted to South Africa Standard
Time — it must never be re-parsed as UTC or converted a second time by the frontend, anywhere it is
displayed (detail view, habitats list).

**BR14.** `LastChangedUser` always shows the same fixed deployment value on every record — it is a
useful "when was this last touched" trail with no real "who" information, and must never be presented
as per-person attribution.

**BR15.** Roles are out of scope. There is exactly one kind of user, with full read/create/edit/delete
on Animals and read-only on Habitats (inherited from project.md — not re-implemented here). There is no
login, no user store, no session, and no sign-out; nothing in this epic redirects an "unauthenticated"
user, because there is nowhere to redirect to.

---

## Key Workflows

1. **Land on the app.** User opens the root route (`/`) → app shell renders with Animals/Habitats nav →
   Animals is the default/active view → list fetch begins server-side.
2. **Loading.** While the fetch is in flight, a loading state renders (never a blank screen).
3. **Populated list.** On success with one or more animals, the list renders Name, Species, Age,
   Habitat, and Diet per animal, sorted by Name (as returned by the backend).
4. **Empty backend.** On success with zero animals, a "no animals yet" state renders — visually
   distinct from both loading and error, and not framed as a problem.
5. **Backend unreachable / key rejected.** On network failure or `401`, a failed-to-load state renders
   with a retry action; retry re-triggers the fetch and can resolve into any of workflows 2–4.
6. **Search and filter.** User types into a search field (matches Name/Species) and/or picks a Habitat
   filter; the visible list narrows client-side over the already-fetched full set, with no new network
   call.
7. **View one animal.** User selects an animal from the list → detail view fetches
   `GET /v1/animals/{Id}` → shows every field, including `LastChangedUser`/`LastChangedDate` (SAST,
   verbatim) → a missing/deleted `Id` shows a "not found" state instead of a crash.
8. **Browse habitats.** User follows the shared nav to the Habitats view → sees each habitat's Name and
   last-changed details, with its own loading/empty/error states → no add/edit/delete affordance is
   present anywhere on this screen.
9. **Add an animal.** User opens the add-animal form → picks a habitat from the `GET /v1/habitats`
   choices (mandatory) → fills Name/Species/Age/Diet → client-side validation runs before submit →
   `POST /v1/animals` → on `"Success"`, the backend's own confirmation message is shown and the list
   refreshes; on `"Warning"` (duplicate name), the Name field shows the rejection and the form is
   preserved; on `"Error"`, a readable failure message is shown, the form is preserved, and the user can
   retry.
10. **Edit an animal.** User opens edit from the detail view or list → the same shared form is prefilled
    from `GET /v1/animals/{Id}` → same validation and duplicate/error handling as add →
    `PUT /v1/animals/{Id}` → on success, the backend's confirmation message is shown and the
    list/detail refreshes.
11. **Remove an animal.** User triggers delete from the detail view or list → an explicit confirmation
    step names the animal and states the action is irreversible → on confirm, `DELETE /v1/animals/{Id}`
    → on success, the backend's confirmation message is shown and the list refreshes with the animal
    gone; the user is not left on a stale, unchanged-looking list.

---

## Feature NFRs

- **NFR-1:** Client-side search/filter must feel instant (no perceptible lag) for the dataset sizes
  expected of a zoo animal roster; there is no requirement to optimize beyond that today, since the
  backend offers no server-side paging to fall back on if the dataset grows materially (see BR6).
- **NFR-2:** Every async fetch (animal list, habitat list, single-animal detail, every write) must show
  a visible loading state once it exceeds a brief instant (e.g. a skeleton/spinner past ~300ms) — it
  must never be possible for a screen to sit blank while a request is in flight.
- **NFR-3:** The server-tier proxy pattern (route handlers / server components under
  `web/src/app/api/...` injecting `X-API-Key` and `LastChangedUser`) and the shared write-result helper
  (R4) are built once in Layer 1 and reused, unmodified in shape, by every Layer 5 write path — no
  per-story reimplementation.
- **NFR-4:** Every destructive action (delete) uses a visually distinct destructive treatment that is
  never the brand orange primary-action color, per project.md §Styling — accidental confusion between
  "save" and "delete" is treated as a defect.
- **NFR-5:** Toast/confirmation messaging reuses the existing `ToastContext`/`components/toast/`
  infrastructure — no second, parallel notification system is introduced for write confirmations or
  errors.

---

## Out of Scope

- Any habitat create, edit, or delete — no backend operation exists for it (see R16/BR7).
- A login screen, user accounts, sign-out, or session management — there is no user store or session
  concept in this project (see project.md §Authentication).
- Admin vs. User roles, or any permission enforcement — there is exactly one kind of user (see
  project.md §Roles & Permissions).
- Server-side search, sort, or paging — the backend supports none (see BR6).
- Bulk operations (multi-select delete, bulk import/export) — no backend support for any of these.

---

## Notes & Caveats

- **No prototype source present.** This project onboarded via `documentation/` (a Linx backend
  export), not a UI prototype — there is no `prototype-src/` or `genesis.md`, so no prototype
  shortcuts apply to this brief.
- **Embedded spec's `servers:` value is wrong.** The OpenAPI document embedded in
  `CrudPatterns.properties` declares `servers: - url: http://localhost:10002`. This is disproven by an
  authenticated + unauthenticated probe (see project.md §Data Source connectivity notes) — the correct
  base is `http://localhost:10002/crud-patterns`. The extraction in R2 must apply this correction; do
  not carry the embedded value forward verbatim.
- **`APIMessageType` casing mismatch.** `web/src/types/api.ts` currently declares uppercase values
  (`SUCCESS`/`ERROR`/`WARNING`) while the live backend sends `"Success"`/`"Warning"`/`"Error"`. Fix the
  type/enum in place (R3) rather than adding case-insensitive comparisons scattered through call sites.
- **Existing `client.ts` assumes conventional REST status codes.** `web/src/lib/api/client.ts`'s
  `handleErrorResponse()` currently switches on `401`/`403`/`404`/`500` as if they carry distinct
  conventional meanings. This backend returns `500` for both transient technical failures and business
  rejections (duplicate name), always with a `DefaultResponse` envelope — the switch-on-status approach
  is replaced (Critical Rule 6) with the `MessageType`/`Messages[]`-driven helper from R4, not layered
  on top of the existing switch.
- **Backend assumptions to confirm during this epic** (derived from the Linx solution, unverified
  live):
  - The exact uniqueness rule behind `"Animal already exists"` — Name alone, or Name plus something
    else? (R20/BR10)
  - What `GET /v1/animals/{Id}` returns for an unknown `Id`. (R14/BR9)
  - Whether `DELETE` of an already-deleted animal reports success. (R22/BR12)
  - That `LastChangedDate` really is already SAST (corroborated in the SQL, not against live data).
    (R13/BR13)
  - Whether `GET /v1/animals` caps or pages results, or truly returns every animal. (R11/BR6)
  - Any database-level field length/type limits worth mirroring in validation. (R19)
  - The Linx solution ships its own integration test project at
    `documentation/BackendLinx6Api/TestProject.test-project/` (`AnimalGetCreateUpdateDelete`,
    `HabitatGetList`) — reading those test functions may answer several of the above without guessing.
- **Styling — orange is a primary-action color, not a destructive one.** Per project.md, the Digiata
  brand is single-accent (`#ff6b01` orange = primary action). Delete affordances (R22/NFR-4) must use a
  distinct destructive token defined during BUILD's `design-style-agent` pass, never the brand orange,
  or "save" and "delete" become visually indistinguishable.
- **Shadcn primitives to add.** `button`, `card`, `input`, `label` already exist. This epic's surface
  needs `table` (animal/habitat lists), `select` (habitat picker, habitat filter), `skeleton` (loading
  states), `alert` (error/warning states), `form` (Zod-backed add/edit form), and
  `dialog`/`alert-dialog` (delete confirmation) — add each via the Shadcn CLI (Critical Rule 1); do not
  hand-roll equivalents.
- **Superseded briefs.** This brief replaces the four prior epic briefs (`animal-list`,
  `animal-detail`, `habitat-reference`, `animal-management`) at
  `generated-docs/epics/{animal-list,animal-detail,habitat-reference,animal-management}/brief.md`,
  which are being deleted as part of this change.
