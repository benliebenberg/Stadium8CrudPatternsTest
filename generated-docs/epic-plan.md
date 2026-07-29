# Epic Plan — Zoo Animal Manager

Every epic in this project, what it delivers, and what it builds on. Live status
(not started / in flight / done) is shown by `/status` and the dashboard.

> Plan only — edited during planning on `main`, never on an epic branch.

A frontend over the Linx 6 `CrudPatterns` REST API. The backend exposes full CRUD for
Animals and a read-only list of Habitats, protected by a single shared API key that the
Next.js server tier holds and injects — the browser never calls Linx directly.

## Epics

| # | Epic | Delivers | Builds on |
|---|---|---|---|
| 1 | Animal List (`animal-list`) | Open the app and land on a searchable list of every animal, each showing the habitat it lives in. | — |
| 2 | Animal Details (`animal-detail`) | Pick an animal from the list and see everything on record for it, including when it was last changed. | Animal List (`animal-list`) |
| 3 | Habitat Reference List (`habitat-reference`) | Browse the habitats the zoo has on record — look only, nothing to change. | Animal List (`animal-list`) |
| 4 | Add, Edit and Remove Animals (`animal-management`) | Add a new animal, correct an existing one, or remove one — with a confirmation step and a clear message whether it worked or not. | Animal Details (`animal-detail`), Habitat Reference List (`habitat-reference`) |

Epics 2 and 3 are independent of each other and can be built concurrently once epic 1 has
merged. Epic 4 reaches epic 1 transitively.

The shared foundation — the server-proxy tier, the extracted API spec and generated types,
the `MessageType`/`Messages[]` result handling, the fixed `LastChangedUser` header, and the
app shell — is deliberately folded into epic 1 as its first infrastructure-only slice rather
than being a standalone epic, so that the first epic ships a screen a person can actually
look at. Every later epic inherits it via `dependsOn`.

## Coverage

Everything in the spec is assigned to an epic:

| What you asked for | Epic |
|---|---|
| The app's key stays on the server (R1) | Animal List (`animal-list`) |
| A single agreed description of the backend's data (R2) | Animal List (`animal-list`) |
| Correct backend address and credentials (R3) | Animal List (`animal-list`) |
| Reading the backend's own success and failure messages (R4) | Animal List (`animal-list`) |
| Clear message when the zoo database can't be reached (R5) | Animal List (`animal-list`) |
| See every animal in one list (R6) | Animal List (`animal-list`) |
| Each animal shows the habitat it lives in (R7) | Animal List (`animal-list`) |
| The list tells you when it's loading, empty, or broken (R8) | Animal List (`animal-list`) |
| Find an animal in the list (R9) | Animal List (`animal-list`) |
| A home screen and navigation that belong to this app (R10) | Animal List (`animal-list`) |
| See one animal's full record (R11) | Animal Details (`animal-detail`) |
| See when a record was last changed (R12) | Animal Details (`animal-detail`) |
| A sensible message for an animal that isn't there (R13) | Animal Details (`animal-detail`) |
| Browse the habitats on record (R14) | Habitat Reference List (`habitat-reference`) |
| Habitats can be looked at but not changed (R15) | Habitat Reference List (`habitat-reference`) |
| Stamping every change with a fixed deployment name (R16) | Animal List (`animal-list`) |
| Add a new animal (R17) | Add, Edit and Remove Animals (`animal-management`) |
| Pick a habitat when recording an animal (R18) | Add, Edit and Remove Animals (`animal-management`) |
| Catch mistakes in the form before sending (R19) | Add, Edit and Remove Animals (`animal-management`) |
| Say so when that animal name is already taken (R20) | Add, Edit and Remove Animals (`animal-management`) |
| Correct an existing animal (R21) | Add, Edit and Remove Animals (`animal-management`) |
| Remove an animal, on purpose (R22) | Add, Edit and Remove Animals (`animal-management`) |
| Confirm the change and show it straight away (R23) | Add, Edit and Remove Animals (`animal-management`) |
| Explain a failed save in plain words (R24) | Add, Edit and Remove Animals (`animal-management`) |

_24 requirements, all assigned._

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

## Known constraints

These shape what the epics can honestly deliver:

- **Habitats are read-only.** Only `GET /v1/habitats` exists. No epic may add a habitat
  create, edit or delete affordance — the backend has no operation for it.
- **Anyone who can reach the app has full write access** to every animal record. One shared
  API key, no per-person identity. An accepted trade-off, not a gap being closed.
- **Errors arrive as HTTP 500, not 4xx** — including a rejected duplicate name, which comes
  back as `MessageType: "Warning"`. Result handling reads the message payload, never status
  codes alone.
- **The backend does no field validation.** It inserts straight to the database, so all
  validation is the frontend's responsibility.
- **No server-side search, filter, sort or paging.** `GET /v1/animals` always returns every
  animal, sorted by name. Filtering happens in the browser.

## Assumptions to confirm against the live backend

Derived from the Linx solution files, not yet verified against live data. Each is flagged in
the brief of the epic that will encounter it:

| Assumption | Epic to confirm it |
|---|---|
| The exact uniqueness rule behind "Animal already exists" (likely `Animal.Name`) | `animal-management` |
| What `GET /v1/animals/{Id}` returns for an unknown Id (no explicit not-found path exists) | `animal-detail` |
| Whether deleting an already-deleted animal reports success | `animal-management` |
| That `LastChangedDate` is already South Africa Standard Time (the SQL does `AT TIME ZONE 'UTC' AT TIME ZONE 'South Africa Standard Time'`, so this is corroborated in source but not against live data) | `animal-detail` |
| Any database-level field length or type limits worth mirroring in validation | `animal-management` |
