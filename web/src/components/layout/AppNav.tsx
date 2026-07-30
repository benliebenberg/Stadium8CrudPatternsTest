'use client';

/**
 * The app shell's section navigation — Animals and Habitats, the only two sections this app
 * has (there is no sign-in, account or sign-out surface anywhere: project.md §Authentication,
 * brief BR15).
 *
 * The current section is marked with `aria-current="page"`, which is what actually tells
 * assistive technology "you are here"; the background tint is the sighted equivalent, not the
 * signal. Colour alone would leave the state unperceivable to a screen-reader user.
 *
 * A client component because the current section is read from the path.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { ANIMALS_ROUTE, HABITATS_ROUTE } from '@/lib/routes';

interface NavSection {
  /** The accessible name of the link — user-visible copy. */
  readonly label: string;
  readonly href: string;
  /** Which paths belong to this section, including its detail screens. */
  readonly owns: (pathname: string) => boolean;
}

const SECTIONS: readonly NavSection[] = [
  {
    label: 'Animals',
    href: ANIMALS_ROUTE,
    // The roster is the home screen, and an animal's detail screen is still "Animals".
    owns: (pathname) =>
      pathname === ANIMALS_ROUTE || pathname.startsWith('/animals'),
  },
  {
    label: 'Habitats',
    href: HABITATS_ROUTE,
    owns: (pathname) => pathname.startsWith(HABITATS_ROUTE),
  },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="flex items-center gap-1">
      {SECTIONS.map((section) => {
        const isCurrent = section.owns(pathname ?? ANIMALS_ROUTE);

        return (
          <Button
            key={section.href}
            asChild
            size="sm"
            variant={isCurrent ? 'secondary' : 'ghost'}
            className={
              isCurrent ? 'font-medium' : 'text-muted-foreground font-normal'
            }
          >
            <Link
              href={section.href}
              aria-current={isCurrent ? 'page' : undefined}
            >
              {section.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
