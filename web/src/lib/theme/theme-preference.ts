/**
 * The theme contract, in exactly one place — `architecture.md` § Decision 4.
 *
 * Every part of the theme feature (the pre-paint script, the React state, story 2's
 * control) reads its facts from here so the storage key, the stored values and the applied
 * class cannot drift apart:
 *
 * | Storage key      | `localStorage['theme']` — {@link THEME_STORAGE_KEY}                 |
 * | Stored values    | `'light'` or `'dark'` only — never `'system'`                        |
 * | "Follow the OS"  | the ABSENCE of the key; choosing System removes it                  |
 * | Applied class    | `dark` on `<html>`; light is that class being ABSENT                 |
 * | OS source        | `matchMedia('(prefers-color-scheme: dark)')`                        |
 *
 * Environment-neutral and React-free: every function that touches a browser API guards for
 * its absence, so this module is safe to import from a server component and from jsdom
 * (which implements no `matchMedia` at all).
 *
 * Storage access can THROW rather than return null — private browsing and blocked-storage
 * settings both do it — so every read and write here is wrapped. An unreadable store is
 * treated as an empty one: no stored choice, therefore follow the OS.
 */

/**
 * The `localStorage` key holding the person's explicit choice.
 *
 * Exported so nothing hardcodes the string: the pre-paint script interpolates it, the
 * React state reads through it, and story 2's control writes through it.
 */
export const THEME_STORAGE_KEY = 'theme';

/** The two values that may ever be stored. `'system'` is the absence of the key. */
export const LIGHT_THEME = 'light';
export const DARK_THEME = 'dark';

/**
 * The class `web/src/styles/design-tokens.css` keys its dark token block off (and that
 * `globals.css` registers as Tailwind's `dark` variant). There is deliberately no `light`
 * class — light is the bare `:root` values, i.e. this class being absent.
 */
export const DARK_THEME_CLASS = 'dark';

/** The OS signal, used for both the pre-paint read and the live change listener. */
export const SYSTEM_DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/** What the person chose in the app. `'system'` means "no explicit choice — follow the OS". */
export type ThemePreference = typeof LIGHT_THEME | typeof DARK_THEME | 'system';

/** What is actually applied to `<html>` at any moment. Never a third value. */
export type ResolvedTheme = typeof LIGHT_THEME | typeof DARK_THEME;

/** Is this what a stored preference looks like? Anything else means "follow the OS". */
function isStoredTheme(value: unknown): value is ResolvedTheme {
  return value === LIGHT_THEME || value === DARK_THEME;
}

/**
 * The stored preference, or `'system'` when nothing is stored, the value is unrecognised,
 * or the store cannot be read at all.
 */
export function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isStoredTheme(stored) ? stored : 'system';
  } catch {
    // Storage is unreadable (private browsing, blocked storage). An unreadable store holds
    // no choice, so the OS setting decides — never an implicit dark (R2).
    return 'system';
  }
}

/**
 * Persist an explicit choice, or clear the key when the choice is System — the absence of
 * the key IS "follow the OS", so there is no `'system'` value to write.
 */
export function writeStoredPreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (preference === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage is unwritable. The choice still applies to this page — it simply will not
    // survive a reload, which is better than failing the interaction.
  }
}

/** Whether the operating system is currently asking for dark. */
export function systemPrefersDark(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }

  return window.matchMedia(SYSTEM_DARK_MEDIA_QUERY).matches;
}

/**
 * Watch the OS setting for changes, so an app that is following the system tracks a change
 * made while it is open — with no reload (NFR-2).
 *
 * @returns an unsubscribe function, safe to call even when there was nothing to watch.
 */
export function subscribeToSystemDarkChanges(
  onChange: (prefersDark: boolean) => void,
): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => undefined;
  }

  const query = window.matchMedia(SYSTEM_DARK_MEDIA_QUERY);
  const handleChange = (event: MediaQueryListEvent): void => {
    onChange(event.matches);
  };

  query.addEventListener('change', handleChange);
  return () => query.removeEventListener('change', handleChange);
}

/** The theme a preference resolves to, given what the OS is currently asking for. */
export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') {
    return prefersDark ? DARK_THEME : LIGHT_THEME;
  }

  return preference;
}

/**
 * Put the resolved theme on `<html>`.
 *
 * Only touches the attribute when it is actually wrong: setting a class attribute to the
 * value it already has still notifies a `MutationObserver`, and "the theme never changes
 * after the page appears" (AC-2) is asserted over exactly those notifications.
 */
export function applyResolvedTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const shouldBeDark = theme === DARK_THEME;

  if (root.classList.contains(DARK_THEME_CLASS) === shouldBeDark) {
    return;
  }

  root.classList.toggle(DARK_THEME_CLASS, shouldBeDark);
}
