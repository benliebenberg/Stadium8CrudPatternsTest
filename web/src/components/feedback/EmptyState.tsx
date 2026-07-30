/**
 * "There is nothing here yet" — a legitimate result, not a failure (R10, AC-4).
 *
 * Deliberately quiet: no `role="alert"`, no retry action, no destructive colour. Those belong
 * to {@link FailureState}, and the two must stay clearly distinguishable — "we could not load
 * this" and "there is nothing to show" are different facts about the world, and a user who
 * cannot tell them apart cannot act on either.
 */

import { Card, CardContent } from '@/components/ui/card';

interface EmptyStateProps {
  /** The headline fact, e.g. "No animals yet". */
  readonly title: string;
  /** One line on what would put something here. */
  readonly description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <p className="text-body-md font-medium">{title}</p>
        <p className="text-body text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
