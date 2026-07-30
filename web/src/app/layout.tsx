import type { Metadata } from 'next';
import { Inter, Space_Grotesk, Roboto_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ToastContainer } from '@/components/toast/ToastContainer';
import { AppShell } from '@/components/layout/AppShell';
import { THEME_INIT_SCRIPT } from '@/lib/theme/theme-init-script';

// Brand fonts (self-hosted at build via next/font — see project.md §Styling &
// Branding). Variable names match design-tokens.css's --font-primary /
// --font-secondary / --font-mono fallback chains exactly.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Zoo Animal Manager',
  description: 'Manage the zoo’s animal records and browse their habitats',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // No theme class is rendered here: which one is right depends on this browser's stored
    // choice and on the machine's own light/dark setting, neither of which the server can
    // see. The `<head>` script below decides it before `<body>` is parsed, so the page is
    // painted in the right theme once rather than corrected afterwards (R3, NFR-1).
    //
    // `suppressHydrationWarning` is therefore required: the class React rendered and the
    // class in the document legitimately differ by the time hydration compares them. (React
    // treats the prop as reserved and never writes it to the DOM, so no test can assert it —
    // it is a review item, per architecture.md § Decision 4.)
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${robotoMono.variable}`}
    >
      <head>
        {/* Inline and in `<head>` on purpose: the parser must run it before `<body>` exists.
            `next/script`, a client component or an effect all run after hydration, which is
            after the first paint — a visible flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        {/* The shell REPLACES the template's own `<main>` wrapper rather than nesting
            inside it, so the app exposes exactly one `main` landmark (Critical Rule 6, R7).
            `ToastProvider` and `ToastContainer` stay mounted around it: every write outcome
            in this epic is reported through that one channel (NFR-5). `ThemeProvider` wraps
            the lot: it takes the theme over from the script once hydrated, so the app tracks
            the OS setting live and story 2's control has state to read. */}
        <ThemeProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
            <ToastContainer />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
