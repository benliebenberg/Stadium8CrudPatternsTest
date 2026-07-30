/**
 * The placeholder shown while data is in flight — the project's answer to "never a blank
 * screen" (NFR-2, R10).
 *
 * `role="status"` with a name that says what is loading, because the shape of the skeleton is
 * meaningless to anyone not looking at it. Every read screen in this project uses this
 * component so the loading state cannot drift into a spinner on one screen and nothing at all
 * on another.
 */

import { Skeleton } from '@/components/ui/skeleton';

interface LoadingStateProps {
  /** What is loading, phrased for a screen reader: "Loading animals". */
  readonly label: string;
  /** How many placeholder bars to show — roughly the shape of the content to come. */
  readonly rows?: number;
}

const DEFAULT_ROWS = 5;

export function LoadingState({
  label,
  rows = DEFAULT_ROWS,
}: LoadingStateProps) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_unused, row) => (
        <Skeleton key={row} className="h-10 w-full" />
      ))}
    </div>
  );
}
