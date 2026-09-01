---
"akanjs": patch
"use-agentic": patch
---

feat: the in-page agent waits for the screen, aims its reads, points at things, and says what it is doing

**A tool that changes the screen now waits for the screen before it answers.** `router.push` returns while the RSC
payload for the new route is still in flight, so `navigate` used to report success onto a page that had not
rendered yet: the `readScreen` in the same turn read the page the user had just left, and the new route's tools were
not registered. `ScreenSettle.wait()` waits for DOM quiescence — bounded, and quiescence rather than a framework
signal because the client router hands its promise to nobody and a change may land in the store, in a refetch, or
in a streamed Suspense boundary. `navigate` awaits it, and `AgentSession` awaits it after every non-`query` tool
before taking the change report, so an optimistic action that commits a tick later is reported as what it did
rather than as the moment before it. Tools and state from a fresh route are still only listed from the next turn —
the catalogue is snapshotted when a turn starts — and the navigate result says so.

**`goBack` joins `navigate` as a global built-in.** It was briefly declared by `Link.Back`, which made it exist
only where a back link happened to be rendered — but history is not a control a page owns: every route has a
previous page, the browser's own gesture is always there, and a page that draws no back link is not a page you may
not leave. It refuses at call time when nothing is behind the current page instead of walking out of the app.

**`readScreen` takes a `section` and there is a new `highlight(target)`.** Both resolve a name the agent has
already seen rather than a selector it invented: a `data-akan-action` / `data-akan-state` annotation (the one
`readScreen` prints beside a control), an `Agent.Zone` or `useScreenScope` container, an element id, or a heading
by its own text — matched on letters and digits, so the slug an agent writes for a heading it read resolves. That
tolerance stops at headings: a heading is a landmark and scrolling to the wrong one costs nothing, while two
buttons reading "Save" are not the same control. Nothing hidden resolves at all, because a ring nobody can see
reads as a broken tool rather than as a miss. A name that resolves to nothing is the caller's mistake, with a
refusal that lists the sections actually on screen.

**A screen is only aimable if its names are printed**, which is what the first version got wrong: a page of twenty
`Scroll.Slide` sections answered "nothing on this screen carries a name", because `readScreen` printed the heading
text without its anchor and the truncation note stopped at a character count. Headings now carry `(#anchor)` when
they open an id'd or scoped container, and a truncated read ends with the headings below the cut — otherwise
everything past the 8000-character limit is unreachable, since nothing names it. `highlight` flashes **after the
scroll lands**: a smooth scroll across a long page outlasts a flash begun at the top, which is the same bug wearing
a different hat. `useScreenScope` now hands
back its scope path and `Load.Units` / `Load.View` / `Data.ListContainer` put it on the container they render, so
every list and detail view on an akan screen is addressable with no app code. `highlight` scrolls its target into
view and flashes it on the app's own primary token: it is the one built-in that exists for the *user's* benefit,
because showing where a control is beats writing directions to it.

**A slow tool can say what it is doing.** `AgentProgress.report(message, { done, total })` is the browser twin of
`McpProgress.report` — reached through a module slot rather than a parameter, so work several frames down (a store
action, an upload loop, an adapter) reports without every signature growing a channel argument, and a no-op when
nobody is rendering it. The chat shows the report on that call's row until the row resolves. A session runs tool
calls one at a time, which is why the browser needs no `AsyncLocalStorage` to do this.

**The turn cap is a question instead of a dead end.** At `maxTurns` the session asks whether to keep going through
the same card `askUser` uses, and the answer rides as the user's own turn — so a steer typed instead of the
keep-going choice reaches the model as guidance rather than being swallowed. A host that renders no
`pendingQuestion` passes no `continueAsk` and keeps the old failure, because asking with nobody listening would
hang.
