/**
 * The pre-paint theme script — the whole of R3 / NFR-1.
 *
 * `layout.tsx` renders this as an inline `<script>` in `<head>`, so the HTML parser runs it
 * BEFORE `<body>` exists. That timing is the requirement, not an optimisation: the stored
 * choice lives in the browser, which the server cannot see, so anything hydration-timed (a
 * `useEffect`, `next/script` with `afterInteractive`) paints the wrong theme first and
 * corrects it visibly — the flash this story exists to remove.
 *
 * It is a plain string because it must be evaluated by the parser rather than bundled and
 * executed after hydration. Everything about the contract it implements is interpolated from
 * `theme-preference.ts`, so the key, the values and the class have a single source; only the
 * three lines of logic live here.
 *
 * Deliberately tiny and total:
 * - reads the stored preference, and treats an unreadable store as an empty one;
 * - falls back to `prefers-color-scheme` when no choice is stored (R2 — absence is never an
 *   implicit dark);
 * - wraps everything, because a throw in here would take the theme class with it and break
 *   the first paint of the whole app.
 */
import {
  DARK_THEME,
  DARK_THEME_CLASS,
  LIGHT_THEME,
  SYSTEM_DARK_MEDIA_QUERY,
  THEME_STORAGE_KEY,
} from '@/lib/theme/theme-preference';

/** A contract value as a JS string literal, safe to embed in the script source. */
function asScriptLiteral(value: string): string {
  return JSON.stringify(value);
}

export const THEME_INIT_SCRIPT = `(function () {
  try {
    var stored = null;
    try {
      stored = window.localStorage.getItem(${asScriptLiteral(THEME_STORAGE_KEY)});
    } catch (storageError) {
      stored = null;
    }
    var dark =
      stored === ${asScriptLiteral(DARK_THEME)} ||
      (stored !== ${asScriptLiteral(LIGHT_THEME)} &&
        window.matchMedia(${asScriptLiteral(SYSTEM_DARK_MEDIA_QUERY)}).matches);
    document.documentElement.classList.toggle(${asScriptLiteral(DARK_THEME_CLASS)}, dark);
  } catch (themeError) {
    // Leave the class alone. Light — the bare \`:root\` tokens — is the safe fallback, and a
    // throw escaping this script would stop the document before anything is painted.
  }
})();`;
