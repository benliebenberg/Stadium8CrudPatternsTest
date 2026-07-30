# Story 3 — Search and habitat filter on the roster

- **Epic:** `zoo-animal-manager` (Zoo Animal Manager)
- **Slug:** `story-3-search-and-filter`
- **Route:** `/`
- **Target file:** `web/src/app/page.tsx`
- **Page action:** `modify_existing`
- **Roles:** N/A — single user type, roles out of scope
- **Infrastructure only:** `false`
- **Requirement IDs:** R11, BR6, NFR-1

## Plain summary

Find animals fast — type to search by name or species, and narrow the roster to a single habitat.
Both work instantly in the browser over the roster that is already loaded, and can be combined or
cleared.

## Technical summary

Add a search input (matching Name and Species) and a habitat filter to the roster on `/`. Both
operate **entirely client-side** over the already-fetched full set — the backend accepts no
search, filter, sort or paging parameters (BR6).

The habitat choices are derived from the habitat names present in the loaded roster, deliberately
so this story needs no habitat fetch and therefore has **no dependency on story 5**.

Add a "no matches" state, worded distinctly from story 2's "no animals yet".

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Typing in the search box narrows the roster to animals whose name or species matches, updating as you type without a page reload. | playwright |
| AC-2 | Choosing a habitat from the filter narrows the roster to animals in that habitat, and the choices offered are the habitats present in the loaded roster. | playwright |
| AC-3 | A search term and a habitat filter apply together, and clearing both restores the full roster. | playwright |
| AC-4 | When a search or filter matches nothing, a "no matches" message is shown, worded distinctly from the "no animals yet" message. | vitest |
| AC-5 | Searching or filtering never triggers another data load — the narrowing happens over the roster already in the browser. | vitest |

## Manual test checklist

- ☐ Type part of an animal's name → the roster narrows as you type
- ☐ Type part of a species instead → matching animals stay visible
- ☐ Pick a habitat from the filter → only that habitat's animals remain
- ☐ Combine a search term and a habitat filter → only animals matching both remain
- ☐ Clear the search box and reset the habitat filter → the full roster returns
- ☐ Search for text that matches nothing → you see a "no matches" message, not an error

## Notes

- Client-side filtering over the full set is a **known scaling limitation**, accepted because the
  backend offers no alternative. Not a problem to solve in this epic.
- Shadcn `select` and `input` — `input` is already installed; add `select` via the CLI.
