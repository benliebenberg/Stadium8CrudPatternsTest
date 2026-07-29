# Epic: Add, Edit and Remove Animals (`animal-management`)

Inherits roles, auth, data source, compliance, and styling from project.md.

---

## Goal

Add a new animal, correct an existing one, or remove one — with a confirmation step and a clear
message whether it worked or not.

This is the largest epic in the project and the only one that writes data. It depends on
`animal-list` (app shell, server-proxy tier that injects `X-API-Key` and `LastChangedUser`, generated
TypeScript types, the shared `DefaultResponse`/`MessageType` result-interpretation helper), `animal-detail`
(single-animal read, used here for edit prefill), and `habitat-reference` (the habitat list, used here as
a read-only choice list). This epic consumes all of that — it does not rebuild any of it.

Every write (`POST`, `PUT`, `DELETE` on `/v1/animals`) goes through the Next.js server tier. The browser
never calls Linx directly, and never sees the `X-API-Key` or `LastChangedUser` values (see project.md
§Authentication and §Data Source & Backend Integration).

---

## Data Model

This epic does not introduce new backend entities — it introduces the **writable and response shapes**
around the `Animal` entity already read by `animal-list`/`animal-detail`, plus the two mutation request
bodies.

### `Animal` — writable surface (client → server)

| Field | Type | Required | Notes |
|---|---|---|---|
| `Name` | string | yes | Subject of the duplicate-uniqueness check (see BR4) |
| `Species` | string | yes | |
| `Age` | integer | yes | Whole number, ≥ 0 (see BR3) |
| `HabitatId` | integer/string (matches `Habitat.Id` type from `habitat-reference`) | yes | Must be a value that currently exists in `GET /v1/habitats` — see BR2 |
| `Diet` | string | yes | |

These five fields are the **entire** writable surface for both create (`POST /v1/animals`) and edit
(`PUT /v1/animals/{Id}`). No other field is ever sent by the client.

### `Animal` — server-assigned / server-injected (never client-supplied, never form fields)

| Field | Assigned by | Notes |
|---|---|---|
| `Id` | Server (on create) | Client never sends it on create; used as the path param on edit/delete |
| `HabitatName` | Server (denormalized from the `HabitatId` join) | Never sent by client |
| `LastChangedDate` | Server | Pre-formatted SAST string — display verbatim, never re-parse (project.md) |
| `LastChangedUser` | Injected by the Next.js server tier as an HTTP header, from `LAST_CHANGED_USER` | Not a body field, not a form field, never editable in this epic's UI |

### `DefaultResponse` — shared result shape (reused from `animal-list`'s helper, not redefined here)

| Field | Type | Values relevant to this epic |
|---|---|---|
| `Id` | number/string | The affected animal's Id (create/edit/delete) |
| `MessageType` | string enum | `"Success"` \| `"Warning"` \| `"Error"` |
| `Messages` | string[] | Human-readable text — shown verbatim on success (BR7) and on Warning/Error (BR4, BR5) |

### `Habitat` (consumed, read-only — owned by `habitat-reference`)

Used here strictly as the source list for the mandatory habitat picker (`Id`, `Name` at minimum). This
epic adds no write path, no create/edit/delete affordance, and no schema changes for `Habitat`.

---

## Functional Requirements

- **R1 — Add a new animal.** `POST /v1/animals` with `Name`, `Species`, `Age`, `HabitatId`, and `Diet` —
  those five fields are the entire writable surface. The required `LastChangedUser` header is added
  automatically by the server tier (built in `animal-list`); it is NOT a form field and the user never
  supplies or sees it. Success returns `MessageType: "Success"` with the message "Animal successfully
  created" and the new `Id`. `Id`, `HabitatName`, and `LastChangedDate` are never sent by the client — the
  server assigns them.

- **R2 — Pick a habitat when recording an animal.** The habitat choice comes from `GET /v1/habitats`. A
  habitat is MANDATORY, and this matters more than it looks: the backend INNER JOINs `Habitat` on read,
  so an animal saved against a missing or non-existent `HabitatId` becomes permanently invisible in every
  list — created successfully, then unfindable. The form must make a valid habitat selection impossible
  to skip.

- **R3 — Catch mistakes in the form before sending.** The backend performs NO field validation of its
  own — it inserts straight to the database, so whatever is sent is what gets stored. All validation is
  therefore the app's responsibility. Validate all five entry fields before submitting, with `Age` a
  whole number of zero or more. Use Zod schemas in `web/src/lib/validation/` per the project's
  conventions.

- **R4 — Say so when that animal name is already taken.** A duplicate is rejected as HTTP 500 with
  `MessageType: "Warning"` and `Messages: ["Animal already exists"]`, on BOTH add and edit. Show it as a
  recoverable message against the `Name` field, preserving everything the user typed — never a full-page
  error, never a wiped form. This is a "Warning" (a business rejection) and must be presented differently
  from a technical failure. The exact uniqueness rule is not visible in the backend files (most likely
  `Animal.Name`) and **NEEDS CONFIRMING** against the running backend during this epic.

- **R5 — Correct an existing animal.** `PUT /v1/animals/{Id}` with the same five writable fields,
  prefilled from the single-animal read delivered by `animal-detail`, with the same validation and the
  same duplicate handling as add. The `LastChangedUser` header is supplied by the server tier. Success
  returns `MessageType: "Success"` with "Animal updated successfully". Share one form component between
  add and edit rather than duplicating it.

- **R6 — Remove an animal, on purpose.** `DELETE /v1/animals/{Id}` behind an EXPLICIT confirmation step
  that names the animal being removed, with the `LastChangedUser` header supplied by the server tier.
  The backend has no error path on delete, so deleting an already-removed animal is likely reported as
  success — an assumption to confirm against the live backend. Deletion is irreversible; the confirmation
  must make that clear.

- **R7 — Confirm the change and show it straight away.** After a successful add, edit, or remove, show
  the backend's OWN confirmation message (from `Messages[]`) rather than inventing wording, and refresh
  the affected list/detail so the change is immediately visible without a manual reload. Consider where
  the user lands after each action — a create should not dump them back on an unchanged-looking list.

- **R8 — Explain a failed save in plain words.** A technical failure arrives as HTTP 500 with
  `MessageType: "Error"` and the raw backend/database message in `Messages[0]`. Surface something
  readable, keep everything the user typed so nothing is lost, and let them retry. Per Critical Rule 3,
  do not dismiss or swallow the error — but also do not dump a raw SQL exception at the user as the
  primary message.

---

## Business Rules

- **BR1** — The five writable Animal fields are exactly `Name`, `Species`, `Age`, `HabitatId`, `Diet`.
  `Id`, `HabitatName`, `LastChangedDate`, and `LastChangedUser` are never client-supplied on create or
  edit.
- **BR2** — `HabitatId` selection is mandatory and must be chosen from the live `GET /v1/habitats` list
  (no free-text entry, no "none"/empty option, no way to submit without a valid, currently-existing
  habitat selected) — because an orphaned `HabitatId` makes the animal permanently invisible to every
  list view (INNER JOIN).
- **BR3** — `Age` must validate (via Zod) as a whole number ≥ 0 before submission is allowed.
- **BR4** — A duplicate-name rejection (HTTP 500, `MessageType: "Warning"`, `Messages: ["Animal already
  exists"]`) is shown as a recoverable, `Name`-field-scoped message, preserving all entered form values.
  Never a full-page error, never a form reset. Applies identically on add and edit. Presented visually
  distinct from BR5 (Warning ≠ Error).
- **BR5** — A technical failure (HTTP 500, `MessageType: "Error"`, raw message in `Messages[0]`) is
  surfaced as a readable message, preserves form state, and offers retry. The raw backend text is not
  hidden (Critical Rule 3) but is not the primary/first-line message either — e.g. a plain-language
  summary line with the raw text available behind a "details" disclosure.
- **BR6** — Delete requires an explicit confirmation step (Shadcn `AlertDialog`) that names the specific
  animal (by `Name`) being removed and states the action is irreversible, before the `DELETE` call fires.
- **BR7** — On any successful write (create/edit/delete), the exact `Messages[]` string from the backend
  is displayed verbatim as the confirmation copy — no app-invented success wording.
- **BR8** — Post-action navigation: after create, land on the new animal's detail view (or a list state
  where the new row is clearly visible, not just "unchanged-looking"); after edit, refresh the detail view
  in place; after delete, return to the list with the row removed and the list refreshed from the
  backend — never a stale cached view.
- **BR9** — `LastChangedUser` is never a form field, is never rendered as editable, and is never
  presented anywhere in this epic's UI as genuine per-person attribution (consistent with project.md —
  every record shows the same fixed value).
- **BR10** — This epic adds no habitat create/edit/delete affordance of any kind, including inside the
  animal form (no inline "add a new habitat" shortcut) — the backend cannot support it.
- **BR11** — Roles/permissions are out of scope. There is no permission check anywhere in this epic and
  no Admin-only gating on delete — any user of the app can create, edit, or delete any animal.

---

## Key Workflows

1. **Add an animal**
   1. From the animal list (or an "Add Animal" entry point), open the (empty) animal form.
   2. Habitat choices load from `GET /v1/habitats` into a mandatory select.
   3. User fills `Name`, `Species`, `Age`, `HabitatId`, `Diet`; client-side Zod validation runs before
      submit is enabled/accepted.
   4. Submit → `POST /v1/animals` via the server tier.
   5. **Success:** show the backend's message ("Animal successfully created") and navigate to the new
      animal's detail view.
   6. **Duplicate name (Warning):** show "Animal already exists" against the `Name` field; all other
      entered values remain exactly as typed; user can correct the name and resubmit.
   7. **Technical failure (Error):** show a readable failure message with the raw backend text available
      on request; all entered values remain; user can retry.

2. **Edit an existing animal**
   1. From the animal detail view (`animal-detail`), open "Edit".
   2. Form prefills from the single-animal read already fetched by `animal-detail`; habitat select
      prefills to the animal's current `HabitatId`.
   3. Same validation as add.
   4. Submit → `PUT /v1/animals/{Id}` via the server tier.
   5. **Success:** show "Animal updated successfully" and refresh the detail view in place.
   6. **Duplicate name / technical failure:** identical handling to add (BR4/BR5), scoped to the edit
      form.

3. **Remove an animal**
   1. From the animal detail view or a list row, choose "Delete".
   2. An `AlertDialog` names the specific animal (by `Name`) and states the action is irreversible.
   3. On explicit confirm → `DELETE /v1/animals/{Id}` via the server tier.
   4. **Success:** show the backend's own confirmation message, return to the list, and the list
      reflects the removal without a manual reload.
   5. **Technical failure:** show a readable failure message; the animal remains in the list/detail
      view unchanged.

---

## Feature NFRs

- **Feature-NFR-1:** The add/edit form (including the mandatory habitat select and inline
  Warning/Error messaging) must be fully keyboard-navigable and correctly labelled for assistive tech —
  reinforces project baseline NFR-base-1 (WCAG 2.1 AA) with this epic's specific surfaces: form field
  labels/errors and the delete confirmation dialog.
- **Feature-NFR-2:** No optimistic UI for any write — always wait for the backend's `DefaultResponse`
  before showing success or failure state, since the backend performs no validation of its own and the
  app is the only safety net.
- **Feature-NFR-3:** The Zod schema(s) backing the add/edit form are the sole barrier against invalid
  data reaching the database (per R3) — UI-level constraints (e.g. numeric-only `Age` input) and the Zod
  schema must not diverge; validate against the same rules in both places.

---

## Out of Scope

- Any habitat create/edit/delete affordance, anywhere, including inside the animal form.
- Any role/permission gating, any role-aware UI, any Admin-only delete — roles are out of scope
  project-wide (project.md §Roles & Permissions).
- Any UI for entering, viewing as editable, or changing `LastChangedUser` — it is fixed deployment
  configuration, injected server-side only.
- Bulk add / bulk edit / bulk delete of animals — this epic covers single-record add, edit, and delete
  only.
- The animal list and animal detail views themselves (read paths) — delivered by `animal-list` and
  `animal-detail` respectively; this epic only adds the write actions and surfaces reachable from them.
- Any habitat create/edit/delete UI or backend call — habitats remain read-only, consumed only as a
  choice list.

---

## Notes & Caveats

- **Backend behaviours to confirm during this epic** (derived from the Linx solution, not yet verified
  against live data — per Critical Rule 3, report what the backend actually does and surface any
  divergence rather than silently coding around it):
  - The exact uniqueness rule behind "Animal already exists" — `Animal.Name` alone, or `Name` plus
    another field.
  - Whether `DELETE` of an already-deleted animal genuinely returns a success `DefaultResponse`.
  - Whether any field length or type limit exists at the database level that client-side Zod validation
    should mirror.
- **Styling — status/feedback tokens are a BUILD decision, not yet defined.** project.md records that
  Digiata's harvested palette is single-accent (orange `#ff6b01` = primary action) and has no
  success/warning/destructive colours. This epic is the first to need them (delete confirmation, the
  duplicate-name Warning, and the technical-failure Error state). `design-style-agent` must define
  accessible success/warning/destructive tokens (≥4.5:1 on `#090909`) as CSS custom properties in
  `globals.css` before this epic's components can be built — no hex literals in components (Critical
  Rule / styling-centralisation.md). **The brand orange must NOT be reused for the destructive delete
  action** — orange reads as the primary/save action in this palette, and a destructive-orange delete
  button would be dangerously indistinguishable from a save button. Any filled-orange button's text is
  `#090909` (never cream).
- **Shared form component:** R5 explicitly asks for one form component shared between add and edit
  (same fields, same validation, same duplicate/error handling) rather than two near-duplicate forms.
- **Habitat picker source:** the habitat select must be populated from a live `GET /v1/habitats` call
  (via `habitat-reference`'s existing read path) at form-open time, not a cached/stale list, so that a
  habitat deleted or added since the app last loaded is reflected — though habitats are read-only in
  this project, so this is a freshness concern rather than a write-race concern.
