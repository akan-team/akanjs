---
"akanjs": minor
---

The in-page agent's `navigate` now works the same on the web and in a CSR app.

- **A path with no page is refused.** Before, a path the app answered with its not-found view reached the agent as a successful move, on the web and in an app alike. Only a bare 404 was refused. Now `navigate` takes the page back and refuses the path, listing the links on the screen it returned to.
  - `isNotFoundView()` from `akanjs/client` says whether the page on screen is that view. On the web it covers a not-found view the server drew, including a document loaded as one. In an app it covers the not-found route a CSR stack drew for a path no page matches.
  - A CSR `PathRoute` marks its not-found routes with `notFound: true`.
- **A CSR link's path can be read.** `CsrLink` draws no `href`, so `readScreen`, the links `navigate` lists when it refuses, and the agent's cursor found no path in an app. A CSR link now carries its path as `data-href`, under `/<lang>` as an SSR link's `href` is, and the agent reads either.
- **`router.navigation()` waits for a CSR move to land.** On the CSR stack, `router.navigation()` used to settle as soon as a `push` or `replace` was asked. Now it settles once the move is made:
  - after the page slides in, or once it is drawn;
  - for a push queued behind another page's slide, once that push runs;
  - for a move a back or the browser's own move drops, at once, with the page where it stayed;
  - for a move another took the place of, as a guard's redirect does, with that one.

- **A redirect from a page out of sight no longer strands a CSR app on a blank page.** In a CSR app, a page whose render redirects sends the visitor on from that page, drawing nothing. Say a page under the stack (the sign-in page, drawn again for the new account after a sign-in) has a render that redirects back to the page on screen while that page's own redirect is still on its way. The stack used to take that move as a turn back: it dropped the redirect and left the page on screen showing its skeleton for good. Now a move to a page that redirected leaves its redirect on its way and settles with it. A guard that refuses a page on its way back to the page on screen still turns that move back.
  - `isRedirectMove(options)` from `akanjs/client` tells a `RouterInstance` that `router.redirect()` or `router.notFound()` handed it the move.
  - A guard stays the place for a redirect that depends on the account: a page under another one never runs its guards, while its render still runs, and a redirect from it still moves the page on screen.

Upgrading needs no step.
