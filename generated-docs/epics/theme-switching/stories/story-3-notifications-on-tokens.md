# Story 3 — Notifications follow the active theme

- **Epic:** `theme-switching` (Light and Dark Themes)
- **Slug:** `story-3-notifications-on-tokens`
- **Route:** `/animals/1`
- **Target file:** `web/src/components/toast/Toast.tsx`
- **Page action:** `modify_existing`
- **Roles:** All Users
- **Infrastructure only:** `false`
- **Requirement IDs:** R6, R7, BR4, BR5, BR7, NFR-5

## Plain summary

Save and removal notifications currently use fixed colours — a white card with grey text — which was
invisible while the app was always dark and looks wrong in light. They now take their card, text and
status colours from whichever theme is active, and still announce failures as urgent and everything
else as ordinary progress.

## Technical summary

Re-skin `Toast.tsx` and `ToastContainer.tsx` off raw Tailwind palette utilities (`bg-white`,
`border-red-500`, `text-green-500`, `text-amber-500`, `text-blue-500`, `text-gray-*`) onto the design
tokens (`--card` / `--card-foreground`, `--destructive`, `--success`, `--warning`,
`--muted-foreground`, `--border`). This closes the cross-epic debt recorded in `architecture.md`.

**Behaviour is untouched** — this is a colour change only.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | In light, a notification is legible and on-brand — a card that reads as a raised surface on the cream page, with dark text, not a white card with grey text. | none |
| AC-2 | In dark, notifications still look right — the re-skin changes nothing about how they read today. | none |
| AC-3 | A failed save or removal is still announced urgently, while a success, warning or informational notification is announced as ordinary progress. | vitest |
| AC-4 | Each notification still shows its title and optional message and can still be dismissed by its dismiss control, which keeps its name. | vitest |
| AC-5 | With the computer set to light, a successful removal shows its confirmation notification and a refused removal shows its failure notification, each readable on the page. | playwright |
| AC-6 | A failure notification's accent reads as an error and is never the brand orange, in either theme. | none |

## Manual test checklist

- ☐ In Light, remove an animal successfully → the confirmation notification is legible against the cream page, not a white card with grey text
- ☐ In Light, force a failed removal (stop the backend) → the failure notification is legible and its accent clearly reads as an error, not as the orange primary action
- ☐ Save an animal on the add form in Light → its confirmation notification appears in the light theme
- ☐ Switch to Dark and repeat a successful and a failed removal → both notifications still look right
- ☐ Click a notification's dismiss button → it closes exactly as before

## Notes

- **The behavioural contract is pinned by epic 1 and must not change:** `error` renders `role="alert"`
  with `aria-live="assertive"`; every other variant renders `role="status"` with `aria-live="polite"`.
  Auto-dismiss, click-through, stacking, the `aria-label="Notifications"` region and the
  `aria-label="Dismiss notification"` control all stay exactly as they are.
- `Toast.tsx` styles **four** variants — success, error, warning, info. All four need tokens,
  **including `info`**, even though this app only ever fires success, warning and error.
- Destructive uses the light/dark `--destructive` token (`#c93a3e` light, `#ff5c5c` dark) — **never**
  the brand orange, in either theme.
- Do **not** re-implement the toast system. Only its colours change.
- AC-1, AC-2 and AC-6 are judged by eye at the manual-test gate — asserting them would mean pinning
  computed colours, which the styling policy forbids.
