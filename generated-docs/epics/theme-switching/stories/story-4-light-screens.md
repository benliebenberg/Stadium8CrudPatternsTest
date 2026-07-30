# Story 4 — Every screen correct in light

- **Epic:** `theme-switching` (Light and Dark Themes)
- **Slug:** `story-4-light-screens`
- **Route:** `/`
- **Target file:** `web/src/app/page.tsx`
- **Page action:** `modify_existing`
- **Roles:** All Users
- **Infrastructure only:** `false`
- **Requirement IDs:** R5, BR5, BR7, BR8

## Plain summary

The light theme has never actually been on screen, so every screen gets walked in light and anything
washed out, borderless or illegible gets fixed — the roster with its search and habitat filter, an
animal's detail, the habitats list, the add and edit forms, and the remove confirmation. Light should
look like a deliberate brand design, not an inverted dark one.

## Technical summary

A visual audit-and-fix pass over every screen with the light tokens active **for the first time**,
fixing surfaces, borders, muted text and button treatments **against the existing token set only** —
no new tokens, no palette change, no hex literals in components, and no layout, wording or behaviour
change.

Where a component leans on a dark-theme assumption — a hairline that only reads on near-black,
cream-on-orange text, an unbordered card — correct it to the token that is right in **both** themes.

The type scale and the 400/500 weight rule are **proven** here, not altered.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | In light, the animal roster reads clearly — visible row and table borders, readable names and values, and a search box and habitat filter that are clearly outlined rather than merging into the page. | none |
| AC-2 | In light, an animal's detail screen and the habitats reference list read clearly — every label and value legible, cards distinguishable from the page behind them. | none |
| AC-3 | In light, the add form, the edit form and the remove-confirmation dialog read clearly — labels, text boxes, the habitat dropdown and the buttons all visible, with the primary button's text readable on its fill and the remove button reading as destructive rather than as the primary action. | none |
| AC-4 | In light, headings and body text keep the app's usual sizes and weights — nothing turns bold and no heading jumps to marketing scale. | none |
| AC-5 | With the computer set to light, every screen still renders its content and its controls still work — the roster and its search and habitat filter, an animal's detail, the habitats list, and the add and edit forms. | playwright |
| AC-6 | Light reads as a deliberate brand presentation rather than an inverted dark theme — cream page, distinct card surfaces, and the darker orange for primary actions instead of the full-brightness orange. | none |

## Manual test checklist

- ☐ Switch to Light and open the animal roster → rows, borders and text are all clearly visible
- ☐ Use the search box and the habitat filter in Light → both are clearly outlined and their text is readable
- ☐ Open an animal's detail screen in Light → every label and value is legible and the card stands apart from the page
- ☐ Open the habitats list in Light → the same, including the caption and the date column
- ☐ Open the add form and then the edit form in Light → labels, boxes, the habitat dropdown and the Save button are all clearly visible and the Save button's text is readable on its fill
- ☐ Start removing an animal in Light → the confirmation dialog is clearly readable and the confirm button reads as destructive, not as the main action

## Notes

- **Five of six ACs are judged by eye** (`coverage: none`). That is deliberate: "the borders are visible
  and it looks like a deliberate design" cannot be asserted without pinning computed colours, which
  `.claude/policies/styling-centralisation.md` forbids and which would break on every token tweak. AC-5
  is the automatable part — every screen still renders and works with the OS set to light.
- **`--primary` under `:root` is deliberately `#ad4800`, not `#ff6b01`.** Orange on cream is 2.7:1 and
  fails AA. Never "correct" it back to the brand orange.
- Screens in scope: `app/page.tsx` (roster + search/filter), `app/animals/[id]/page.tsx` (detail +
  remove), `app/animals/[id]/edit/page.tsx`, `app/animals/new/page.tsx`, `app/habitats/page.tsx`.
  Shared components: `AnimalRosterTable.tsx`, `AnimalForm.tsx`, `RemoveAnimalAction.tsx`,
  `HabitatReference.tsx`.
- **Do not change layout, wording or behaviour.** Epic 1's 97 Vitest tests and 9 Playwright specs pin
  all of it — labels, accessible names, landmark counts, `aria-current="page"`, role conventions.
- `page.tsx` default exports must stay client components and never `async` (architecture Decision 1).
  No styling fix may change that.
- Read states live in `components/feedback/` and are **story 5's** scope — fix them once there rather
  than per screen here.
