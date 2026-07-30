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

## Story 3 — Notifications follow the active theme

- Notifications now take their colours from the active theme instead of having them hardcoded. Previously
  every save or removal message was a white card with grey text — near-invisible while the app was
  permanently dark, and out of place on the new cream light theme. The card, its text, its border and the
  coloured stripe down its left edge all now follow whichever theme is on.
- The error stripe uses the theme's dedicated error red in both light and dark, and never the brand
  orange. Success is green, warning is gold, and informational messages get a plain neutral stripe rather
  than the orange used for buttons — so a notification's colour can't be misread as "this is something to
  click".
- Deleted a leftover block of template code that listed a second, conflicting set of notification colours.
  Nothing was using it, and leaving it there would have invited someone to wire up the wrong colours later.
- Nothing about how notifications behave changed: failures still interrupt a screen reader, everything else
  still waits its turn, messages still clear themselves after five seconds, and dismiss works as before.
- Worth knowing: because nothing at any test layer asserts colour here by design, a styling class that
  silently failed to generate would have left the stripe invisible with all 107 tests green. That gap was
  closed against the compiled stylesheet rather than by eye — including checking the rule order, since an
  all-sides border colour would have overwritten the left stripe and quietly turned it grey.

## Story 4 — Every screen correct in light

- Walked every screen's code looking for places the styling assumed a dark page. Found the app already in
  good shape: all the orange goes through the theme's own token, so on light it automatically becomes the
  darker orange that's readable on cream, and nothing had a raw colour baked in.
- Found and fixed one genuine problem: the red text in error messages was set to 90% strength, which looks
  fine on a dark card but on a white one drops just below the readability standard. Proved it by putting
  the bug back and watching the automated accessibility check fail at exactly the predicted number, then
  fixing it and watching it pass.
- Made the notification title's weight match the brand, which only uses regular and medium. This was the
  item the notifications story passed on because it was about weight rather than colour.
- Measured how visible the dividing lines and box outlines are in both themes and found them equally
  subtle in each, so if light looks washed out that's a decision about the palette itself rather than
  something to patch screen by screen. Wrote the numbers down so nobody has to re-measure.
- Corrected a comment that still claimed the app is permanently dark: true before this epic, misleading now.

## Story 5 — Every state correct in light, and accessibility in both themes

- Checked every "nothing went right" screen in light - loading placeholders, the two "nothing here yet"
  messages, "no matches", the failed-to-load error with its Retry, the duplicate-name warning, the
  technical-failure message and the two not-found screens - by opening each in a real browser and
  measuring the actual colours on screen. They were all already correct: each takes its colours from the
  theme rather than having dark's baked in, so switching to light just works. Nothing needed changing.
- The loading placeholders were the thing most likely to be broken. The classic mistake is a placeholder
  tuned to be lighter than a dark page, which then disappears on a cream one. Ours is defined as a
  percentage of the text colour instead, so on cream it goes darker rather than lighter.
- Made sure the new accessibility check can actually fail. A passing test might just be looking at
  nothing, so the bright brand orange was deliberately put back onto an error heading: the light check
  went red and the dark check stayed green, exactly the problem this epic exists to prevent. Then
  reverted and rebuilt.
- Found one thing deliberately not changed: the plain outlined buttons (Retry, Cancel, Edit animal) are
  filled with the same colour as the page behind them, so only a very faint hairline says where the button
  is. It is equally faint in dark - slightly worse there - so light didn't break it, and the hairline comes
  from a shared colour used everywhere. Changing it would restyle every outlined button in the app, which
  is a decision for you. Written down with the measurements.

## Orchestrator verification during the build

- Measured the running app in a real browser against a fresh production build and confirmed the Digiata
  branding genuinely reaches the screen in both themes: cream page with near-black ink in light, near-black
  with cream in dark, body text at 19:1, and the darker orange correctly substituting for the brand orange
  on light surfaces at 5.4:1.
- Along the way, found a stale development server that had been running since the first epic and was
  serving pre-branding stylesheets. Anyone opening it would have seen an unbranded app and reasonably
  concluded the theme work had failed. It has been stopped.
