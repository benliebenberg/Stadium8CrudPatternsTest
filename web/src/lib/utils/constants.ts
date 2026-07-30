/**
 * Application Constants Template
 *
 * Define your application-specific constants here
 * Examples include API configuration, UI settings, and business logic constants
 */

/**
 * Fallback base address of the Linx CrudPatterns backend — **server-side use only**.
 *
 * Overridden at runtime by the `NEXT_PUBLIC_API_BASE_URL` env var, which is read
 * per-request inside web/src/lib/api/server/linx-client.ts (never captured into a
 * module-level constant, so a server restart is not needed to re-read configuration).
 *
 * This value is `http://localhost:10002/crud-patterns` — WITH the `/crud-patterns`
 * prefix. The OpenAPI document embedded in the Linx solution declares
 * `http://localhost:10002`, which is wrong: an unauthenticated probe of
 * `/crud-patterns/v1/habitats` returned 401 (route exists, auth enforced) while
 * `/v1/habitats` returned 404. The Linx runtime's own Base URI setting wins
 * (project.md §Data Source & Backend Integration).
 *
 * **Nothing the browser runs may consume this.** The browser talks only to this app's
 * own same-origin `/api/*` route handlers; those handlers are the only code that
 * reaches Linx, because the shared API key must never leave the server and the Linx
 * host emits no CORS headers (project.md §Authentication).
 */
export const LINX_API_BASE_URL_DEFAULT = 'http://localhost:10002/crud-patterns';

/**
 * Default pagination settings
 * Customize based on your application's needs
 */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
} as const;

/**
 * Toast notification settings
 */
export const TOAST_SETTINGS = {
  DEFAULT_DURATION: 5000, // 5 seconds
  SUCCESS_DURATION: 3000, // 3 seconds
  ERROR_DURATION: 7000, // 7 seconds
  MAX_TOASTS: 3,
} as const;

/**
 * Modal settings
 */
export const MODAL_SETTINGS = {
  ANIMATION_DURATION: 150, // 150ms for enter/exit animations
} as const;

// Add your application-specific constants below
// Example:
// export const DATE_FORMATS = {
//   DISPLAY: 'dd MMM yyyy',
//   API: 'yyyy-MM-dd',
// } as const;
