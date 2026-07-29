# Epic: Animal List

Inherits roles, auth, data source, compliance, and styling from project.md.

---

## Goal

Open the app and land on a searchable list of every animal, each showing the habitat it lives in.

This is the **first epic** of the project and the **dependency root** (`dependsOn: []`). It carries the
shared foundation every later epic (create/edit/delete Animal, any Habitat-facing work) builds on:
the server-side proxy to Linx, the canonical API spec + generated types, the `X-API-Key` /
`LastChangedUser` injection mechanism, and the shared write-result interpretation helper. The
foundation is deliberately **not** a separate epic — it is built as the first, infrastructure-only
slice of this epic, with the visible list screen built directly on top of it, so this epic still ships
something a person can look at rather than landing as pure plumbing.

---

## Data Model

Scoped to what this epic reads, plus the write-side types the shared foundation must expose for every
later epic (this epic does not itself create any write UI).

| Entity | Fields | Notes |
|---|---|---|
| `AnimalRead` | `Id: number`, `Name: string`, `Species: string`, `Age: number`, `HabitatId: number`, `HabitatName: string`, `Diet: string`, `LastChangedUser: string`, `LastChangedDate: string` | `HabitatName` arrives pre-joined (backend `INNER JOIN`s Habitat) — see R7/BR5. `LastChangedDate` arrives pre-formatted in SAST (see project.md) — display verbatim, never re-parse. |
| `AnimalReadList` | `Animals: AnimalRead[]` | Response body of `GET /v1/animals`. |
| `AnimalWrite` | `Name: string`, `Species: string`, `Age: number`, `HabitatId: number`, `Diet: string` | Request body shape for `POST`/`PUT` — generated here for later write epics; no create/edit form in this epic. |
| `HabitatRead` | `Id: number`, `Name: string`, `LastChangedUser: string`, `LastChangedDate: string` | |
| `HabitatReadList` | `Habitats: HabitatRead[]` | Response body of `GET /v1/habitats`. |
| `DefaultResponse` | `Id: number`, `MessageType: string` (`"Success"` \| `"Warning"` \| `"Error"`), `Messages: string[]` | Shared write-result envelope; body arrives on writes **and** on every `500` error. See R4/BR4. |

---

## Functional Requirements

**R1.** All calls to the Linx backend happen through the Next.js server tier (server components and/or
route handlers under `web/src/app/api/...`), which injects `X-API-Key` server-side; the browser never
calls Linx directly (it has no CORS headers and the key must stay a server secret).

**R2.** The canonical OpenAPI 3.0.1 document is extracted from
`documentation/BackendLinx6Api/CrudPatterns.project/CrudPatterns.folder/Api.folder/CrudPatterns.service/CrudPatterns.properties`
→ `ServiceData.Properties["API definition"]` to `generated-docs/specs/api-spec.yaml`, with the
`servers:` value **corrected** to `http://localhost:10002/crud-patterns` (the embedded
`http://localhost:10002` is wrong — proven by probe; see project.md §Data Source). TypeScript types are
derived from it for `AnimalRead`, `AnimalWrite`, `HabitatRead`, and `DefaultResponse`.

**R3.** A server-only env var `API_KEY` holds the shared secret (never `NEXT_PUBLIC_*`);
`NEXT_PUBLIC_API_BASE_URL` is set to `http://localhost:10002/crud-patterns`. The starter template's
existing `getAuthHeader()` in `web/src/lib/api/client.ts` — which reads a browser-exposed
`NEXT_PUBLIC_API_TOKEN` — is **replaced**, not extended or wrapped (Critical Rule 6), since it
represents exactly the client-side-secret pattern this project must not use.

**R4.** A single shared result-interpretation helper reads every write's `DefaultResponse` body
(`{ Id, MessageType, Messages[] }`), branching on `MessageType` (`"Success"` / `"Warning"` /
`"Error"`) and surfacing `Messages[]`, rather than on HTTP status code — because failures arrive as
HTTP `500`, not conventional `4xx`. Built here since every later write epic depends on it, even though
this epic performs no writes itself.

**R5.** A refused connection or a rejected API key (`401`, empty body) produces a user-visible error
with a retry affordance — never a blank screen, never a silently swallowed failure.

**R6.** `GET /v1/animals` returns `{ Animals: AnimalRead[] }`; the list displays **Name, Species, Age,
Habitat, and Diet** for every animal.

**R7.** Each animal's Habitat is shown directly from the backend-joined `HabitatName` field — no
second call is made to resolve it. Consequence: an animal whose `HabitatId` does not match a real
habitat **never appears in the list at all**, because an `INNER JOIN` silently drops it.

**R8.** The animal list renders three visually distinct states — **loading**, **no-animals-yet**, and
**failed-to-load** (with a retry action) — with the empty state presented as a legitimate success, not
an error.

**R9.** Users can search by name/species and filter by habitat entirely **client-side**, over the full
returned list — the backend accepts no search, filter, sort, or paging parameters and always returns
every animal sorted by `Name`.

**R10.** The root route (`/`) renders the animal list as the home screen. A shared app shell provides
navigation between Animals and Habitats, **fully replacing** the starter template's welcome page
(Critical Rule 6 — replace, don't nest).

**R11.** A server-side `LastChangedUser` header, sourced from env var `LAST_CHANGED_USER` (default
`"Animal Manager"`), is injected on every write to `/v1/animals` (`POST`/`PUT`/`DELETE`) in the same
place `X-API-Key` is injected. This is deployment configuration only: no name prompt, no browser
storage, no "who are you?" dialog, no name shown anywhere in the app chrome, and no way for a user to
change it. It produces **no UI** in this epic.

---

## Business Rules

**BR1.** No component or client-side code may call the Linx base URL directly; every request is
proxied through the Next.js server tier.

**BR2.** `X-API-Key` is attached server-side on every one of the six Linx operations
(`GET/POST/PUT/DELETE /v1/animals[/{Id}]`, `GET /v1/habitats`) — there is no unauthenticated endpoint.

**BR3.** `LastChangedUser` is a required **header** (not a body field) on every write to
`/v1/animals`, injected server-side from a single fixed configuration value — never per-request, never
user-supplied.

**BR4.** Success and failure for any write are determined solely by parsing
`DefaultResponse.MessageType` / `Messages[]`; HTTP status code alone (`500` for both technical and
business-rule failures) is never sufficient.

**BR5.** `HabitatName` is pre-joined via `INNER JOIN`; an `Animal.HabitatId` with no matching Habitat
row makes that animal invisible to `GET /v1/animals` — this is existing backend behavior, not a defect
to fix.

**BR6.** The backend performs no server-side search/filter/sort/paging; `GET /v1/animals` always
returns the complete set sorted by `Name`. All search and filter behavior in this epic is client-side
over that full set — a known scaling limitation for large datasets, not a problem to solve now.

**BR7.** Habitats have no create/update/delete endpoint at the API level — only `GET /v1/habitats`
exists. This epic's navigation may link to a habitats view but must expose **no** habitat
add/edit/delete affordance anywhere.

**BR8.** Roles are out of scope. There is exactly one kind of user, with full read/create/edit/delete
on Animals and read-only on Habitats (inherited from project.md — not re-implemented here).

---

## Key Workflows

1. **Land on the app.** User opens the root route (`/`) → app shell renders with Animals/Habitats nav →
   Animals is the default/active view → list fetch begins server-side.
2. **Loading.** While the fetch is in flight, a loading state renders (not a blank screen).
3. **Populated list.** On success with one or more animals, the list renders Name, Species, Age,
   Habitat, and Diet per animal, sorted by Name (as returned by the backend).
4. **Empty backend.** On success with zero animals, a "no animals yet" state renders — visually
   distinct from both loading and error, and not framed as a problem.
5. **Backend unreachable / key rejected.** On network failure or `401`, a failed-to-load state renders
   with a retry action; retry re-triggers the fetch and can resolve into any of states 2–4.
6. **Search and filter.** User types into a search field (matches Name/Species) and/or picks a Habitat
   filter; the visible list narrows client-side over the already-fetched full set, with no new network
   call.
7. **Navigate to Habitats.** User follows the shared nav to a read-only Habitats view (no add/edit/
   delete affordance) and back to Animals.

---

## Feature NFRs

- **NFR-1:** Client-side search/filter must feel instant (no perceptible lag) for the dataset sizes
  expected of a zoo animal roster; there is no requirement to optimize beyond that today, since the
  backend offers no server-side paging to fall back on if the dataset grows materially (see BR6).
- **NFR-2:** The loading state must be visible for any fetch that takes longer than a brief instant
  (e.g. a skeleton/spinner appearing once a response exceeds ~300ms) — it must never be possible for
  the screen to sit blank while a request is in flight.
- **NFR-3:** The server-tier proxy pattern (route handlers / server components under
  `web/src/app/api/...` injecting `X-API-Key` and `LastChangedUser`) and the shared write-result
  helper must be structured for direct reuse by every later epic — this epic's implementation is the
  template, not a one-off.

---

## Out of Scope

- Animal create, edit, and delete (later epics build on the foundation laid here).
- Any Habitat write UI (add/edit/delete) — no backend endpoint exists for it.
- User login, name entry/prompt, or any role/permission-gated UI (no role model exists in this
  project — see project.md §Roles & Permissions).
- Server-side/backend search, filter, sort, or pagination — not offered by this API.
- Presenting `LastChangedUser` as genuine per-person attribution anywhere in the UI (it is a single
  fixed deployment value, not an identity — see project.md).

---

## Notes & Caveats

- **No prototype source present.** This project onboarded via `documentation/` (a Linx backend
  export), not a UI prototype — there is no `prototype-src/` or `genesis.md`, so no prototype
  shortcuts apply to this brief.
- **Embedded spec's `servers:` value is wrong.** The OpenAPI document embedded in
  `CrudPatterns.properties` declares `servers: - url: http://localhost:10002`. This has been
  disproven by an authenticated + unauthenticated probe (see project.md §Data Source connectivity
  notes) — the correct base is `http://localhost:10002/crud-patterns`. The extraction in R2 must apply
  this correction; do not carry the embedded value forward verbatim.
- **Existing `client.ts` assumes conventional REST status codes.** `web/src/lib/api/client.ts`'s
  `handleErrorResponse()` currently switches on `401`/`403`/`404`/`500` as if they carry distinct
  conventional meanings. This backend returns `500` for both transient technical failures and business
  rejections (e.g., duplicate name), always with a `DefaultResponse` envelope — the switch-on-status
  approach must be replaced (per Critical Rule 6) with the `MessageType`/`Messages[]`-driven helper
  from R4, not layered on top of the existing switch.
- **Duplicate-record path exists but its exact rule isn't confirmed.** The Linx solution has a
  dedicated `ReturnDuplicateRecordError` path wired into `AnimalCreate`/`AnimalUpdate`, implying a DB
  uniqueness constraint (most likely on `Animal.Name`). Not relevant to this epic's read-only list, but
  the shared result-interpretation helper built here (R4) must not assume any specific `Messages[]`
  wording beyond `MessageType` — the exact duplicate-check rule will be confirmed against the running
  backend when the create/edit epic is built.
- **`LastChangedDate` is pre-converted to SAST.** Per project.md, this value must be rendered exactly
  as returned by the backend — never re-parsed as UTC or converted a second time, if/when this epic's
  list or any detail view surfaces it.
