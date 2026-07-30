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
