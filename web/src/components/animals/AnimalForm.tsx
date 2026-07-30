'use client';

/**
 * The one animal form. Add (`/animals/new`) and edit (`/animals/[id]/edit`) render THIS
 * component — R21 asks for one form, and two near-duplicates would drift apart the first time a
 * rule changed.
 *
 * What the caller decides, and nothing else: the submit control's wording, what the form starts
 * out holding, how the animal is sent (`post` for a create, `put` for an update), and where to
 * go once the backend has confirmed it. Everything else — the five entries, validation, the
 * habitat choices, the in-flight state and the outcome branching — belongs here, because that is
 * exactly the part both modes must share.
 *
 * ## Five entries, and no sixth
 *
 * `Name`, `Species`, `Age`, `Habitat`, `Diet` (R17). `Id` and `HabitatName` are backend-derived,
 * and `LastChangedUser`/`LastChangedDate` are stamped server-side — `LastChangedUser` is an HTTP
 * header injected by the route handler from one fixed deployment value (R5/BR3/BR14), so it is
 * neither an entry here nor a field in the request body, and the user never supplies or sees it.
 *
 * `Diet` is free text, not a picker: the API declares no diet enum, so a dropdown here would
 * invent a contract the backend does not have.
 *
 * ## Validation is the only guard that exists
 *
 * The backend declares no required fields and validates nothing — it inserts straight into the
 * database (R19). So `web/src/lib/validation/schemas.ts`'s `animalFormSchema` is not a
 * convenience layer in front of a stricter server; it is the whole of the rules. A refused entry
 * is marked (`aria-invalid`) and its message is wired as that control's accessible description,
 * which is what Shadcn's `FormControl` + `FormMessage` produce — a message that is merely
 * *near* a field is invisible to anyone using a screen reader.
 *
 * ## The entries wait for the habitat choices
 *
 * The five entries appear only once `useHabitats()` has answered. Two reasons, and the second is
 * the one that made this necessary:
 *
 * 1. A habitat is mandatory, so nothing on this form can be saved before the choices exist. A
 *    picker rendered with an empty list invites someone to open it, find nothing, and conclude
 *    the zoo has no habitats.
 * 2. **A prefilled form must paint its prefill correctly the first time.** The edit screen mounts
 *    this component with the animal's stored `HabitatId`, and Radix's `Select` can only display
 *    that value once the matching option exists — so a form rendered before the habitats arrived
 *    would show every other entry filled in and the habitat blank, which reads as "this animal
 *    has no habitat" precisely where the most consequential edit is made (BR5).
 *
 * The habitat is mandatory and nothing is preselected. The backend INNER JOINs Habitat on read,
 * so an animal saved against a missing habitat is created and then **permanently invisible in
 * every list** (BR5); quietly choosing one on the user's behalf would hide that decision. The
 * choices are the habitats that actually exist, read through `useHabitats()` — and there is
 * deliberately no way to create a habitat from here, because only `GET /v1/habitats` exists
 * (R16/BR7). That is a backend capability limit, not a permission rule.
 *
 * ## Outcomes come from `MessageType`, never from a status code
 *
 * The app's own route handler answers every write with HTTP 200 and the `DefaultResponse`
 * envelope verbatim, whatever Linx replied (architecture.md Decision 3). So the write promise
 * **resolves** and `interpretWriteResponse` reads the outcome from `MessageType`
 * (`Success`/`Warning`/`Error`) — there is no `catch`-based success/failure branch to write, and
 * only a transport-level failure rejects at all.
 *
 * Only a `Success` navigates. Anything else keeps the user on the form with every value they
 * typed, and re-enables the submit control so the same values can be sent again (R20/R24).
 * Story 8 refines *how* the two refusals read — a duplicate name against the Name field versus a
 * readable technical failure — on top of this mechanism.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { FailureState } from '@/components/feedback/FailureState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/contexts/ToastContext';
import { useHabitats } from '@/hooks/use-habitats';
import { BACKEND_UNREACHABLE_MESSAGE } from '@/lib/api/failure-messages';
import { isAPIError } from '@/lib/api/read-failure';
import { interpretWriteResponse } from '@/lib/api/write-result';
import {
  animalFormSchema,
  animalWriteFromForm,
  EMPTY_ANIMAL_FORM,
  type AnimalFormValues,
} from '@/lib/validation/schemas';
import type { DefaultResponse } from '@/types/api';
import type { AnimalWrite, HabitatRead } from '@/types/api-generated';

/** User-visible copy. */
const CANCEL_LABEL = 'Cancel';
const HABITAT_LABEL = 'Habitat';
/** Reads as "nothing chosen yet" rather than as a habitat — it is never an option in the list. */
const HABITAT_PLACEHOLDER = 'Select a habitat';
const HABITATS_FAILED_TITLE = 'The habitats could not be loaded';
const HABITATS_FAILED_HINT =
  'An animal can only be saved against a habitat that already exists, so try loading them again.';
const HABITATS_LOADING_LABEL =
  'Loading the habitats this animal can be assigned to';

/**
 * What the user reads when the backend refuses the save.
 *
 * Readable first, deliberately: a technical failure carries raw database text in its message
 * (BR11), and nobody should have to read a constraint violation to learn their animal was not
 * saved. The backend's own words follow as secondary detail rather than being swallowed
 * (Critical Rule 3 / R24) — they are what makes a bug report useful.
 */
const SAVE_REFUSED_TITLE = 'This animal could not be saved';
const SAVE_REFUSED_HINT =
  'Everything you entered is still here, so you can try again.';

/** A stable identity for "no habitats yet", so the picker does not re-render on every keystroke. */
const NO_HABITATS: readonly HabitatRead[] = [];

/**
 * `statusCode: 0` is how `client.ts` records "no response at all" — the one case a write
 * rejects instead of resolving (architecture.md Decision 3).
 */
const TRANSPORT_FAILURE_STATUS = 0;

interface AnimalFormProps {
  /**
   * The submit control's wording — `"Add animal"` when adding, `"Save changes"` when editing.
   * Per-mode copy belongs to the caller: this component is the same form either way.
   */
  readonly submitLabel: string;
  /**
   * What the form starts out holding. Omit for a blank add form; pass the record's values to
   * prefill an edit. Read once, as the form's defaults — so a value that arrives later must be
   * passed by rendering this component once it is known, not by pushing it in mid-edit.
   */
  readonly initialValues?: AnimalFormValues;
  /**
   * Send the animal. `post(ANIMALS_ENDPOINT, animal)` for a create,
   * `put(animalEndpoint(id), animal)` for an update — both resolve with the envelope, whatever
   * the backend thought of it.
   */
  readonly save: (animal: Required<AnimalWrite>) => Promise<DefaultResponse>;
  /** Where to go once the backend confirmed the write. `id` is the record it reported. */
  readonly onSaved: (id: number) => void;
}

/**
 * The habitats a new or edited animal can actually be assigned to.
 *
 * A habitat with no `Id` cannot be written into `AnimalWrite.HabitatId`, so offering it would be
 * offering a choice that cannot be saved. Every field on the generated types is optional (the
 * spec declares no `required:` arrays), which is why this has to be checked at all.
 */
function assignableHabitats(
  habitats: readonly HabitatRead[],
): readonly HabitatRead[] {
  return habitats.filter((habitat) => habitat.Id !== undefined);
}

/**
 * How a habitat reads in the picker. A habitat with no recorded name is still assignable, so it
 * is still offered — identified by its id rather than dropped.
 */
function habitatChoiceLabel(habitat: HabitatRead): string {
  return habitat.Name ?? `Habitat ${String(habitat.Id)}`;
}

/**
 * The detail to show when the write got no answer at all — the only case the promise rejects.
 *
 * The client's own transport wording reads like a stack trace, so the shared
 * backend-unreachable sentence is used for it; anything else already came through the route
 * handler's envelope as curated text.
 */
function unansweredWriteDetail(error: unknown): string {
  if (
    isAPIError(error) &&
    typeof error.statusCode === 'number' &&
    error.statusCode !== TRANSPORT_FAILURE_STATUS
  ) {
    return error.message;
  }

  return BACKEND_UNREACHABLE_MESSAGE;
}

export function AnimalForm({
  submitLabel,
  initialValues = EMPTY_ANIMAL_FORM,
  save,
  onSaved,
}: AnimalFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { state: habitatsState, reload: reloadHabitats } = useHabitats();

  /**
   * The habitat trigger names itself with `aria-labelledby`, pointing at its own `<label>`.
   * Radix's trigger is a `<button>` whose content is the *selected value*, and a `<label for>`
   * does not name a button in the accessibility tree — so without this the control would be
   * called "Rainforest" the moment someone picked Rainforest. Same shape story 3 pinned for the
   * roster's habitat filter.
   */
  const habitatLabelId = useId();

  /** Open write, closed form: the submit control is disabled while a save is in flight (NFR-2). */
  const [saving, setSaving] = useState(false);

  /** The backend's own words when it refused, or `null` while nothing has been refused. */
  const [refusal, setRefusal] = useState<readonly string[] | null>(null);

  const form = useForm<AnimalFormValues>({
    resolver: zodResolver(animalFormSchema),
    defaultValues: initialValues,
  });

  const habitats =
    habitatsState.status === 'loaded'
      ? assignableHabitats(habitatsState.habitats)
      : NO_HABITATS;

  /**
   * Send the validated animal and act on what came back.
   *
   * Reached only once every rule in `animalFormSchema` passed, so a blocked save issues no
   * request at all — which matters more than usual here, because the backend would happily
   * store whatever it was sent (R19).
   */
  const sendAnimal = async (values: AnimalFormValues): Promise<void> => {
    setSaving(true);
    setRefusal(null);

    try {
      const result = interpretWriteResponse(
        await save(animalWriteFromForm(values)),
      );

      if (result.outcome === 'success') {
        // The backend's own confirmation wording, not ours (R23).
        showToast({ variant: 'success', title: result.messages[0] });
        onSaved(result.id);
        // Deliberately leaves the control disabled: this screen is on its way out, and
        // re-enabling it would invite a second create of the same animal.
        return;
      }

      setRefusal(result.messages);
    } catch (error) {
      setRefusal([unansweredWriteDetail(error)]);
    }

    setSaving(false);
  };

  return (
    <Form {...form}>
      <form
        // `noValidate`: the browser's own bubbles would compete with the field-level messages
        // below, which are the ones wired to their controls for assistive technology.
        noValidate
        onSubmit={form.handleSubmit(sendAnimal)}
        className="flex flex-col gap-6"
      >
        {refusal !== null && (
          <Alert variant="destructive">
            <AlertTitle className="line-clamp-none">
              {SAVE_REFUSED_TITLE}
            </AlertTitle>
            <AlertDescription>
              <p>{SAVE_REFUSED_HINT}</p>
              {/* The backend's own text, kept where it can be quoted in a bug report. */}
              <p>{refusal.join(' ')}</p>
            </AlertDescription>
          </Alert>
        )}

        {habitatsState.status === 'failed' && (
          <FailureState
            title={HABITATS_FAILED_TITLE}
            detail={`${habitatsState.detail} ${HABITATS_FAILED_HINT}`}
            onRetry={reloadHabitats}
          />
        )}

        {habitatsState.status === 'loading' && (
          // Never a blank space where the entries will be (NFR-2), and never an entry that
          // cannot yet be filled in correctly.
          <LoadingState label={HABITATS_LOADING_LABEL} rows={3} />
        )}

        {habitatsState.status === 'loaded' && (
          <>
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="Name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="Species"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Species</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="Age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Age</FormLabel>
                    <FormControl>
                      {/* A text entry with a numeric keypad rather than `type="number"`: a number
                      input silently discards keystrokes it dislikes, and the person would then
                      never see this form's own "whole number of 0 or more" message — which is
                      the only rule standing between them and a bad row (R19). */}
                      <Input
                        inputMode="numeric"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="Diet"
                render={({ field }) => (
                  <FormItem>
                    {/* Free text: the API declares no diet enum, so a picker would invent one. */}
                    <FormLabel>Diet</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="HabitatId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel id={habitatLabelId}>{HABITAT_LABEL}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          aria-labelledby={habitatLabelId}
                          className="w-full"
                          onBlur={field.onBlur}
                        >
                          <SelectValue placeholder={HABITAT_PLACEHOLDER} />
                        </SelectTrigger>
                      </FormControl>
                      {/* Only the habitats that exist. No "add a habitat" row: there is no endpoint
                      behind one (R16/BR7). */}
                      <SelectContent>
                        {habitats.map((habitat) => (
                          <SelectItem
                            key={habitat.Id}
                            value={String(habitat.Id)}
                          >
                            {habitatChoiceLabel(habitat)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saving}>
                {submitLabel}
              </Button>
              {/* Back where they came from — this form is reachable from more than one screen, so
              history is the only correct destination. */}
              <Button
                type="button"
                variant="outline"
                className="text-foreground"
                disabled={saving}
                onClick={() => {
                  router.back();
                }}
              >
                {CANCEL_LABEL}
              </Button>
            </div>
          </>
        )}
      </form>
    </Form>
  );
}
