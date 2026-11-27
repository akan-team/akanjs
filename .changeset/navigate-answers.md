---
"akanjs": minor
---

The in-page agent's `navigate` says when the page went back to where it was and when part of it is still loading.

- **A redirect back to the page it was on reads as one.** Say navigate is asked for `/org` from `/home`, and the app sends it back to `/home`. The answer now reads "the app sent the page back to /home, the page it was on". Before, it read "sent the page to /home instead", the same as a move that never landed. A move that never landed now says the page stayed and the move did not land. Both a CSR guard's redirect and a server's are recognised.
- **A load still on screen is reported.** When `navigate` or `goBack` answers with a `Load.*` or route `.loading()` fallback still in view, because its wait ran out or an app's own `AgentNavigate` `settle` returned early, the answer says part of the page is still loading and its tools may arrive after the next turn's list. Before, it said only "Now on".
- **`ScreenSettle.isLoading()`** answers whether such a load is still pending, as `ScreenSettle.loaded()` reads it, so an app's `settle` can check it too.
