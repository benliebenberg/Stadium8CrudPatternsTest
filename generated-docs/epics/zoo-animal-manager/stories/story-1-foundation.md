# Story 1 — Server-side backend access foundation

- **Epic:** `zoo-animal-manager` (Zoo Animal Manager)
- **Slug:** `story-1-foundation`
- **Route:** _none — non-routable_
- **Target file:** `web/src/lib/api/server/linx-client.ts`
- **Page action:** `create_new`
- **Roles:** N/A — single user type, roles out of scope
- **Infrastructure only:** `true`
- **Requirement IDs:** R1, R2, R3, R4, R5, R6, BR1, BR2, BR3, BR4, NFR-3, NFR-base-6

## Plain summary

Under-the-hood groundwork so the app can talk to the animal backend safely — the shared key
stays on the server, never in the browser, and the app learns to read the backend's own
"success / warning / error" replies instead of guessing from status codes. Nothing new to look
at yet; every screen after this one depends on it.

## Technical summary

Extract the embedded OpenAPI 3.0.1 document from
`documentation/BackendLinx6Api/CrudPatterns.project/CrudPatterns.folder/Api.folder/CrudPatterns.service/CrudPatterns.properties`
→ `ServiceData.Properties["API definition"]` to `generated-docs/specs/api-spec.yaml` with
`servers:` corrected to `http://localhost:10002/crud-patterns`, and derive `AnimalRead`,
`AnimalWrite`, `HabitatRead` and `DefaultResponse` types from it.

Build the Next.js server tier that proxies all six Linx operations — route handlers
`web/src/app/api/animals/route.ts`, `web/src/app/api/animals/[id]/route.ts`,
`web/src/app/api/habitats/route.ts` over a shared server client — injecting `X-API-Key` from
`API_KEY` and `LastChangedUser` from `LAST_CHANGED_USER` (default `Animal Manager`)
**server-side only**.

Per Critical Rule 6, **replace** (do not wrap):

- `getAuthHeader()` in `web/src/lib/api/client.ts` — reads browser-exposed `NEXT_PUBLIC_API_TOKEN`
- `handleErrorResponse()` in the same file — switches on 401/403/404/500 status codes
- the `lastChangedUser` caller-argument threading through `post`/`put`/`del` and
  `APIRequestConfig` — that value is server-injected configuration, never a caller argument
- `APIMessageType` casing in `web/src/types/api.ts` — currently `SUCCESS`/`ERROR`/`WARNING`,
  the backend sends `Success`/`Warning`/`Error`. Fix in place; do **not** compare
  case-insensitively at call sites.
- `API_BASE_URL` in `web/src/lib/utils/constants.ts` — defaults to `http://localhost:8042`;
  change the default and make the value server-consumed only.

Add the one shared write-result helper that every write path (stories 6–9) consumes.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The canonical API description at `generated-docs/specs/api-spec.yaml` covers all six backend operations and records the corrected base address (`http://localhost:10002/crud-patterns`, not the embedded `http://localhost:10002`), and the animal/habitat/write-result types are derived from it. | vitest |
| AC-2 | Every request that reaches the backend carries the shared key and the fixed change-name attached on the server side, and no credential is ever built from a value the browser can read. | vitest |
| AC-3 | A write's outcome is decided by the reply's message type — `Success`, `Warning` or `Error` in the backend's own casing — and its messages, never by the HTTP status, so a 500 carrying `Warning` is reported as a business rejection rather than a technical fault. | vitest |
| AC-4 | A refused connection or a rejected key resolves into a readable, retryable failure result rather than an unhandled crash, an empty success, or a swallowed error. | vitest |
| AC-5 | The change-name is never accepted as a caller-supplied argument anywhere in the request path — it is read only from server configuration. | vitest |

## Manual test checklist

_None — this story has no screen of its own. It is proven through story 2._

## Notes

- The base-URL correction is not a guess: an unauthenticated probe returned **401** for
  `/crud-patterns/v1/habitats` (route exists, auth enforced) and **404** for `/v1/habitats`.
- `GET /v1/animals/{Id}` returns `AnimalRead` **directly**, not wrapped in `DefaultResponse`
  the way the write operations are (BR8).
- `web/src/__tests__/integration/api-client.test.ts` and `validation-schemas.test.ts` cover the
  template behaviour being replaced here — update them, don't duplicate them.
