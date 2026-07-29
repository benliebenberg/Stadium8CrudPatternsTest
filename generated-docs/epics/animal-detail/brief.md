# Epic: Animal Details

Inherits roles, auth, data source, compliance, and styling from project.md.

**Depends on:** `animal-list`. That epic already delivers the server-proxy tier (Next.js route handlers under `web/src/app/api/...` that inject `X-API-Key` server-side), the generated TypeScript types for the Linx schemas (`AnimalRead`, `HabitatRead`, `DefaultResponse`, etc.), the shared `DefaultResponse`/`MessageType` result-handling utility, and the app shell (layout, navigation, styling tokens). This epic **consumes** those — it does not rebuild the proxy tier, re-generate types, or re-establish the app shell. It does add **one new server-proxy route** for `GET /v1/animals/{Id}` (the list epic only needed `GET /v1/animals`), following the exact conventions the list epic established (same header injection, same error-shape handling).

---

## Goal

Pick an animal from the list and see everything on record for it, including when it was last changed.

---

## Data Model

No new entities. Reuses the `AnimalRead` shape already generated for `animal-list` (from the Linx-embedded OpenAPI spec, `C_lzVV.Schema.AnimalRead`), consumed here via `GET /v1/animals/{Id}` instead of the list endpoint. Confirmed field-for-field against the Linx solution source (`AnimalGetById.event/ReadAnimal.function.types`):

| Field | Type | Notes |
|---|---|---|
| `Id` | `number` | Route param; Int32 on the backend |
| `Name` | `string` | |
| `Species` | `string` | |
| `Age` | `number` | Int32 |
| `HabitatId` | `number` | Not itself displayed — `HabitatName` is the display value |
| `HabitatName` | `string` | Already joined server-side (`INNER JOIN Habitat ON Habitat.Id = Animal.HabitatId`) — no separate habitat lookup needed in this epic |
| `Diet` | `string` | |
| `LastChangedUser` | `string` | **Fixed deployment name, identical on every record** — see Business Rules |
| `LastChangedDate` | `string` | **Pre-formatted text**, `'yyyy-MM-dd HH:mm:ss'`, already converted from UTC to SAST by the backend SQL (`FORMAT(Animal.LastChangedDate AT TIME ZONE 'UTC' AT TIME ZONE 'South Africa Standard Time', 'yyyy-MM-dd HH:mm:ss')`) — confirmed by reading the source SQL directly. Display verbatim as a string; treat as opaque text, not a `Date`. |

**Success response shape:** confirmed from the Linx result type (`AnimalGetById.Result`) — `Response200` is `AnimalRead` directly (the single object), **not** wrapped in `DefaultResponse`. This differs from the write endpoints (`POST`/`PUT`/`DELETE`), which return `DefaultResponse` (`Id`/`MessageType`/`Messages[]`) even on success. `Response500` is `DefaultResponse`, matching project.md's documented error convention.

---

## Functional Requirements

**R1 — See one animal's full record.** `GET /v1/animals/{Id}` returns a single `AnimalRead`. The detail view shows every recorded field: Name, Species, Age, Habitat (`HabitatName`, already joined by the backend), Diet, plus the audit fields (R2). Reached by selecting an animal from the list (`animal-list` epic).

**R2 — See when a record was last changed.** Show `LastChangedUser` and `LastChangedDate`.
  - **R2a (date):** `LastChangedDate` arrives as pre-formatted text (`'yyyy-MM-dd HH:mm:ss'`), already converted from UTC to South Africa Standard Time by the backend. Display it exactly as given. Do **not** parse it as a UTC timestamp, do **not** feed it to a date library that assumes UTC input, and do **not** apply any further timezone conversion — any of those shifts every timestamp on screen by two hours.
  - **R2b (user):** `LastChangedUser` reads the same fixed deployment name on every record (sourced from the `LAST_CHANGED_USER` config setting server-side) — there is no per-person identity in this app. Label and design the field honestly as a "when was this last touched" trail with no "who" information. Do not present it as per-person attribution.

**R3 — A sensible message for an animal that isn't there.** The backend's single-animal read is a "first row" SQL query with no explicit not-found branch (confirmed: `AnimalGetById.event` is just `ReadAnimal` → `Return`, no `TryCatch`/`If` for a missing row). A missing or already-deleted `Id` may therefore yield an empty/null-ish response, an empty object, or a 500 error rather than a clean 404. The app must show a proper "not found" state instead of crashing, rendering blank fields, or showing a row of `undefined`s.

  > **Unverified against live backend — confirm during this epic, per Critical Rule 3:** call `GET /v1/animals/{Id}` with an `Id` that does not exist and record the actual response (empty body? object with null/zero fields? HTTP 500 with a `DefaultResponse` body? something else). Build the not-found detection against the real response, not this assumption. If the live behaviour differs from what's assumed here, update this brief and report the actual behaviour rather than silently coding around it.

---

## Business Rules

**BR1 — `LastChangedDate` is opaque, pre-formatted text.** Never parse it as a `Date`/UTC value, never re-run it through a timezone-aware formatter, never recompute a "time ago" style relative display from it (that would require parsing). Render the string as received.

**BR2 — `LastChangedUser` is not attribution.** No UI copy, tooltip, icon, or grouping may imply the name identifies a specific person who made the change (e.g. avoid phrasing like "changed by {name}" that reads as personal attribution — prefer something like a plain "Last updated" label pairing the timestamp with the deployment name, without implying identity). This mirrors project.md §Data Source ("no feature ... may present `LastChangedUser` as genuine attribution").

**BR3 — Read-only screen.** This epic renders data only. No edit, no delete, no create-related affordance is built here — those belong to the later `animal-management` epic. The layout should leave a sensible, obvious place for edit/delete actions to land later (e.g. a header action area) without wiring any behaviour behind it now.

**BR4 — Not-found is a first-class state,** distinct from a loading state and from a generic error state, even though the backend may not distinguish "doesn't exist" from "server error" cleanly (see R3). If the backend's actual response for a missing `Id` can't be reliably distinguished from a genuine server error, fall back to a single clear "couldn't load this animal" state that covers both, rather than guessing.

**BR5 — No new backend capability is assumed.** Only `GET /v1/animals/{Id}` is called by this epic. Habitat data comes pre-joined (`HabitatName`); no separate `GET /v1/habitats` call is needed for this screen.

---

## Key Workflows

1. **Navigate to detail.** User selects an animal from the list (`animal-list` epic's UI) → app navigates to a per-animal route (e.g. `/animals/[id]`) carrying the `Id`.
2. **Load.** Page/component calls the server-proxy route for `GET /v1/animals/{Id}` (new route added by this epic, following `animal-list`'s existing proxy conventions) → shows a loading state while the request is in flight.
3. **Success.** Response resolves to an `AnimalRead` → render Name, Species, Age, Habitat (`HabitatName`), Diet, and the audit fields (`LastChangedDate` verbatim, `LastChangedUser` labelled per BR2).
4. **Not found.** Response indicates the record doesn't exist (exact shape to be confirmed live, per R3) → render a distinct "animal not found" state, not a blank/partial record.
5. **Error.** Any other failure (network error, unexpected 500 per project.md's `DefaultResponse` error convention) → render a generic error state with retry, per NFR-base-5.

---

## Feature NFRs

- **NFR-detail-1:** A non-numeric or malformed `Id` in the route (e.g. `/animals/abc`) must not be sent to the backend as-is and crash the page — validate the route param client/server-side and route straight to the not-found state (or an equivalent guard) before calling the API.
- **NFR-detail-2:** Per project.md's guidance for dense in-app data screens, use the smaller end of the brand type scale (`--text-h3`/`--text-h4`) for headings on this screen — reserve `--text-h1`/`--text-h2` for hero/landing content this screen doesn't have.

(Baseline NFRs NFR-base-1..6 inherited from project.md apply unchanged — in particular NFR-base-5, error UX with retry, and NFR-base-6, `DefaultResponse`-shaped error parsing.)

---

## Out of Scope

- Editing or deleting the animal from this screen (belongs to `animal-management`).
- Any habitat management UI (Habitats are read-only project-wide; see project.md §Roles & Permissions).
- Any "who changed this" feature beyond the single fixed `LastChangedUser` value — no audit history, no change log, no list of past edits.
- Any role-based access control on this screen (no role model exists in this project).

---

## Notes & Caveats

- **Backend behaviour to confirm live during this epic (unverified — derived from Linx solution source, not live data):**
  1. What `GET /v1/animals/{Id}` actually returns for a non-existent `Id` — empty body, empty/null-field object, HTTP 500, or something else. R3's not-found handling depends on the answer; adjust the implementation (and this brief, if materially different) once confirmed.
  2. That `LastChangedDate` is genuinely already SAST, not UTC — cross-check one record's displayed value against a change made at a known wall-clock time. The SQL source (`FORMAT(... AT TIME ZONE 'UTC' AT TIME ZONE 'South Africa Standard Time', ...)`) strongly supports this, but confirm against a live value before shipping.
- **Prototype/source note:** this epic's understanding of the response shape and the not-found gap comes from reading the Linx solution's function definitions directly (`AnimalGetById.event`, `ReadAnimal.function.types`), not from a live probe — flagged per Critical Rule 3 rather than presented as confirmed fact.
