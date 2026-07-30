import type { Metadata } from 'next';
import { Inter, Space_Grotesk, Roboto_Mono } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { ToastContainer } from '@/components/toast/ToastContainer';
import { AppShell } from '@/components/layout/AppShell';

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
    <html
      lang="en"
      className={`dark ${inter.variable} ${spaceGrotesk.variable} ${robotoMono.variable}`}
    >
      <body className="antialiased">
        {/* The shell REPLACES the template's own `<main>` wrapper rather than nesting
            inside it, so the app exposes exactly one `main` landmark (Critical Rule 6, R7).
            `ToastProvider` and `ToastContainer` stay mounted around it: every write outcome
            in this epic is reported through that one channel (NFR-5). */}
        <ToastProvider>
          <AppShell>{children}</AppShell>
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}
