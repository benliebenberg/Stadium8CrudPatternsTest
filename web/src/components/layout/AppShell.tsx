/**
 * The shared frame every screen renders inside: the app's name, the section navigation, and
 * the single `<main>` landmark.
 *
 * This **replaces** the starter template's `<main>` wrapper rather than nesting inside it
 * (Critical Rule 6). Two `<main>` landmarks is an accessibility failure, and the shell is the
 * one place that may own the landmark — so no page component renders its own.
 *
 * Not a client component: only the nav needs the current path.
 */

import type { ReactNode } from 'react';

import { AppNav } from '@/components/layout/AppNav';

/** The app's own name in the chrome — never a person's name; there is no signed-in user. */
const APP_NAME = 'Zoo Animal Manager';

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border bg-background border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <span className="font-secondary text-h4 tracking-tight">
            {APP_NAME}
          </span>
          <AppNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
