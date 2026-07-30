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
 * ## A prefilled habitat that no longer exists is cleared, and said out loud
 *
 * An edit can arrive holding a `HabitatId` that is not among the habitats that came back —
 * a habitat retired from the reference list since the animal was last saved. Radix's `Select`
 * has no option to match, so it paints the placeholder; but the form's value would still be the
 * stale id. That divergence — the screen saying "nothing chosen" while the value about to be
 * submitted says otherwise — is the dangerous state: the entry passes the mandatory-habitat rule
 * (it is a non-empty string), so a save would write the unresolvable id straight back and make
 * the animal permanently invisible in every list (BR5), with nothing on screen having warned
 * anyone.
 *
 * So once the habitats have arrived, an unresolvable prefill is **cleared**, which makes the
 * displayed value and the submitted value agree again and lets the existing mandatory-habitat
 * rule block the save by itself. The entry then carries {@link HABITAT_UNAVAILABLE_MESSAGE}
 * through the same `FormControl`/`FormMessage` wiring every other refusal on this form uses — no
 * second error mechanism, and not a toast, which would be gone by the time the person looked at
 * the picker.
 *
 * Deliberately **not** done: inventing a habitat, preselecting the first one, or dropping
 * `HabitatId` from the body. Each trades a problem the user can see for one they cannot.
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
 *
 * ## The two refusals are different kinds of thing, so they are reported differently
 *
 * `Warning` and `Error` arrive in the *same* envelope with the *same* status and differ only by
 * `MessageType`, but they mean opposite things to the person at the keyboard — so they are
 * deliberately not given one shared "something went wrong" treatment (R20/R24):
 *
 * - **`Warning` — a business rejection, e.g. a name that is already taken.** Fixable, so it is
 *   reported the way every other fixable entry problem on this form is: against the offending
 *   entry, marked (`aria-invalid`) with the message wired as that control's accessible
 *   description. That is `setError()` through the same `FormControl`/`FormMessage` wiring
 *   validation uses — no second error mechanism, and no failure banner, which would tell the
 *   user the system broke when in fact their next keystroke fixes it.
 * - **`Error` — a technical failure.** Nothing the user typed caused it, so no entry is marked:
 *   accusing the Name would send them editing a perfectly good value. It is reported at form
 *   level instead, readable wording first and the backend's own raw text kept below it as
 *   secondary detail (Critical Rule 3 / R24) — `Messages[0]` here is database text such as a
 *   constraint violation, which nobody should have to read to learn their animal was not saved.
 *
 * The uniqueness rule itself is the **backend's**. This form implements no duplicate check of
 * its own and only ever learns of one from a `Warning` envelope.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import {
  describeUnansweredWrite,
  interpretWriteResponse,
} from '@/lib/api/write-result';
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
 * What the Habitat entry says when the animal's recorded habitat is not among the habitats that
 * exist — a habitat retired from the reference list since this animal was last saved.
 *
 * Stated as a fact about this animal plus the one action that resolves it. The alternative was
 * silence, which is how the same situation becomes an animal written back against an
 * unresolvable habitat and lost from every list (BR5).
 */
const HABITAT_UNAVAILABLE_MESSAGE =
  'This animal’s recorded habitat is no longer one the zoo has on record, so choose a new habitat before saving.';

/** The habitat entry, named once — it is referred to imperatively as well as declaratively. */
const HABITAT_ENTRY = 'HabitatId' as const;

/**
 * What the user reads when the save failed for technical reasons (`MessageType: 'Error'`, or no
 * answer at all).
 *
 * Readable first, deliberately: a technical failure carries raw database text in its message
 * (BR11), and nobody should have to read a constraint violation to learn their animal was not
 * saved. The backend's own words follow as secondary detail rather than being swallowed
 * (Critical Rule 3 / R24) — they are what makes a bug report useful.
 */
const SAVE_FAILED_TITLE = 'This animal could not be saved';
const SAVE_FAILED_HINT =
  'Everything you entered is still here, so you can try again.';
/** Introduces the backend's own words, so their change of register is not a surprise. */
const SAVE_FAILED_DETAIL_LABEL = 'What the animal backend reported:';

/**
 * The entry a business rejection (`MessageType: 'Warning'`) is reported against.
 *
 * The only rejection this backend raises is its duplicate-record path, and the rule behind it is
 * understood to be the animal's **name** — an assumption recorded for confirmation against the
 * running backend rather than one this form can verify. It is deliberately the single mapping
 * used: parsing the backend's wording to guess at other fields would invent a contract the API
 * does not describe.
 */
const REJECTED_ENTRY = 'Name' as const;

/** What to do about a rejected name, in the app's words, after the backend's own. */
const REJECTION_GUIDANCE = 'Choose a different name and save again.';

/** A stable identity for "no habitats yet", so the picker does not re-render on every keystroke. */
const NO_HABITATS: readonly HabitatRead[] = [];

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
 * The backend's own words with a full stop, so the app's guidance can follow them as a second
 * sentence. Nothing is reworded or truncated — a rejection the user can act on has to say what
 * the backend said (R20).
 */
function asSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * What the Name entry says when the backend rejected the save as a duplicate: the backend's
 * wording, then what to do about it. Unlike a technical failure, this message IS readable as it
 * stands — "Animal already exists" is a sentence a person can act on.
 */
function rejectionMessage(messages: readonly string[]): string {
  return `${asSentence(messages.join(' '))} ${REJECTION_GUIDANCE}`;
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

  /**
   * The same fact as {@link saving}, kept where it can be read and written in one synchronous
   * step — and it is what actually prevents a second write.
   *
   * `saving` cannot close the door on its own, because it is only set once react-hook-form has
   * finished validating: for the whole of that window the submit control is still live, so a
   * double-click sends the form twice. On a create that is two identical animals from one
   * gesture, on a backend with no undo (BR12) and no request timeout; on an edit it is two
   * `PUT`s racing to overwrite the same record. React state cannot guard it — the re-render that
   * disables the control happens after the second click has already been handled — so the guard
   * has to be a ref, checked and set before the first `await`.
   */
  const inFlight = useRef(false);

  /**
   * The backend's own words when the save FAILED technically, or `null` while it has not.
   *
   * A business rejection is not held here: it lives on the entry it belongs to, as that field's
   * own error (see the `rejected` branch below).
   */
  const [failure, setFailure] = useState<readonly string[] | null>(null);

  const form = useForm<AnimalFormValues>({
    resolver: zodResolver(animalFormSchema),
    defaultValues: initialValues,
  });

  /**
   * The choices the picker offers. Memoised on the habitats state, which only changes when a read
   * answers — `assignableHabitats` builds a new array every call, and an identity that changed on
   * every render would make the effect below fire on every render too.
   */
  const habitatsLoaded = habitatsState.status === 'loaded';
  const habitats = useMemo(
    () =>
      habitatsState.status === 'loaded'
        ? assignableHabitats(habitatsState.habitats)
        : NO_HABITATS,
    [habitatsState],
  );

  /**
   * Whatever habitat the caller prefilled — read from the prop rather than from the form, so this
   * is about the *record's* stored habitat and cannot be re-triggered by what the user then picks.
   */
  const prefilledHabitatId = initialValues.HabitatId;

  /**
   * The unresolvable prefill, handled the moment the habitats are known: clear the value so the
   * form submits what it is showing, and put the reason on the entry itself.
   *
   * It has to wait for the habitats: until they arrive, "not in the list" and "the list has not
   * loaded yet" look identical. Nothing happens on an add form (nothing is prefilled) or on the
   * ordinary edit (the habitat resolves), so this is invisible on every path but the one it
   * exists for.
   */
  useEffect(() => {
    if (
      !habitatsLoaded ||
      prefilledHabitatId === '' ||
      habitats.some((habitat) => String(habitat.Id) === prefilledHabitatId)
    ) {
      return;
    }

    // Order matters: `setValue` without `shouldValidate` runs no rules, so the message set next
    // is the one the user reads — the generic "choose a habitat" only replaces it if they submit
    // without choosing, which is the right message at that point.
    form.setValue(HABITAT_ENTRY, '');
    form.setError(HABITAT_ENTRY, {
      type: 'habitat-unavailable',
      message: HABITAT_UNAVAILABLE_MESSAGE,
    });
  }, [form, habitats, habitatsLoaded, prefilledHabitatId]);

  /**
   * Send the validated animal and act on what came back.
   *
   * Reached only once every rule in `animalFormSchema` passed, so a blocked save issues no
   * request at all — which matters more than usual here, because the backend would happily
   * store whatever it was sent (R19).
   */
  const sendAnimal = async (values: AnimalFormValues): Promise<void> => {
    // A submit that got through while the previous one was still being validated. Dropped here
    // rather than sent: nothing about it differs from the write already on its way.
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setSaving(true);
    setFailure(null);

    try {
      const result = interpretWriteResponse(
        await save(animalWriteFromForm(values)),
      );

      if (result.outcome === 'success') {
        // The backend's own confirmation wording, not ours (R23).
        showToast({ variant: 'success', title: result.messages[0] });
        onSaved(result.id);
        // Deliberately leaves the control disabled AND the guard closed: this screen is on its
        // way out, and re-opening either would invite a second create of the same animal.
        return;
      }

      if (result.outcome === 'rejected') {
        // A fixable business rejection, so it belongs to the entry it is about — exactly as a
        // validation message does. `handleSubmit` replaces the form's errors from the resolver
        // on the next submit, so this clears itself when the user tries again, and the default
        // onChange revalidation clears it as soon as they edit the name.
        form.setError(REJECTED_ENTRY, {
          type: 'backend',
          message: rejectionMessage(result.messages),
        });
      } else {
        // A technical failure: form level, accusing no entry.
        setFailure(result.messages);
      }
    } catch (error) {
      // No answer at all — the one case a write rejects rather than resolving. Still a technical
      // failure as far as the user is concerned. The wording is the shared one every write
      // surface uses for this event.
      setFailure([describeUnansweredWrite(error)]);
    }

    // Refused or unanswered: the same values may be sent again exactly as they stand (R20/R24),
    // so both the control and the guard re-open together.
    inFlight.current = false;
    setSaving(false);
  };

  return (
    <Form {...form}>
      <form
        // `noValidate`: the browser's own bubbles would compete with the field-level messages
        // below, which are the ones wired to their controls for assistive technology.
        noValidate
        // `handleSubmit` is composed inside the event rather than during render: `sendAnimal`
        // reads the in-flight guard below, and a ref may only be read from an event handler.
        onSubmit={(event) => {
          void form.handleSubmit(sendAnimal)(event);
        }}
        className="flex flex-col gap-6"
      >
        {/* A technical failure only. A duplicate name never reaches here — it is the Name
        entry's own message, because it is the user's to fix rather than a system fault. */}
        {failure !== null && (
          <Alert variant="destructive">
            <AlertTitle className="line-clamp-none">
              {SAVE_FAILED_TITLE}
            </AlertTitle>
            <AlertDescription>
              <p>{SAVE_FAILED_HINT}</p>
              {/* The backend's own text, second and labelled as such: not what the user reads
              first, and not swallowed either (Critical Rule 3 / R24). */}
              <p>
                {SAVE_FAILED_DETAIL_LABEL} {failure.join(' ')}
              </p>
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
                name={HABITAT_ENTRY}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel id={habitatLabelId}>{HABITAT_LABEL}</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(chosen) => {
                        field.onChange(chosen);
                        // Every option in this list is a habitat that exists, so any message
                        // against this entry — "choose a habitat", or the unavailable-habitat
                        // one above — is answered by the choice just made. Cleared explicitly
                        // because react-hook-form only revalidates on change once the form has
                        // been submitted, so a message set before a first submit would otherwise
                        // sit in red under a now-perfectly-good choice.
                        form.clearErrors(HABITAT_ENTRY);
                      }}
                    >
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
