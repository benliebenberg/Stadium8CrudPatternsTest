'use client';

/**
 * The app's theme state: which preference is in force, what it resolves to, and how to
 * change it. Mounted once by `layout.tsx` so every screen shares one copy (NFR-4).
 *
 * Division of labour with the pre-paint script (`theme-init-script.ts`):
 *
 * - the **script** owns the class for the first paint, because only the browser knows the
 *   stored choice and only the parser can act before `<body>` exists;
 * - this **provider** owns it from hydration onwards — a change of preference (story 2's
 *   control) and a change of the OS setting while the app is open (NFR-2).
 *
 * Both derive the class from the same contract in `theme-preference.ts`, so the hand-over is
 * a no-op: on mount the provider computes the value the script already applied and
 * {@link applyResolvedTheme} leaves the attribute untouched. That silence is what keeps
 * AC-2 ("the theme never changes after the page appears") true.
 *
 * A provider rather than a provider-free hook: the theme is one piece of global state with
 * one media-query listener and one writer of the class, however many consumers read it —
 * and mounting it in `layout.tsx` puts it in the same place as `ToastProvider`, the pattern
 * this project already uses for app-wide state.
 *
 * The two halves of the state are held differently on purpose. The person's *preference* is
 * ordinary React state — only this app changes it. The *OS setting* is an external store
 * read through `useSyncExternalStore`, because the operating system changes it whenever it
 * likes, including in the gap between a render and its commit; see the note on that call.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import type { ReactNode } from 'react';

import {
  applyResolvedTheme,
  readStoredPreference,
  resolveTheme,
  subscribeToSystemDarkChanges,
  systemPrefersDark,
  writeStoredPreference,
} from '@/lib/theme/theme-preference';
import type {
  ResolvedTheme,
  ThemePreference,
} from '@/lib/theme/theme-preference';

export interface ThemeContextValue {
  /** What the person chose: `'light'`, `'dark'`, or `'system'` for "follow the OS". */
  readonly preference: ThemePreference;
  /** What that currently resolves to — the theme actually on screen. */
  readonly resolvedTheme: ResolvedTheme;
  /** Choose a theme: applied immediately and remembered for this browser (System clears it). */
  readonly setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  // The person's own choice. This one genuinely is React state: nothing outside the app
  // changes it, only `setPreference` below. Read in the initialiser rather than an effect so
  // the provider never computes a theme the pre-paint script did not; on the server there is
  // nothing to read and it starts at "system", which is rendered nowhere (see below).
  const [preference, setPreferenceState] =
    useState<ThemePreference>(readStoredPreference);

  // The OS setting is an EXTERNAL store: something outside React owns it and changes it at
  // moments React does not control. `useSyncExternalStore` is the hook for exactly that
  // shape, and `theme-preference.ts` already exposes the subscribe/read pair it wants.
  //
  // Using it — rather than seeding `useState` and correcting it from an effect — is what
  // makes the render-to-commit gap safe *by construction*: having committed, React re-reads
  // `systemPrefersDark()` itself and re-renders if the answer moved, so an OS flip landing
  // between this render and the listener existing cannot be lost. That check is React's own,
  // so there is no synchronous `setState` in an effect to write (NFR-2, and the reason this
  // is not a `useEffect` any more).
  //
  // `getServerSnapshot` is deliberately the SAME reader as the client snapshot. React uses it
  // for the hydration render as well as the server render, and that is the whole point here:
  // a constant `false` would honour "the server snapshot is the same on both sides"
  // literally, but on an OS-dark machine the hydration commit would then resolve LIGHT and
  // the effect below would strip the class the pre-paint script had correctly applied before
  // putting it straight back — the exact flash AC-2 forbids. Passing the real reader is safe
  // because this value reaches no rendered markup on either side:
  //
  //   - `<html>` deliberately server-renders no theme class; the pre-paint script owns it and
  //     the effect below writes it imperatively, after the commit, never as rendered output
  //     (so `suppressHydrationWarning`, which covers only `<html>` itself, is not being
  //     leaned on here);
  //   - `ThemeControl`'s sun/moon icon is switched by CSS (`dark:hidden`), not by this value;
  //   - its menu items read `preference`, not this, and are not mounted until the menu opens.
  //
  // There is therefore nothing for hydration to compare and no mismatch available. On the
  // server the reader returns `false` because `window` is undefined — the only answer a
  // server can give about a machine it cannot see; on the client it returns the truth.
  const prefersDark = useSyncExternalStore(
    subscribeToSystemDarkChanges,
    systemPrefersDark,
    systemPrefersDark,
  );

  const resolvedTheme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredPreference(next);
    setPreferenceState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * The theme state, for any control that shows or changes it.
 *
 * @throws when used outside {@link ThemeProvider} — a control that cannot find the state
 *   would silently show the wrong theme, so this fails loudly instead.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
