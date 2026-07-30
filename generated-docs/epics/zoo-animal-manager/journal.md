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
