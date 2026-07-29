# Epic: Habitat Reference List

Inherits roles, auth, data source, compliance, and styling from project.md.

Depends on **Animal List** (`animal-list`) — that epic delivers the server-proxy tier (Next.js routes that
inject `X-API-Key` server-side), the generated TypeScript types for the Linx API, the shared
error/result handling (parsing `DefaultResponse` / HTTP 500 payloads), and the app shell including the
nav entry point for Habitats. This epic consumes all of that and must not rebuild any of it.

---

## Goal

Browse the habitats the zoo has on record — look only, nothing to change.

This is a deliberately small epic: one read-only reference screen, reusing everything the Animal List
epic already built.

---

## Data Model

This epic introduces one entity, sourced from `GET /v1/habitats` (Linx `HabitatGetList` operation),
which returns `{ Habitats: HabitatRead[] }`:

| Field | Type | Notes |
|---|---|---|
| `Id` | `number` (int64) | Not displayed — used only as the React list key and, later, as the value in the habitat picker (`animal-management` epic, out of scope here) |
| `Name` | `string` | The habitat's name — the primary visible field on each row |
| `LastChangedDate` | `string` | **Pre-formatted, already converted to SAST by the backend.** Display verbatim — never re-parse as UTC, never reformat, never re-convert timezone. Same rule as `Animal.LastChangedDate` in project.md. |
| `LastChangedUser` | `string` | Fixed deployment name — identical on every row, project-wide (same mechanism as `Animal.LastChangedUser`). Carries no per-person meaning; do not present as attribution. |

No new request/write DTOs — this epic is GET-only. Reuse the generated `HabitatRead` type and the
shared API client from `animal-list` rather than redefining the shape locally.

---

## Functional Requirements

**R1 — Browse the habitats on record.** `GET /v1/habitats` returns `{ Habitats: HabitatRead[] }`. A
reference list shows each habitat's `Name` plus its last-changed details (`LastChangedUser`,
`LastChangedDate`), with distinct loading, empty, and failed-to-load states and a retry action on
failure. `LastChangedDate` is pre-formatted text already converted to South Africa Standard Time —
display it as given, never re-parse it as UTC or convert it again. `LastChangedUser` reads the same
fixed deployment name on every row, so it carries no per-person meaning.

**R2 — Habitats can be looked at but not changed.** Only `GET /v1/habitats` exists in the backend.
There is NO habitat create, update, or delete operation — not "not yet built," genuinely absent from
the API. Therefore:
- The app must expose NO add, edit, or delete affordance for habitats anywhere — no buttons, no
  context menus, no swipe actions, no "coming soon" placeholders, no disabled-but-present controls
  that imply the capability exists.
- Habitats serve exactly two purposes in this product: this read-only reference list, and (later) the
  choice list when recording an animal, which `animal-management` consumes — not built here.
- The screen should make its look-only nature feel intentional and complete, rather than reading like
  an unfinished CRUD screen with the buttons missing. That framing is the main design problem this
  epic has to solve (see Notes & Caveats).

---

## Business Rules

**BR1 — No write affordances, anywhere.** The habitat list, and any other screen that surfaces habitat
data, must never render an add/edit/delete control, menu item, or disabled-but-visible action for
habitats. There is no backend endpoint to call, so no code path may attempt one.

**BR2 — Read-only is a backend capability limit, not a permission rule.** Do not implement or imply
this as a role/permission check (roles are out of scope project-wide — see project.md §Roles &
Permissions). Do not suggest, in copy or UI, that some other role or future login could unlock editing.

**BR3 — `LastChangedUser` is not attribution.** Every row will show the identical fixed deployment
name. Do not label it "changed by," build any per-user filter/sort on it, or otherwise imply it
identifies an individual.

**BR4 — `LastChangedDate` is display-only, pre-converted text.** Never re-parse, reformat, or
re-convert the timezone. Render the string exactly as the API returns it.

---

## Key Workflows

1. User opens Habitats from the app shell's nav (nav entry already exists — delivered by `animal-list`).
2. App requests habitat data through the existing server-proxy route (or a new proxy route following
   the same pattern established by `animal-list` for `/v1/animals`) — never calls the Linx API directly
   from the browser.
3. **Loading:** a loading state renders while the request is in flight.
4. **Success, non-empty:** the list renders, one row per habitat, showing `Name`, `LastChangedUser`, and
   `LastChangedDate` (verbatim).
5. **Success, empty:** a distinct empty state renders (not the same visual as loading or error) — the
   zoo currently has zero habitats on record.
6. **Failure:** an error state renders with a retry action; retry re-issues the same request.
7. *(Downstream, not built here)* the same habitat data is later reused as the choice list in the
   animal record form — `animal-management` epic's concern, not this one.

---

## Feature NFRs

- **NFR-habitat-1:** The habitat screen and every navigation path that leads to it must expose zero
  write affordances (add/edit/delete) — verifiable by inspecting rendered output for the absence of any
  such control, not merely that such controls are disabled.
- **NFR-habitat-2:** Loading, empty, and error states must be visually distinct from one another (not
  just distinguished by a text label) — reusing the same distinct-states pattern as `animal-list`.

Baseline NFRs (accessibility, performance, responsive breakpoints, browser support, error UX, backend
error-handling) are inherited from project.md and apply unchanged.

---

## Out of Scope

- Habitat create, edit, or delete — no backend operation exists for any of these; not deferred, not
  planned for a later epic either.
- Any role-gated or permission-gated view of habitats — roles are out of scope project-wide.
- Using habitats as a picker/choice list in the animal record form — that consumption happens in
  `animal-management`, which depends on this epic but is a separate epic with its own brief.
- Search, filter, or sort controls for the habitat list — not requested by either assigned requirement;
  adding one would inflate this epic beyond its scope.

---

## Notes & Caveats

- **Main design problem for this epic:** make the read-only nature read as *intentional and complete*,
  not as a CRUD screen missing its buttons. Practical implication for the developer/design-style agents:
  avoid any layout convention that visually implies actions are coming (e.g., an actions column with
  nothing in it, a toolbar with only a disabled "Add" button). A clean, dense reference table/list with
  no action column at all is the intended shape.
- **Reuse, don't rebuild:** the server-proxy route pattern, generated TypeScript types, and shared
  error/result handling all already exist from `animal-list`. This epic should add a `/v1/habitats`
  proxy route and list screen following those established patterns, not introduce a parallel approach.
- Per project.md, prefer the smaller end of the brand type scale (`--text-h3`/`--text-h4`) for headings
  on this in-app data screen — the marketing-scale sizes (`--text-h1`/`--text-h2`/`--text-display`) are
  not appropriate here.
- All colours/fonts/spacing must reference the CSS custom properties in `globals.css` established by
  `animal-list` — no hex literals in components, per styling-centralisation.md.
- No prototype source exists for this project (docs-only intake) — no prototype-shortcut notes apply.
