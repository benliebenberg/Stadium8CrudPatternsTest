# Crud Patterns — Animal & Habitat Manager

An internal back-office tool for managing zoo Animal records (and browsing their Habitats) against an existing Linx-hosted REST backend. There is no end-user login and no role model — every call is authenticated with a single shared API key, and there is exactly **one kind of user** for this project; roles/permissions are explicitly out of scope (see §Roles & Permissions).

| Field | Value |
|---|---|
| Project slug | `crud-patterns` |
| Created | 2026-07-29T00:00:00Z |
| Intake source | docs |
| Backend connectivity | verified |

---

## Roles & Permissions

**Template:** none / single user type — roles out of scope

There is exactly **one kind of user**. No Admin/User distinction — and no role model at all — exists anywhere in this app.

| Resource | Access |
|---|---|
| Animals | Full read, create, edit, delete |
| Habitats | Read-only |

> **Habitats being read-only is a backend limitation, not a permission rule.** Only `GET /v1/habitats` exists on the Linx backend — there is no create/update/delete endpoint for Habitats at all (see §Data Source & Backend Integration). It applies identically and unconditionally to the single user type; it is not gated by any role or access-control check.

> **Explicitly out of scope — do not inherit into any epic:** manage users, view audit log, manage system settings, Admin-only delete. None of these have a backend behind them. Likewise out of scope: any role switch, any role-gated UI, any role-gated routes, any display-only role toggle. Real permission enforcement would require *both* a sign-in surface and a backend change — neither exists today, and introducing either is explicitly not part of this project.

> **Non-regulatory security note (retained — architectural constraint, not a feature to build):** because the API key is a single shared secret held by the server, anyone who can reach the app has full read and write access to every Animal record. There is no per-person identity or accountability. This is a stated project constraint, not something to be implemented or mitigated by a feature. (See also §Compliance.)

> This section describes a backend capability constraint (Habitats has no write endpoints), not a permission model — there is no permission model to extend during BUILD. If a future backend adds Habitat write endpoints, that change lands via a project-change PR (§6.1 of the epic-branch plan) and halts for user review.

---

## Authentication

| Field | Value |
|---|---|
| Method | `custom` |
| BFF login endpoint (if BFF) | N/A |
| BFF userinfo endpoint (if BFF) | N/A |
| BFF logout endpoint (if BFF) | N/A |
| Custom auth notes (if custom) | API-key-only. There is **no user login and no user store** — the Linx backend has no OIDC, no session concept, and no per-user identity. Every API operation requires an `X-API-Key` request header, validated by the backend against a single shared secret. **Architectural consequence:** the API key is a server-side secret and must **never** be exposed to the browser. The browser must NOT call the Linx API directly — all Linx API access goes through the Next.js server tier (server components and/or route handlers under `web/src/app/api/...`), which injects `X-API-Key` server-side and proxies to Linx. This also sidesteps a second problem: the Linx REST host's "CORS origins" property is unset (`null`), so it will not emit `Access-Control-Allow-Origin` and direct browser calls would be blocked by CORS regardless (see §Data Source CORS/proxy notes). Env vars: `API_KEY` (server-only, **not** `NEXT_PUBLIC_*`, holds the shared secret) and `NEXT_PUBLIC_API_BASE_URL` (non-secret — the base URL Next.js's server tier proxies to; the browser itself only ever talks to Next.js routes). |

> Auth method is never inferred — the user must confirm explicitly per [authentication-intake.md](.claude/policies/authentication-intake.md).

---

## Data Source & Backend Integration

| Field | Value |
|---|---|
| Data source | `existing-api` |
| Backend status | `running` |
| Mock layer required | no |

### Backend connectivity (when applicable)

| Aspect | Value |
|---|---|
| Base URL | `http://localhost:10002/crud-patterns` |
| Auth scheme | apiKey |
| Auth header | `X-API-Key` |
| Auth value format | `{token}` |
| Credential env vars | `API_KEY` (server-only), `LAST_CHANGED_USER` (server-only), `NEXT_PUBLIC_API_BASE_URL` |
| Smoke-test endpoint | `GET /v1/habitats` |
| Smoke-test mode | full |
| Smoke-test status | verified |
| Smoke-test verified at | 2026-07-29 |
| Smoke-test notes | Two conflicting base-URL values existed: the embedded OpenAPI `servers:` block says `http://localhost:10002` (no path prefix), while the Linx runtime "Base URI" setting (`App.settings` → `CrudPatternsBaseUri`) says `http://localhost:10002/crud-patterns`. Resolved empirically by unauthenticated probe: `GET http://localhost:10002/crud-patterns/v1/habitats` → 401 (route exists, auth enforced); `GET http://localhost:10002/v1/habitats` → 404 (route does not exist). **The Linx runtime setting wins** — `http://localhost:10002/crud-patterns` is authoritative; the embedded spec's `servers:` value is wrong/display-only and must be corrected when the spec is extracted to canonical form. Full authenticated smoke test (`GET /v1/habitats` with `X-API-Key`) was run by the user via curl and returned `200 OK` with a `{ "Habitats": [...] }` body. |
| CORS / proxy notes | The Linx REST host's "CORS origins" property is unset (`null`), so it will not emit `Access-Control-Allow-Origin` — direct browser→Linx calls would be blocked by CORS regardless of the API-key concern. This is mitigated by the server-proxy architecture described in §Authentication (browser calls Next.js routes only). Recorded as a known constraint, not an open blocker. |

### `LastChangedUser` header — fixed, server-configured value (same mechanism as `X-API-Key`)

Every write to `/v1/animals` (`POST`, `PUT`, `DELETE`) requires a `LastChangedUser` HTTP header. There is no login in this app, and the user has decided this value is a **single fixed name set at deployment** — not something a person types in or that the app derives per-request.

| Field | Value |
|---|---|
| Header | `LastChangedUser` (required on every write: `POST` / `PUT` / `DELETE` on `/v1/animals`) |
| Injected by | The Next.js server tier, in the same place it injects `X-API-Key` — the browser is never involved |
| Source | Server-only env var `LAST_CHANGED_USER` (**not** `NEXT_PUBLIC_*`), with a sensible default such as `Animal Manager` |
| Explicitly NOT implemented | Any name prompt, any browser-stored name, any "who are you?" dialog, any in-app way to change the value. This is deployment configuration only. |

> **Consequence for UI design:** every Animal record will show the **same** `LastChangedUser` value, regardless of who or what actually made the change. `LastChangedDate` is therefore a meaningful audit trail ("when it changed"), but `LastChangedUser` carries **no real per-person information** ("who changed it"). No feature — including the animal detail screen — may present `LastChangedUser` as genuine attribution.

> **`LastChangedDate` display note:** the value arrives from the backend **pre-formatted and already converted to South Africa Standard Time (SAST)**. It must be displayed exactly as given — it must **never** be re-parsed as UTC or converted a second time by the frontend.

### API specs

| Path | Source |
|---|---|
| `documentation/BackendLinx6Api/CrudPatterns.project/CrudPatterns.folder/Api.folder/CrudPatterns.service/CrudPatterns.properties` → `ServiceData.Properties["API definition"]` | user-provided (embedded design-time string, not a standalone `.yaml`/`.json` file) |

> There is **no standalone OpenAPI file** in `documentation/`. A complete, hand-authored OpenAPI 3.0.1 document is embedded as a design-time string property inside the Linx service definition at the path above. BUILD must extract it to the canonical `generated-docs/specs/api-spec.yaml`, with the `servers:` value **corrected** to `http://localhost:10002/crud-patterns` per the resolution above.

### Backend integration notes (project-wide — applies to every epic touching this API)

- **All six operations require `X-API-Key`; there is no unauthenticated endpoint.** Surface: `GET /v1/animals`, `POST /v1/animals`, `GET /v1/animals/{Id}`, `PUT /v1/animals/{Id}`, `DELETE /v1/animals/{Id}`, `GET /v1/habitats`.
- **Habitats are read-only** — only `GET /v1/habitats` exists. There is no habitat create/update/delete endpoint. Habitats can only be used as a lookup/dropdown source when creating or editing an Animal; a habitat-management UI has no backend to call.
- **`LastChangedUser` is a required HTTP header** (not a body field) on every write operation (`POST`/`PUT`/`DELETE` on `/v1/animals`). This is now a **resolved, fixed decision** — see the dedicated subsection above ("`LastChangedUser` header — fixed, server-configured value"). The server tier injects a single server-configured name (`LAST_CHANGED_USER` env var) on every write; there is no per-user prompt, no browser-stored name, and no in-app way to change it.
- **Errors arrive as HTTP 500** with a `DefaultResponse` body (`{ Id, MessageType, Messages[] }`) — the same shape used for successful writes (`Id`/`MessageType`/`Messages` populated on success too) — rather than conventional 4xx validation responses. Error handling must read the message payload, not rely on status codes alone.
- **`AnimalCreate` and `AnimalUpdate` have a dedicated duplicate-record error path** (`ReturnDuplicateRecordError.function` in the Linx solution), implying a DB uniqueness constraint — most likely on `Animal.Name`. The exact rule is not visible in the solution files as provided. Create/edit forms must handle a duplicate-name failure gracefully; the precise constraint needs confirming against the running backend.

---

## Compliance

**Applicable domains:** None
**Region (if Personal data applies):** N/A

### Compliance Requirements

- No compliance domains were identified during intake screening. This is a zoo/animal CRUD dataset — no PII, PHI, payment, or financial data is involved.
- `[INFERRED]` Accessibility: WCAG 2.1 Level AA baseline (see §Baseline NFRs, always applied).
- **Non-regulatory security note:** because auth is a single shared API key with no per-user identity, anyone holding the frontend deployment has full read/write access to all Animal and Habitat data. This is not a compliance/regulatory gap given the data sensitivity here, but it is worth stating explicitly as an architectural trade-off.

---

## Styling & Branding

| Field | Value |
|---|---|
| Primary brand color | `#ff6b01` (Digiata orange) |
| Accent / secondary | `#ff8c3a` (hover), `#ad4800` (pressed / dark variant, also the safe light-theme substitute) |
| Background (light) | `#fff9ec` (cream page background, `:root`) |
| Background (dark, if applicable) | `#090909` (page background, `.dark`) |
| Font family (headings) | Space Grotesk (`--font-secondary`) — open substitute for the brand's licensed `Roobert` |
| Font family (body) | Inter (`--font-primary`) — open substitute for the brand's licensed `Sequel Sans Book Disp` |
| Theme | **Both light and dark are supported, first-class themes**, each with its own acceptance criteria. Dark remains the *default* look and is the brand's own presentation (`digiata.com` renders dark) — but light is a genuine, tested theme, not a fallback or a nice-to-have. See "Theme selection" below for the current implementation gap. |
| Source | live-site harvest — computed styles and CSS custom properties read from `https://www.digiata.com/` during INTAKE on 2026-07-29 |

> `[INFERRED]` Palette, typography, and full token set harvested directly from the brand site (not approximated) — see the complete token tables below. All values here are **authoritative** for `design-style-agent`, which must emit them as CSS custom properties in `web/src/app/globals.css`. **No hex literal may appear in any component file** — every value below becomes a token per [styling-centralisation.md](.claude/policies/styling-centralisation.md); components reference tokens by name only (`bg-primary`, `text-foreground`, `var(--color-brand-primary)`, etc.).

### Theme selection — Light / Dark / System

The person using the app chooses their theme: **Light**, **Dark**, or **System**. Behaviour:

- **First visit (no stored preference):** follow the operating system's `prefers-color-scheme` media query. Do not default to dark regardless of OS preference — that would override a preference the person has already expressed at the OS level without them asking for it.
- **Explicit choice:** once the person picks Light or Dark via the in-app toggle, remember that choice per browser (e.g. `localStorage`) and apply it on every subsequent visit, regardless of what the OS preference does afterwards.
- **"System":** returns the app to following the OS preference live — including reacting to the OS preference changing while the app is open, if the person hasn't since made an explicit choice.
- **Never silently override an expressed preference.** The only two ways the active theme changes are: the person choosing Light/Dark/System in the app, or (while on "System") the OS preference itself changing.

> **Known gap — light theme is defined but unproven.** The light-theme token values already exist in `web/src/styles/design-tokens.css` under `:root` (dark lives under `.dark`), produced during the epic-1 styling pass. They have never actually been rendered in the browser, because `web/src/app/layout.tsx` hardcodes `className="dark"` on `<html>` unconditionally — there is no toggle, no `prefers-color-scheme` read, and no stored-preference mechanism yet. This is the main risk in bringing light mode live: the token values are believed correct (see contrast table below) but have not been visually verified end-to-end. Building the toggle, the OS-preference read, and the stored-preference mechanism — and then visually verifying the light theme for the first time — is epic-scoped work, not a documentation change.

> **Known gap — toast styling is not on tokens.** `web/src/components/toast/Toast.tsx` and `ToastContainer.tsx` style themselves with raw Tailwind colour utilities (`bg-white`, `border-red-500`, `text-green-500`, `text-gray-900`) rather than the design tokens (`--card`, `--destructive`, `--success`, `--warning`) — logged as cross-epic debt in `generated-docs/architecture.md`. This is invisible while the app is permanently dark, but it means notifications will almost certainly render with wrong/clashing colours in light mode (e.g. a white toast card on an already-white/cream light background, or dark-theme-tuned status colours that fail contrast on cream). Re-skinning the toast components onto the token set is part of making light mode real, not an optional polish item.

### Brand colours

| Token | Hex | Usage |
|---|---|---|
| `--color-brand-primary` | `#ff6b01` | Digiata orange — accent / primary action |
| `--color-brand-primary-dark` | `#ad4800` | Pressed state; also the required orange substitute if a light surface is ever introduced (see accessibility below) |
| `--color-brand-primary-light` | `#ff8c3a` | Hover state |
| `--color-brand-primary-80` | `#ff6b01cc` | 80%-opacity orange (overlay/emphasis use) |

### Neutrals — warm cream-to-black ramp (NOT grey — preserve the warmth)

| Token | Hex | Usage |
|---|---|---|
| `--color-neutral-light` | `#fff9ec` | Cream — primary text on dark |
| `--color-neutral-light-medium` | `#e6e1d5` | Secondary light neutral |
| `--color-neutral-light-grey2` | `#dad6cb` | Tertiary light neutral |
| `--color-neutral-light-grey` | `#a8a8a8` | Muted / secondary text |
| `--color-neutral-medium-grey` | `#282828` | Raised surface / card |
| `--color-neutral-medium-grey2` | `#333333` | Border / divider |
| `--color-neutral-dark-grey` | `#181818` | Secondary surface |
| `--color-neutral-xdark-grey` | `#090909` | Page background |
| `--color-neutral-light-10` | `#fff9ec1a` | 10% cream — subtle overlay / hairline |
| `--color-neutral-light-5` | `#fff9ec0d` | 5% cream — subtlest overlay |

### Semantic roles (both themes — derive in `globals.css` from the ramp above)

Dark (`.dark`) is the default theme; light (`:root`) is the equally-supported alternative the person can switch to. Both sets already exist in `web/src/styles/design-tokens.css`.

| Role | Dark (`.dark`, default) | Light (`:root`) |
|---|---|---|
| Background | `#090909` | `#fff9ec` |
| Surface / card | `#181818`; raised surface `#282828` | `#ffffff` (card / popover) |
| Border / divider | `#333333` (or `--color-neutral-light-10` for hairlines) | `#dad6cb` |
| Text — primary | `#fff9ec` | `#090909` |
| Text — muted | `#a8a8a8` | `#6b6558` |
| Accent / action | `#ff6b01`; hover `#ff8c3a`; pressed `#ad4800` | `#ad4800` (no full-brightness orange — see hard rule below) |
| Text ON accent (filled buttons) | `#090909` — **never cream** on a filled-orange surface | `#fff9ec` on the `#ad4800` fill |

### Typography

| Token | Open substitute | Real brand face it stands in for | Notes |
|---|---|---|---|
| `--font-primary` | Inter | `Sequel Sans Book Disp` (commercial licence) | Body/UI text |
| `--font-secondary` | Space Grotesk | `Roobert` (commercial licence) | Headings/display — closest open geometric grotesque match |
| `--font-mono` | Roboto Mono | `Robotomono Variablefont Wght` | **Exact match**, not a substitute |

All three load via `next/font/google` (self-hosted at build time, `display: swap`) — no licensed font is self-hosted (no licence) or hot-linked from `digiata.com` (no external runtime dependency). Token names are kept brand-neutral so the real licensed faces can be dropped in later by editing `globals.css` only, with zero component churn. Record a comment in `globals.css` naming the real brand face each token substitutes, so a future licence purchase is a one-line change.

**Type scale (exact, from the site):**

| Token | Size / line-height |
|---|---|
| `--text-display` | `10rem` / `1em` (marketing-scale; likely unused in this CRUD app — recorded anyway) |
| `--text-h1` | `4rem` / `1.1em` |
| `--text-h2` | `3rem` / `1.2em` |
| `--text-h3` | `2rem` / `1.3em` |
| `--text-h4` | `1.125rem` / `1.3em` |
| `--text-body` | `1rem` / `1.5em` |
| `--text-body-md` | `1.125rem` / `1.5em` |
| `--text-body-lg` | `1.5rem` / `1.5em` |
| `--letter-spacing-tight` | `-0.03em` — a signature part of the brand look; apply to headings/display sizes |

Font weights in use: **400 and 500 only** — the brand does not use bold (600/700). Emphasis comes from size, colour, and weight 500, not `font-bold`.

> **Guidance for BUILD (not a hard rule):** the 4rem/3rem heading sizes are marketing-page scale. This is a dense data-CRUD app, so in-app `h1`/`h2` should generally render at the smaller end of the scale (the `--text-h3`/`--text-h4` values), reserving `--text-h1`/`--text-h2`/`--text-display` for any landing/empty-state hero content.

### Radius & spacing

| Token | Value |
|---|---|
| `--radius-main` | `0.75rem` |
| `--radius-small` | `0.375rem` |
| `--space-1` | `1rem` |
| `--space-1-5` | `1.5rem` |
| `--space-2` | `2rem` |
| `--space-2-5` | `2.5rem` |
| `--space-3` | `3rem` |
| `--space-4` | `4rem` |
| `--space-6` | `6rem` |
| `--space-7` | `7rem` |
| `--grid-gap-main` | `1rem` |

Tailwind's own finer-grained spacing utilities remain available for sub-1rem gaps — these tokens define the brand's larger rhythm only.

### Accessibility — verified contrast ratios (constraints, not suggestions)

Measured against the actual token values. The accessibility scan runs in **both** themes now that light is a first-class, tested theme — not just against dark.

**Dark theme (`.dark`, default):**

| Pair | Ratio | Result | Use |
|---|---|---|---|
| Cream `#fff9ec` on bg `#090909` | 19.0:1 | AAA | Primary text — excellent |
| Muted `#a8a8a8` on bg `#090909` | 8.4:1 | AAA | Secondary text — safe |
| Orange `#ff6b01` on bg `#090909` | 6.9:1 | AA | Usable as link/accent **text** on dark |
| Ink `#090909` on orange fill | 6.9:1 | AA | Correct text colour for a filled orange button |

**Light theme (`:root`):**

| Pair | Ratio | Result | Use |
|---|---|---|---|
| Ink `#090909` on bg `#fff9ec` | 19.0:1 | AAA | Primary text — excellent |
| Muted `#6b6558` on bg `#fff9ec` | 5.5:1 | AA | Secondary text — safe |
| Cream `#fff9ec` on primary fill `#ad4800` | 5.4:1 | AA | Correct text colour for a filled-primary button on light |

> **HARD RULE — already honoured in the light tokens and must stay that way:** orange `#ff6b01` on cream `#fff9ec` = **2.7:1**, which **fails WCAG AA for all text sizes**. Therefore, on any light surface the orange must **not** be used for text or icons. `--primary` under `:root` is already set to `#ad4800` (the safe darker substitute) precisely because of this — that is a **deliberate** choice, not a mistake, and must **not** be "corrected" back to `#ff6b01`. Orange remains fine as a **fill** with near-black `#090909` text on it, in either theme. On dark, orange as text is fine (6.9:1) — that safety simply does not transfer to light.

> **Status/feedback colours — both themes already exist.** Digiata's palette is single-accent and has no harvested success/warning/destructive colours, so these are a BUILD decision, recorded here for both themes:
>
> | Role | Dark (`.dark`) | Ratio | Light (`:root`) | Ratio |
> |---|---|---|---|---|
> | Destructive | `#ff5c5c` | 6.6:1 AA | `#c93a3e` | 4.8:1 AA |
> | Success | `#7cb342` | 8.0:1 AAA | `#4d7c22` | 4.7:1 AA |
> | Warning | `#c9a227` | 8.2:1 AAA | `#8a6d1a` | 4.7:1 AA |
>
> The light variants are deliberately darker than their dark-theme counterparts, since they sit on cream (`#fff9ec`) rather than near-black (`#090909`). In **either** theme, the destructive colour must **never** be the brand orange — orange reads as the primary action in this palette, and a destructive-orange delete button would be genuinely dangerous.

### Provenance

Source: `https://www.digiata.com/` — computed styles and CSS custom properties read from the live site during INTAKE on **2026-07-29**. Recorded with URL and date so the origin of these values is traceable and re-checkable if the brand site changes.

> Component-specific styling (button radii beyond the tokens above, card shadows, etc.) still emerges during BUILD. This section captures palette, typography, spacing, and radius tokens per [styling-centralisation.md](.claude/policies/styling-centralisation.md) — all values above are hex/rem, never oklch.

---

## Baseline NFRs

- **NFR-base-1:** Accessibility — WCAG 2.1 Level AA baseline
- **NFR-base-2:** Performance — First Contentful Paint < 2.5s on a mid-tier mobile network
- **NFR-base-3:** Responsive design — mobile (≥360px) / tablet (≥768px) / desktop (≥1280px) breakpoints
- **NFR-base-4:** Browser support — latest two versions of Chrome / Edge / Firefox / Safari
- **NFR-base-5:** Error UX — user-visible error states with retry affordance for all async operations
- **NFR-base-6:** Backend error handling — the Linx REST host returns errors as HTTP 500 with a `DefaultResponse` body (`MessageType`/`Messages[]`), not conventional 4xx status codes. Client-side error handling for every write operation must parse the response body rather than relying on status codes alone.

---
