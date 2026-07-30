# Epic Plan — Zoo Animal Manager

Every epic in this project, what it delivers, and what it builds on. Live status
(not started / in flight / done) is shown by `/status` and the dashboard.

> Plan only — edited during planning on `main`, never on an epic branch.

A frontend over the Linx 6 `CrudPatterns` REST API. The backend exposes full CRUD for
Animals and a read-only list of Habitats, protected by a single shared API key that the
Next.js server tier holds and injects — the browser never calls Linx directly.

**The product shipped as one epic.** An earlier version of this plan split the work across four
sequential epics (`animal-list`, `animal-detail`, `habitat-reference`, `animal-management`). At
the stories approval the user chose to build the whole product as a single epic broken into
stories instead, so those four briefs were superseded and removed. The trade-off accepted:
one manual-test session and one pull request at the end, rather than four incremental merges.

## Epics

| # | Epic | Delivers | Builds on |
|---|---|---|---|
| 1 | Zoo Animal Manager (`zoo-animal-manager`) | A complete animal-management app — browse and search animals, view one animal's full record, browse habitats, and add, edit or remove animals. | — |
| 2 | Light and Dark Themes (`theme-switching`) | Choose Light, Dark or System from the nav bar, and a light theme that is genuinely good — every screen and state checked and fixed. | Zoo Animal Manager (`zoo-animal-manager`) |

The build sequence *within* epic 1 is layered, and its brief records it explicitly:
Foundation → Shell + List → Detail → Habitats → Writes.

Epic 2 reskins what epic 1 built; it changes no functionality and no backend behaviour.

## Coverage

Everything in the spec is assigned to an epic:

| What you asked for | Epic |
|---|---|
| The app's key stays on the server (R1) | Zoo Animal Manager |
| A single agreed description of the backend's data (R2) | Zoo Animal Manager |
| Correct backend address and credentials (R3) | Zoo Animal Manager |
| Reading the backend's own success and failure messages (R4) | Zoo Animal Manager |
| Stamping every change with a fixed deployment name (R5) | Zoo Animal Manager |
| Clear message when the zoo database can't be reached (R6) | Zoo Animal Manager |
| A home screen and navigation that belong to this app (R7) | Zoo Animal Manager |
| See every animal in one list (R8) | Zoo Animal Manager |
| Each animal shows the habitat it lives in (R9) | Zoo Animal Manager |
| The list tells you when it's loading, empty, or broken (R10) | Zoo Animal Manager |
| Find an animal in the list (R11) | Zoo Animal Manager |
| See one animal's full record (R12) | Zoo Animal Manager |
| See when a record was last changed (R13) | Zoo Animal Manager |
| A sensible message for an animal that isn't there (R14) | Zoo Animal Manager |
| Browse the habitats on record (R15) | Zoo Animal Manager |
| Habitats can be looked at but not changed (R16) | Zoo Animal Manager |
| Add a new animal (R17) | Zoo Animal Manager |
| Pick a habitat when recording an animal (R18) | Zoo Animal Manager |
| Catch mistakes in the form before sending (R19) | Zoo Animal Manager |
| Say so when that animal name is already taken (R20) | Zoo Animal Manager |
| Correct an existing animal (R21) | Zoo Animal Manager |
| Remove an animal, on purpose (R22) | Zoo Animal Manager |
| Confirm the change and show it straight away (R23) | Zoo Animal Manager |
| Explain a failed save in plain words (R24) | Zoo Animal Manager |

_24 requirements, all assigned._

### Epic 2 — Light and Dark Themes

Added after epic 1 shipped, at the user's request. Light-theme token values already existed from
epic 1's styling pass but had never rendered, because `layout.tsx` hardcoded the dark class — so
this epic is as much about *proving* the light theme as about the toggle itself.

| What you asked for | Epic |
|---|---|
| Choose Light, Dark or follow the system (T1) | Light and Dark Themes (`theme-switching`) |
| First visit respects the machine's setting (T2) | Light and Dark Themes (`theme-switching`) |
| No flash of the wrong theme (T3) | Light and Dark Themes (`theme-switching`) |
| The control is usable by keyboard and screen reader (T4) | Light and Dark Themes (`theme-switching`) |
| Every screen looks right in light (T5) | Light and Dark Themes (`theme-switching`) |
| Every state looks right in light (T6) | Light and Dark Themes (`theme-switching`) |
| Notifications use the theme's colours (T7) | Light and Dark Themes (`theme-switching`) |
| Accessible contrast in both themes, not just dark (T8) | Light and Dark Themes (`theme-switching`) |

_8 requirements, all assigned._

**Decisions taken when this epic was set up:**

- **Light / Dark / System**, not a two-way flip. First visit follows `prefers-color-scheme`; an
  explicit choice is remembered per browser; "System" returns to following the OS and tracks
  changes to it live. The app never overrides a preference someone already expressed at OS level.
- **An icon control on the right of the existing nav bar** — present on every screen, and the
  shared shell already exists so it costs little.
- **A full light audit, not just the toggle.** Every screen and every state gets looked at and
  fixed, and the accessibility scan runs in both themes. Nothing in this app had ever rendered in
  light, so the theme was defined but unproven.

**Out of scope:** per-user or server-side theme persistence (there is no login and no user store),
any change to the brand palette or fonts, additional themes beyond light and dark, re-designing any
screen, and any change to the animal/habitat functionality or the backend.

## Decisions taken at intake

Two gaps in the source material were resolved with the user before this plan was approved:

- **"Last changed by" is a fixed deployment name.** The backend requires a `LastChangedUser`
  header on every write, but the app has no sign-in. The value comes from one server-side
  config setting (`LAST_CHANGED_USER`), injected alongside the API key. Consequence: the audit
  trail is meaningful for *when* a record changed, but carries no *who* information.
- **Roles are out of scope.** One kind of user, with full access to animals and look-only
  access to habitats. With no sign-in and a single shared API key, the backend cannot tell one
  caller from another, so any Admin/User rule would be a label rather than a restriction. The
  manage-users, audit-log, system-settings and Admin-only-delete claims were dropped — the
  backend has no operations behind them.

A third decision was taken at the stories approval:

- **One epic, not four.** See the note under the title above.

## Known constraints

These shape what the epic can honestly deliver:

- **Habitats are read-only.** Only `GET /v1/habitats` exists. No habitat create, edit or
  delete affordance may appear anywhere — the backend has no operation for it.
- **Anyone who can reach the app has full write access** to every animal record. One shared
  API key, no per-person identity. An accepted trade-off, not a gap being closed.
- **Errors arrive as HTTP 500, not 4xx** — including a rejected duplicate name, which comes
  back as `MessageType: "Warning"`. Result handling reads the message payload, never status
  codes alone.
- **The backend does no field validation.** It inserts straight to the database, so all
  validation is the frontend's responsibility.
- **No server-side search, filter, sort or paging.** `GET /v1/animals` always returns every
  animal, sorted by name. Filtering happens in the browser.
- **`GET /v1/animals/{Id}` returns `AnimalRead` directly**, not wrapped in `DefaultResponse`
  the way the write operations are.

## Assumptions to confirm against the live backend

Derived from the Linx solution files, not yet verified against live data. All are flagged in
the epic brief:

| Assumption |
|---|
| The exact uniqueness rule behind "Animal already exists" (likely `Animal.Name`) |
| What `GET /v1/animals/{Id}` returns for an unknown Id (no explicit not-found path exists) |
| Whether deleting an already-deleted animal reports success |
| That `LastChangedDate` is already South Africa Standard Time (the SQL does `AT TIME ZONE 'UTC' AT TIME ZONE 'South Africa Standard Time'`, so this is corroborated in source but not against live data) |
| Whether `GET /v1/animals` caps or pages results, or truly returns every animal |
| Any database-level field length or type limits worth mirroring in validation |

The Linx solution ships its own integration test project at
`documentation/BackendLinx6Api/TestProject.test-project/` (`AnimalGetCreateUpdateDelete`,
`HabitatGetList`) — reading those test functions may answer several of these without guessing.

## Environment

| Setting | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:10002/crud-patterns` | Resolved by probe; the embedded spec's `http://localhost:10002` 404s |
| `API_KEY` | *(secret)* | Server-only. Never `NEXT_PUBLIC_*` — the browser must never see it |
| `LAST_CHANGED_USER` | `Animal Manager` | Server-only. Injected on every write |
