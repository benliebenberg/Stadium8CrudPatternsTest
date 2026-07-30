# Journal — Zoo Animal Manager

A plain-language log of what was built and why, story by story.

## Story 1 — Server-side backend access foundation

- Built the server-side plumbing that lets the app talk to the animal backend. The browser now only
  ever calls the app's own addresses (`/api/animals`, `/api/habitats`); the server adds the shared key
  behind the scenes, so the key never reaches anyone's browser.
- Fixed a trap left by the starter template: it quietly pasted the backend's address onto the front of
  every request, which would have leaked that address to the browser and broken every screen. Requests
  to the app's own addresses now stay put, and a request aimed anywhere else is refused outright
  rather than sent.
- Taught the app to read the backend's own "Success / Warning / Error" reply instead of guessing from
  HTTP status codes — this backend reports a duplicate name and a database fault with the same code,
  so guessing would have made a fixable typo look like a system crash.
- Removed the template's browser-side login token plumbing and its "who changed this" argument.
  Neither belongs here: there is no login, and the change-name is a single fixed value set once at
  deployment.
- Updated the old API-client tests to match, deleting the six that asserted behaviour we deliberately
  removed, and added tests for the app's own `/api` addresses — neither the story tests nor the
  browser tests actually exercise that layer, so it had no coverage at all.

## Story 2 — App shell and animal roster home screen

- The home screen is now the animal roster inside a shared frame with Animals/Habitats navigation,
  replacing the starter template's welcome page. The frame owns the single main region, so every
  screen built after this one inherits it and none should add its own.
- Loading, "no animals yet" and "couldn't load — retry" are now three reusable pieces rather than
  something each screen re-invents. The habitats list and the animal detail screen use the same
  three, keeping their own wording distinct from each other so a user can always tell "nothing is
  here" from "we couldn't load this".
- A response that arrives but isn't a roster (for example the backend refusing the read and answering
  with a message instead) is treated as a failure with a Retry, not as an empty zoo. That distinction
  is deliberate: reporting an outage as "no animals yet" would look perfectly normal and be
  completely wrong.
- Verified the accessibility scan in a real browser for both the loaded roster and the failure state —
  both clean at WCAG 2.1 AA.
- Worth knowing: the ad-hoc end-to-end command reused an unrelated application's dev server that was
  already running on port 3000, which produced failures that looked like bugs in this story. Running
  it the way the end-of-epic check does — a production build on its own port — passed immediately.
  Logged for the template maintainers.

## Story 3 — Search and habitat filter

- The habitat filter builds its list from the animals already on screen rather than asking the backend
  for the habitat list. That means searching and filtering work before the habitats screen exists, and
  a problem with the habitats endpoint can't break the roster. The trade-off: a habitat with no animals
  in it isn't offered as a filter choice — picking it could only ever show an empty list.
- There's no delay on the search box — the roster narrows on every keystroke. All the work happens over
  animals already in the browser, so there's nothing to throttle.
- The search term and habitat choice deliberately don't appear in the address bar. Keeping them out is
  what guarantees typing can never trigger a page load or a second trip to the backend. The cost is
  that you can't bookmark or share a filtered view.
- When there are no animals at all, the search box and habitat filter are hidden — there's nothing to
  narrow, so offering the controls would just be a dead end.

## Story 4 — Animal detail view

- The detail page decides "this animal doesn't exist" from what the backend sent back, not from the
  HTTP status — the backend has no proper not-found response for a single animal, so the status tells
  us nothing.
- One nasty wrinkle: a missing animal and a genuinely broken backend come back looking identical. The
  page now checks *whose words* the message is. Our own messages ("could not reach the animal backend")
  mean plumbing, so you get "could not load, retry". Anything else came from the backend about that
  specific record, so it's "animal not found", where retrying would be pointless.
- The last-changed date is printed exactly as the backend sends it, character for character. The
  backend has already converted it to South African time, so any "helpful" reformatting would silently
  shift every timestamp two hours. There is deliberately no date-handling code on this screen.
- The last-changed name is labelled "System source", not "Changed by". It's the same fixed name on
  every record because the app has no logins — calling it "changed by" would name a person who doesn't
  exist.

## Story 5 — Habitats reference list

- The Habitats navigation item now leads somewhere: a read-only list of every habitat.
- Habitats genuinely cannot be added, edited or removed — the backend only offers a way to read them —
  so instead of greying out buttons, the screen simply doesn't have any, and it says what habitats are
  for so it reads as a finished reference rather than a half-built editor. Nothing hints that a
  different login or permission could unlock editing, because there are no logins at all.

## Story 6 — Add an animal

- The add form is one component the edit screen reuses, so the button and heading wording is passed in
  per screen. Everything that must behave identically in both places lives in the one shared piece.
- Age is typed into a normal text box rather than a browser number box. A number box quietly throws
  away characters it doesn't like, which would mean nobody ever sees our "Age must be a whole number of
  0 or more" message — and since the backend checks nothing, that message is the only thing stopping a
  bad age reaching the database.
- The habitat list opens with nothing chosen. Picking one for the user would hide a consequential
  decision: an animal filed against a habitat that doesn't exist is saved and then disappears from
  every list permanently.

## Story 7 — Edit an animal

- The edit form is the same form as Add, opened with the animal's stored values already filled in.
  Saving sends the whole record back — all five fields, not just the ones you changed — because the
  backend replaces the record wholesale and a partial save would blank the rest of the animal.
- While building the prefill we found the shared form painted its habitat picker empty for a moment
  while the habitat list loaded. On Add that was cosmetic; on Edit it looked like the animal had no
  habitat assigned — the one mistake that can make an animal disappear from every list. The form now
  waits for the habitat list before showing its entries.
- Cancelling takes you back to wherever you opened the form from, and never sends anything.

## Story 8 — Refused saves

- The two ways a save can be refused now look like two different things. A name that's already taken
  shows as a message on the Name box itself, so you can fix it and save again. A technical fault shows
  above the form instead and marks none of your entries as wrong, because none of them were: it leads
  with "This animal could not be saved" and keeps the backend's own raw database text below that,
  labelled, so it can be pasted into a bug report. Either way everything you typed stays put and the
  save button comes back to life.
- Raised the per-test time limit from 5 to 15 seconds: one test fills the whole five-field form twice
  over (that's how it proves the two refusals read differently), which takes about 4.6 seconds of real
  work — right on the old line, so it would have failed at random on correct code.

## Story 9 — Remove an animal

- The confirmation names the animal and says plainly that removal can't be undone.
- The confirm button is a plain destructive button rather than the dialog library's own action button,
  which closes the dialog the instant it's clicked — that would mean reporting the outcome over a
  screen you'd already been moved on from, and would hide the "removing…" state entirely.
- A failed removal names the animal ("Kaya could not be removed"). By then the confirmation has closed,
  and on a screen where the wrong record is one click away the message has to say which animal it means.
- Fixed the destructive button styling while building the first thing that uses it. The component
  library hard-coded white text and dimmed the fill in dark mode, so the red chosen during the styling
  pass was never actually used, and the dimmed version dropped text contrast to roughly 3:1.

## Epic-end security gate

- The security gate found two real gaps and three that don't apply.
- **Real, and fixed:** the two write endpoints accepted animal details from the browser and passed them
  straight to the backend with no checking of their own. Until now the only checking happened in the
  browser form, so anything talking to the app's own address directly — a script, a stale tab, or a
  future bug in our own code — could store an animal with no name, a fractional age, or a habitat that
  doesn't exist. The backend checks nothing and stores whatever it receives, and such a record is
  permanent, so this was a genuine hole.
- **Doesn't apply, and recorded as such:** three findings asked for an authorization check on the app's
  own endpoints. This project has no login, no session and no roles, so there is nothing to authorize
  against and a guard could only be theatre. Each of the three files now carries a written exception
  explaining that, and noting the real trade-off: anyone who can reach the app has full read and write
  access. Closing that needs a backend change plus a sign-in screen, and is a separate piece of work.
