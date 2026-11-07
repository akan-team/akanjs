<!-- akan:generated -->

## What The Page Draws
- **The page shows the agent's work, not just the transcript.** A chat panel is closed as often as it is open, and
  a form that fills itself or a tab that switches on its own is a change the user watches happen with nothing
  anywhere attributing it. So **the control a call was published from is ringed** where it stands, scrolled to
  first when it is off screen, and **a pointer travels to it and presses it** — both on by default, and both
  driven from the tool call itself rather than from a store action, which cannot tell the agent's write from the
  user's.
- **It costs an app nothing, for the same reason `data-akan-action` does.** `onChange={st.do.setTitleOnTask}` by
  reference is what annotates the control, and the annotation is what makes it findable — so the fields and verbs
  that matter light up with no code. An inline arrow publishes no tool, carries no annotation, and therefore
  draws nothing: one wrapper silently costs three things at once.
- **For a control the framework did not render, spread `agentAttrs`** from `akanjs/ui`:
  `<button type="button" {...agentAttrs(run)} onClick={run}>`, where `run` is what `st.tool(…).exec(…)` returned.
  It reads the name off the callable, so there is nothing to keep in sync and no `ref` to thread — and it earns the
  same E2E selector and accessibility name an `akanjs/ui` control has. Never hand-write `data-akan-*`.
- **A control that shares its handler with its siblings takes a key**: `agentAttrs(switchTab, menu)`, in the same
  vocabulary the call's argument uses. One tool serves a whole tab strip or a whole list, so without it every
  namesake is interchangeable in the DOM and the page can say *what* the agent did but never *where* — which the
  no-guessing rule then turns into drawing nothing. `Tab.Menu` passes its `menu` key; do the same for a row verb
  whose id the call names.
- **Almost nothing is waited on.** The call starts the moment the effect is handed its event; a ring that lands a
  frame later costs the turn nothing, and an animation that held a call would make the agent slower for a
  decoration. A turn past four scrolls stops scrolling and keeps ringing — eight scrolls across a page is motion
  sickness rather than attribution. **The one exception is `navigate`**, whose press has to land before the router
  replaces the tree the link is in; it is capped at 600ms and the call goes either way.
- **What it refuses to draw is the point.** A name several rows answer to rings nothing rather than guessing a row,
  a call an approval or a guard turned back is never drawn at all, a tool no control carries draws nothing, and a
  backgrounded tab draws nothing. A ring on the wrong element is worse than no ring: it is the screen telling the
  user something untrue about what just happened. **A control the screen is not actually showing is not pointed at
  either, and the pointer goes rather than travelling to it**: `checkVisibility` answers about an element alone, so
  one under a modal's backdrop, inside a drawer that has slid off, or faded to nothing all pass it while being
  invisible, and a pointer sent there lands on a blank patch of overlay. The test is `elementFromPoint` at the
  control's own centre, taken after the reveal has settled. **`navigate` is mostly in that last class** — the router is not
  an element, so it draws nothing. A bar across the top of the page was tried for it and removed: it read as
  chrome the page had grown rather than as the agent doing something, which is the opposite of attribution. What
  it does draw is the **link already on screen that goes where it is going**, when exactly one does and the user
  can already see it: that one is an element, and the pointer presses it before the route moves. Addresses are
  compared as routes (`router.routeOf`), since the locale and base-path segments are on the `<a>` and never on the
  tool argument. An off-screen link is left alone — scrolling to a link and then leaving the page it is on is two
  motions for one act. **Link presence is a drawing condition, never a permission one**: the agent may navigate
  anywhere the user could type, and a zone that must not leave one screen drops `navigate` through `builtins`.
- **Turn it off with `visual`** on `Agent.Chat` / `Agent.Zone` — `false` for all of it, `{ cursor: false }` or
  `{ reveal: false }` for one effect. The pointer is chrome (`data-agent-ui`, `aria-hidden`,
  `pointer-events: none`), so `readScreen` never reads it back and `highlight` can never aim at it.
- **`ToolActivity` is the channel underneath**, a `ToolRunner` host option and an `AgentSession.onActivity`, firing
  `start` / `end` around the execution alone. It is deliberately not `progress`: that one fires only for a tool
  that chose to report, and a tool that says nothing about itself is exactly the one whose effect arrives
  unexplained. The `start` may answer a promise, and the call waits for it — the whole of what makes drawing a
  click on a link possible.
- **`AgentSession.onTurn(running)` is the other half**, and the unit the pointer's life is measured in. A model's
  calls arrive with its own writing between them, seconds each, so a pointer that lived for the length of a *call*
  spent every turn vanishing and coming back. Only the conversation loop reports there — `compact` runs under the
  same internal flag and drives nothing on screen.
- **The pointer presses on arrival, never on departure** — a press fired as it leaves is a click on whatever it
  was still over. It glides only when the hop is far enough to be worth following (a third of a second to cross
  fifty pixels reads as lag, not motion), and teleports otherwise. It appears at the first control it presses,
  **drifts clear of what it pressed** and waits out the gap between calls there as a spinner — a person clicks and
  takes the hand away, and a spinner left sitting on the button covers the change it just caused — and fades when
  the turn ends; **a turn that
  drove no control draws no pointer at all**, since parking one in a corner for a turn that only answered a
  question claims something that did not happen. While a reveal scrolls, it holds still — as a person's does — and
  carries a chevron pointing the way the view is travelling, because stillness over a sliding page otherwise reads
  as a pointer that has come loose rather than as the one doing the scrolling. The ring answers *where* and the
  pointer answers *who*, which is why they are one default rather than two.
- **A form patch fans out over the fields it named.** `fill<Model>Form` is published by the form rather than by any
  one control, so it rings one control per field in the arguments — resolved through the same
  `data-akan-state="<model>Form.<field>"` the setter annotates — capped at five. `writeOn<Model>(path, value)`
  draws nothing, for the same reason it carries no annotation: there is no control to put one on.
