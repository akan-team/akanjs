---
"akanjs": patch
"use-agentic": patch
---

feat: the in-page agent waits out long work instead of polling it, and Stop reaches a tool that is still running

**An agent that started something slow had one way to learn it finished: ask again.** Every look is a full model
round trip, so a two-minute video generation burned the default eight-turn budget in about twenty seconds and read
to the user as check → wait → check → wait, forever. Two things change.

**A tool that awaits its own work now holds the turn, with no model round trip in between.** This always worked —
the session awaits `#execute` and `AgenticSurface.call` awaits `entry.run` — but nothing said so and nothing made
it safe, so apps wrote fire-and-forget tools and left the agent to poll. The shape is one `st.tool` whose `.exec`
awaits the store action that finishes the job; the change report that follows carries whatever landed while it
waited, so the model needs no second call to read the result.

**`waitFor(key, equals?, timeoutSeconds?)` is a new built-in for the case that cannot** — the job was started in an
earlier turn, or by a person clicking the button. It parks on a published state key, the ones `readState` already
lists, and resumes the moment the key moves. Deliberately not a bare sleep: a sleep only makes the polling slower,
and a value worth waiting two minutes for is server-derived state, which in an akan app lives in the store already
— so the requirement is that a mounted component subscribes it, not that anything new be declared. It settles rather than
declaring `settle: false` on purpose: the point of waiting is that something changed, so the session settles the
screen afterwards and takes the diff. Running out is not a failure — it answers with what the key holds now and the model decides
whether to wait again. Default 120s, clamped to 600, and a key this screen does not read is refused by name with
the ones it does.

Two clocks back it, because neither covers the other. The store's own subscription catches the value changing,
which has to land immediately. The one-second tick catches what the store never announces — `retainLive` /
`releaseLive` mutate the live-key map without notifying any listener, so a page navigated away from mid-wait would
otherwise hold the turn until the timeout — and the countdown row needs a tick anyway.

**Stop now ends a turn parked inside a tool.** `AgentSession` passed its abort signal to the approval and question
cards and nowhere else, so a call that took two minutes held the loop for two minutes after the user pressed Stop,
with the chat still showing a turn in flight. Latent until now, and a certainty the moment a tool is allowed to
wait. The session races every call against the signal, and hands the signal to the tool through `AgentAbort` — the
module slot `AgentProgress` already is, for the same reason: work several frames down reads it without every
signature between here and there growing an argument, and a session runs tool calls one at a time. Honouring it is
optional, since the race lands whatever the tool does; what it buys is the tool's own cleanup, such as a timer that
would otherwise tick out its whole timeout with nobody left to answer. A tool that ignores it is left running
rather than cancelled — the work is usually a job a server is already doing, and throwing away a result that is
about to land helps nobody.

**`AgentAbort` and `AgentProgress` are re-exported from `akanjs/store`.** `AgentProgress` had no export path an app
could legally use, `use-agentic` being a third-party import from `apps/**` and `libs/**`, so the documented advice
to report progress from a slow tool was not followable. A tool that can neither report progress nor honour Stop is
exactly the tool this release exists to make writable.
