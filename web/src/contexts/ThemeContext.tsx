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
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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
  // Read the browser's own facts in the initialiser rather than in an effect: on the client
  // these are already true at the first render, which keeps the provider from ever
  // computing a theme the pre-paint script did not. On the server both answer "no choice,
  // no OS signal" — nothing is rendered from them there.
  const [preference, setPreferenceState] =
    useState<ThemePreference>(readStoredPreference);
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);

  // While the preference is "system", the OS setting changing must move the app with it,
  // without a reload (NFR-2). Subscribed unconditionally so the listener also catches a
  // change made while an explicit choice was in force and later cleared.
  useEffect(() => subscribeToSystemDarkChanges(setPrefersDark), []);

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
