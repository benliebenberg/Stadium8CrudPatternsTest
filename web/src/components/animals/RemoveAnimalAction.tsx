'use client';

/**
 * Remove one animal, behind a confirmation that names it (R22/R23).
 *
 * Rendered on the animal's own page beside "Edit animal". Everything the removal needs lives
 * here — the trigger, the confirmation, the write and how the outcome is reported — and the
 * caller supplies only which animal and where a removed animal leaves the user. That is the same
 * split `AnimalForm` uses for the two write forms.
 *
 * ## Why the confirmation is the whole feature
 *
 * The backend's delete event is a bare `DeleteAnimal → Return` (BR12): no error path, no history,
 * nothing to restore from, and an already-removed animal is likely reported as another success.
 * So this dialog is the only safeguard that exists, and two things have to be on screen before
 * the user commits:
 *
 * 1. **which** animal is about to go — with four look-alike records on the roster, a generic
 *    "Are you sure?" is exactly how the wrong one gets deleted; and
 * 2. that the removal **cannot be undone**, stated in words rather than implied by the button's
 *    colour, because the wording is what a screen-reader user gets.
 *
 * It is a real `alertdialog` (Shadcn's `AlertDialog`, which exists for this flow) rather than
 * `window.confirm()` or a styled `div`: focus is trapped, the title names the action through
 * `aria-labelledby`, and the description is announced with it.
 *
 * ## The wire, and why the promise resolving matters
 *
 * A **browser-side** `DELETE` to this app's own `/api/animals/{Id}` through the API client
 * (architecture.md § Decision 1) — never a Server Action and never a call to Linx from a
 * component: the route handler is the only thing that reaches the backend, because it injects the
 * server-only `X-API-Key` and the fixed `LastChangedUser` change-name (R5/BR3/BR14). Neither is
 * the browser's to supply, so this request carries no body at all — the record is identified by
 * the path.
 *
 * That handler answers every write with HTTP 200 and the `DefaultResponse` envelope verbatim
 * (architecture.md § Decision 3), so the delete **resolves** and the outcome is read from
 * `MessageType`. A `catch`-only implementation would treat a refused removal as a success and
 * tell the keeper the animal was gone when it is still there — which on this backend is the one
 * mistake nobody can check by looking, because the roster it lands on is re-read from the same
 * backend that just refused.
 *
 * ## What each outcome does
 *
 * | Outcome | What the user gets |
 * |---|---|
 * | `success` | the backend's OWN confirmation wording as a success toast (R23), then the roster, re-read so the animal is visibly gone |
 * | `rejected` (`Warning`) | the backend's own readable sentence as a warning — a business refusal, not a fault; the animal stays |
 * | `failed` (`Error`) | readable wording first as an error, the raw database text kept below it as labelled detail (Critical Rule 3 / R24); the animal stays |
 *
 * Nothing navigates unless the removal actually happened, and the confirmation writes nothing
 * merely by opening.
 */

import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastContext';
import { del } from '@/lib/api/client';
import { animalEndpoint } from '@/lib/api/endpoints';
import {
  describeUnansweredWrite,
  interpretWriteResponse,
} from '@/lib/api/write-result';
import type { DefaultResponse } from '@/types/api';

/**
 * The trigger's wording, and it is constrained in two directions.
 *
 * "Remove animal" (singular, verb first) rather than anything mentioning the roster: this page
 * already carries one link back to the animal list, and a control whose name also read as
 * "…animals" would make "the way back" ambiguous for anyone scanning by control name. It is a
 * **button**, not a link — a removal is not an address, and an unrecoverable delete must never be
 * reachable by navigating to a URL.
 */
const REMOVE_ANIMAL = 'Remove animal';

/** The dismiss control. Named for what it does to the removal, not to the dialog. */
const CANCEL_LABEL = 'Cancel';

/** Introduces the backend's own words, so their change of register is not a surprise. */
const REMOVE_FAILED_DETAIL_LABEL = 'What the animal backend reported:';

/**
 * What the user reads when the removal failed technically (`MessageType: 'Error'`, or no answer
 * at all): readable wording first, because the message carries raw database text such as a
 * constraint violation (BR11) and nobody should have to read one to learn the animal is still
 * there. The backend's own text follows as secondary detail rather than being swallowed
 * (Critical Rule 3 / R24) — it is what makes a bug report useful.
 *
 * The animal is named in the failure itself rather than called "this animal": the confirmation
 * has closed by the time this is read, and on a screen where the wrong record is one click away
 * the message has to say which animal it is about.
 */
function removeFailedTitle(animalName: string): string {
  return `${animalName} could not be removed`;
}

const REMOVE_FAILED_HINT = 'It is still on record, so you can try again.';

/** Said after a refusal, so the outcome is never ambiguous: the animal is still there. */
function stillOnRecord(animalName: string): string {
  return `${animalName} is still on record.`;
}

interface RemoveAnimalActionProps {
  /**
   * The id to remove, as it appears in the address bar. Taken from the route rather than from
   * the record, so the animal removed is always the one whose page the user is on.
   */
  readonly animalId: string;
  /** The animal's name, as the confirmation must show it. */
  readonly animalName: string;
  /** Where a removed animal leaves the user. Called only on a confirmed `Success`. */
  readonly onRemoved: () => void;
}

export function RemoveAnimalAction({
  animalId,
  animalName,
  onRemoved,
}: RemoveAnimalActionProps) {
  const { showToast } = useToast();

  /** Controlled, so only a confirmed removal — or Cancel — decides when this closes. */
  const [confirming, setConfirming] = useState(false);

  /**
   * Open removal: the confirm control is disabled while the delete is in flight, so a second
   * click cannot send a second `DELETE`. Cancel stays available, because there is no timeout on
   * the request and a modal nobody can dismiss would be worse than a stray dialog.
   */
  const [removing, setRemoving] = useState(false);

  const removeAnimal = async (): Promise<void> => {
    setRemoving(true);

    try {
      // No body and no change-name: the id is in the path and `LastChangedUser` is injected
      // server-side from one fixed deployment value (R5/BR3).
      const result = interpretWriteResponse(
        await del<DefaultResponse>(animalEndpoint(animalId)),
      );

      if (result.outcome === 'success') {
        // The backend's own confirmation wording, not ours (R23).
        showToast({ variant: 'success', title: result.messages[0] });
        setConfirming(false);
        // The roster re-reads itself as it mounts, so the animal is visibly gone without a
        // manual reload — and this is the only branch that moves the user at all.
        onRemoved();
        return;
      }

      if (result.outcome === 'rejected') {
        // A business refusal, and its wording is already a sentence a person can act on — so it
        // leads, exactly as a duplicate-name rejection does on the form. Not an error: nothing
        // is broken, the backend simply declined.
        showToast({
          variant: 'warning',
          title: result.messages.join(' '),
          message: stillOnRecord(animalName),
        });
      } else {
        showToast({
          variant: 'error',
          title: removeFailedTitle(animalName),
          message: `${REMOVE_FAILED_HINT} ${REMOVE_FAILED_DETAIL_LABEL} ${result.messages.join(' ')}`,
        });
      }
    } catch (error) {
      // No answer at all — the one case a write rejects rather than resolving. Still a technical
      // failure as far as the user is concerned, and the animal is still there.
      showToast({
        variant: 'error',
        title: removeFailedTitle(animalName),
        message: `${REMOVE_FAILED_HINT} ${describeUnansweredWrite(error)}`,
      });
    }

    // Refused or unanswered: the user stays on the record they were reading, with the outcome
    // reported over it, and nothing has moved.
    setConfirming(false);
    setRemoving(false);
  };

  return (
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogTrigger asChild>
        {/* Destructive, and deliberately lower-emphasis than the solid confirm inside the
            dialog: this is the control that ASKS. The destructive token is never the brand
            orange — on this single-accent palette orange reads as the primary action, and a
            keeper who cannot tell Save from Delete at a glance is one click from an
            unrecoverable mistake (NFR-4). */}
        <Button
          variant="outline"
          className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {REMOVE_ANIMAL}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          {/* A real title, so the dialog has an accessible name rather than announcing nothing —
              and it names the animal, which is the point of confirming at all. */}
          <AlertDialogTitle className="font-secondary text-h4 font-medium">
            Remove {animalName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {animalName} will be removed from the zoo’s records permanently.
            This cannot be undone — the animal backend keeps no history, so the
            record cannot be restored afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {removing && (
          // Said out loud as well as shown: the confirm control goes quiet while the removal is
          // in flight, and silence on a destructive action invites a second click.
          <p role="status" className="text-body text-muted-foreground">
            Removing {animalName}…
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{CANCEL_LABEL}</AlertDialogCancel>
          {/* Not an `AlertDialogAction`: that closes the dialog the moment it is clicked, which
              would hide the in-flight state and report the outcome over a screen the user has
              already been moved on from. This closes the confirmation itself, once the backend
              has answered. */}
          <Button
            variant="destructive"
            disabled={removing}
            onClick={removeAnimal}
          >
            Remove {animalName}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
