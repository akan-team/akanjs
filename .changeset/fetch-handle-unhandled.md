---
"akanjs": minor
---

A read that fails after the page has moved on no longer surfaces as an error nobody can see, and the in-page agent's `navigate` waits for more of the page it arrives on and can be set app-wide.

- **No unhandled rejection from a fetch-handle field.** A field read off a fetch handle and never handed on, as when a render throws first, no longer rejects unhandled. Say `const { orgInitInSelf } = fetch.initOrgInSelf(...)` runs and a sibling read refused after a sign-out throws the render. The field's promise used to reject with no handler in a CSR app. A consumer that does take the field, a `Load.*` or an `await`, still sees its rejection.
- **No failure log for a page that is gone.** A CSR page's render that fails once its layer has unmounted is no longer logged as `render of … failed`. A sign-out that moves the page mid-read is the usual case.
- **`navigate` waits under `display: contents` wrappers.** `ScreenSettle.loaded()` skipped a pending load whose wrapper is `display: contents`, which has no box of its own. It now asks the first wrapper with a box.
- **A web route's `.loading()` is waited for.** It now draws the same `template[data-akan-loading]` mark as a `Load.*` fallback, so `navigate` on the web waits for a page section the server streams in.
- **A refused path still lists links.** It now lists the links the screen showed before the move. Read after a back, a page the stack slides back to could draw its links without a box for a while, and the refusal listed none. `navigate`'s description no longer gives a docs-site path as its example.
- **`AgentNavigate.set({ description, settle })`** (`akanjs/store`) sets the built-in `navigate` and `goBack` app-wide, so an app no longer has to shadow `navigate` to change either:
  - `description` replaces what the model reads about `navigate`, e.g. `"Open a board at /boards/<id>."`;
  - `settle` replaces how `navigate` and `goBack` wait for the page they land on. It receives the runtime's own wait, so `settle: async (settled) => { await settled(); await boardReady(); }` extends it.

  Both are read at every call.
