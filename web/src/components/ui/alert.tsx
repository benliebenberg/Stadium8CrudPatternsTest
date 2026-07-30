import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        // One deliberate divergence from the Shadcn CLI default. Restore this note if the
        // file is ever re-generated:
        //   - the description is `text-destructive`, NOT the CLI's `text-destructive/90`.
        //     That 90% alpha composites the token against whatever is behind it, and on this
        //     project's LIGHT card (`--card: #ffffff`) it drops `--destructive` (#c93a3e)
        //     from 5.05:1 to 4.34:1 — below the 4.5:1 AA floor NFR-base-1 sets. In dark it
        //     survives (5.87:1 → 4.98:1 on `--card: #181818`), which is exactly why the alpha
        //     went unnoticed while the app was dark-only. Full opacity is compliant in both.
        //     This is the description of every failed read (`FailureState`) and of a save that
        //     failed technically (`AnimalForm`), so it is real running text, not a corner.
        destructive:
          'bg-card text-destructive *:data-[slot=alert-description]:text-destructive [&>svg]:text-current',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight',
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed',
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
