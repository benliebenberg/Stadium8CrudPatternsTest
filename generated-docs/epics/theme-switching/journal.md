# Journal — Light and Dark Themes

A plain-language log of what was built and why, story by story.

## Story 1 — The right theme before the page appears

- The app now works out light-or-dark **before anything is drawn**. A tiny script sits in the page's head
  and runs before the browser has even reached the page body: it looks for a theme you chose in this
  browser, and if there isn't one it asks your computer which you prefer. That's why there's no flash of
  the wrong theme — by the time anything is visible, the decision is already made.
- Once the app has loaded, a small piece of shared state takes over from that script. It keeps listening
  to your computer's light/dark setting, so if you flip it while the app is open (or your machine does it
  at sunset), the app follows straight away without a reload. It also holds the state that story 2's
  Light/Dark/System button will read and change.
- Nothing is remembered on the server — there's no login here, so your choice lives in this browser only.
  No choice stored means "follow the computer", which is also what clearing your browser data returns you
  to. Deliberately: it does **not** fall back to dark.
- As the plan predicted, epic 1's automated accessibility check now measures the app in **light** (its
  browser asks for light by default, and until today the app ignored that and was always dark). It
  reports a colour-contrast problem, which is **real** and is exactly what stories 4 and 5 exist to fix.
  That check was left exactly as it is rather than quieted — it's the early-warning signal for
  light-theme colours. Everything else in that spec still passes.
- One thing deliberately not built: if you have the app open in two tabs and change the theme in one, the
  other tab won't update until it reloads. Nothing asked for that, and adding cross-tab syncing would
  mean another listener with no test behind it.

## Story 2 — Choose Light, Dark or System from the nav bar

- The Light/Dark/System control is now in the nav bar, next to Animals and Habitats. It reads and writes
  the theme through the state story 1 built, so a pick takes effect straight away without the page
  reloading, and picking System genuinely hands control back to the computer by forgetting the stored
  choice.
- Adding the menu turned up a real trap. The component library's generated dropdown mounts its menu on
  the page's `<body>`, away from where it is written. That is invisible in a browser, but our automated
  tests render the whole app shell inside a test container, and with the menu mounted outside that
  container the test run **froze solid** the moment the menu opened — no error, no timeout, just a hang.
  We traced it by bisecting the component tree, then changed the generated dropdown to render its menu
  in place. Both test layers now pass, and the change is recorded with a note about what to do if a
  future menu ever needs to escape a clipping container.
