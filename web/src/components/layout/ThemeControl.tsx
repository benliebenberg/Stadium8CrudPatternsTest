'use client';

/**
 * The visible half of the theme feature: an icon control offering Light, Dark and System.
 *
 * It owns no theme state of its own — story 1's `ThemeProvider` holds the preference, the
 * live `prefers-color-scheme` listener and the class on `<html>` (architecture.md
 * § Decision 4). This component only *shows* which choice is in force and *reports* a new
 * one, so a pick applies in the same document: no navigation, no reload, no refresh.
 *
 * Three things here are requirements rather than styling choices:
 *
 * - **A single button, not three.** The nav landmark holds exactly two links (Animals,
 *   Habitats) and this is the only button in it, so the three choices live behind a menu.
 * - **The name is on the button, not on the icon.** R4 asks for an icon control, and an
 *   icon-only button with no `aria-label` introduces itself to nobody (BR1).
 * - **The active choice is marked semantically.** `DropdownMenuRadioGroup` +
 *   `DropdownMenuRadioItem` publish `aria-checked` on exactly one option, which is what
 *   AC-4 asks for — a highlight or a bare tick icon would say nothing to a screen reader.
 */

import { MoonIcon, SunIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEME, LIGHT_THEME } from '@/lib/theme/theme-preference';
import type { ThemePreference } from '@/lib/theme/theme-preference';

/** The control's accessible name — the only thing naming it, since the icon is decorative. */
const CONTROL_LABEL = 'Theme';

interface ThemeChoice {
  readonly preference: ThemePreference;
  /**
   * User-visible copy. Each label names exactly one of Light / Dark / System: wording that
   * named two ("Follow system (dark)") would read as two different choices at once.
   */
  readonly label: string;
}

/**
 * Offered in the order a person reads them, with "follow the OS" last because it is the
 * hand-back rather than a look. `'system'` is a preference, never a stored value — choosing
 * it clears the store (Decision 4), which `writeStoredPreference` handles.
 */
const THEME_CHOICES: readonly ThemeChoice[] = [
  { preference: LIGHT_THEME, label: 'Light' },
  { preference: DARK_THEME, label: 'Dark' },
  { preference: 'system', label: 'System' },
];

/** Narrows the menu's string value back to a preference, over the choices actually offered. */
function isThemePreference(value: string): value is ThemePreference {
  return THEME_CHOICES.some((choice) => choice.preference === value);
}

export function ThemeControl() {
  const { preference, setPreference } = useTheme();

  const handleChoice = (value: string): void => {
    if (isThemePreference(value)) {
      setPreference(value);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={CONTROL_LABEL}>
          {/* Which icon shows is driven by the `dark` class itself rather than by React
              state, so it is already right at the first paint — the pre-paint script has
              set that class before this markup is parsed, and rendering the icon from
              state would mean the server guessed a theme it cannot see. */}
          <SunIcon aria-hidden="true" className="dark:hidden" />
          <MoonIcon aria-hidden="true" className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={preference} onValueChange={handleChoice}>
          {THEME_CHOICES.map((choice) => (
            <DropdownMenuRadioItem
              key={choice.preference}
              value={choice.preference}
            >
              {choice.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
