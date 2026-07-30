'use client';

/**
 * "We could not load this, and here is how to try again" — the retry affordance R6 and
 * NFR-base-5 require for every async read.
 *
 * Three deliberate choices:
 *
 * - **`role="alert"`** (from the Shadcn `Alert` primitive) so the failure is announced, not
 *   just drawn. Visually distinct from {@link EmptyState} by the destructive colour token as
 *   well as by wording.
 * - **The Retry button sits outside the alert**, not inside it: `role="alert"` is a live
 *   region, and interactive controls inside one are announced awkwardly. It stays adjacent, so
 *   the recovery action is where the problem is described.
 * - **The detail line is a curated sentence** (see `web/src/lib/api/read-failure.ts`), never
 *   raw backend or database text (design-tokens.md §Brand Tone, Critical Rule 3).
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface FailureStateProps {
  /** What failed, in one short sentence. */
  readonly title: string;
  /** Why, or what to do about it — one readable sentence. */
  readonly detail: string;
  /** Re-attempt the operation that failed. */
  readonly onRetry: () => void;
  /** Override only when "Retry" is the wrong verb for the action. */
  readonly retryLabel?: string;
}

export function FailureState({
  title,
  detail,
  onRetry,
  retryLabel = 'Retry',
}: FailureStateProps) {
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert variant="destructive">
        {/* `line-clamp-none` overrides the primitive's single-line clamp: at phone width this
            wording wraps, and a truncated failure message is not a readable one. */}
        <AlertTitle className="line-clamp-none">{title}</AlertTitle>
        <AlertDescription>{detail}</AlertDescription>
      </Alert>

      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="text-foreground"
      >
        {retryLabel}
      </Button>
    </div>
  );
}
