<!-- akan:generated -->

# Akan In-Page Agent Guideline

## Purpose
Use this when mounting `<Agent.Chat />`, publishing an `st.tool`, or deciding what an in-page agent may read and
drive. The always-loaded convention set carries the short version; this is the full contract.

## The Surface Is The Declaration

Every akan app can host a component-level agent that reads the rendered screen and drives it. **A component
declaration is the surface, exactly**: `st.tool` publishes one action, and `st.use` / `st.sel` / `st.ref` make one
store key readable while the reading component is mounted. Nothing is derived from a store class — declaring a
method on a `store(...)` gives an agent nothing at all, because a lever the screen does not offer the user is not
one an agent may pull in their place, and a module's whole vocabulary published at once was noise the model paid
for. `Load` scopes, the route, and the live keys complete the context. The React core is the `use-agentic` package;
apps and libs never import it directly (`no-import-external-library`) — everything reaches them through `st.*` and
`akanjs/ui`.

**Mounted is not published: on a CSR stack only the current page is.** The page kept under the current one for a
swipe back stays mounted and live, and its declarations stay registered, but its tools, resources, guides and
`st.use` keys are parked until it is current again — the agent sees the screen the user sees, never two. Each page
container renders `use-agentic`'s `<AgentActivity active>` for this; a parked registration shadows nothing, two
pages declaring one name never clash, and a registry kept outside the surface reads the same gate through
`useAgentGate()`, as the store's live keys do.

## Mounting The Chat
- **Mount `<Agent.Chat />` once in a layout.** That is the floating chat, the approval card, and the client-side
  loop. The default runner drives `runAgentTurn`, which the **framework serves on every app** — no lib to mount,
  `AKAN_AGENT=false` takes it off — and negotiates streaming via `accept`, so assistant text arrives as it is
  generated with zero app code. The endpoint is a stateless relay and **never executes tools**: every tool runs in
  the caller's own browser session, gated by guards and the approval card. Its guard is `AgentRelayAccess`, which
  **refuses every call until the app names a guard of its own** — the same answer `None` gives, with no boot
  warning. A product with accounts names it in its `option.ts`, `option.setAgentAccess(SignedIn)`, taking the same
  guard classes every endpoint takes (an array is ANDed, `null` clears what a library set); without one the chat
  cannot spend the LLM key. **The guard decides who, not what** — the browser writes the instructions, tools and
  transcript — so `option.setAgentRequestPolicy((request, { id, headers, account, ip }) => request)` sees each turn
  after the guard, before the quota and the model (tool names as the page published them), and returns what is
  sent, or throws an `Err` (`agent.error.requestRefused`) to refuse it. `setAgentQuota` and `setAgentUsage` get that
  same `turn`, and usage comes once per turn the quota passed, `failed` and `aborted` ones too. With no policy set, a turn past
  `AgentRelayPolicy.defaultLimits` (5,000 messages, 512 tools, 256 context entries, 8M characters, 64 MiB of
  attachments) is refused with 413; a policy of the app's own keeps them by returning
  `AgentRelayPolicy.capped(request, limits)`, and `(request) => request` lifts them. An error that is not an `Err`
  reaches the chat as a generic failure and the server log in full, unless `AKAN_ERROR_DETAIL=1` or a development
  runtime (`akan start`, `NODE_ENV` `development` or `test`) shows its message.
  `persist` keeps the transcript across reloads (sessionStorage; `{ storage: "local" }` to outlive the tab),
  default off, and `shortcut={false}` gives the browser back the Cmd/Ctrl+L the launcher otherwise captures.
  **`persist` also takes a `SessionHistory` of the app's own** — `{ load, save, clear }` — which is how a
  transcript lives on a server instead of in web storage. All three may answer asynchronously; a `load` still in
  flight when the user sends the first message is **dropped, not merged**, because the conversation on screen is
  the one they are having — which makes **sending on mount a race the restore loses**, so an opening prompt waits
  for `session.isRestoring` to clear or goes into `defaultDraft` and lets the user send it. Saves are chained rather than fired per change, so a slow store cannot land an older
  transcript last. **Every session option on the chat — `runner`, `instructions`, `maxTurns`, `compact`,
  `builtins`, `persist`, `onCompact` — is ignored when an enclosing `Agent.Zone` or `AgentProvider` already holds
  a session**: the chat binds to that one, and the options belong to whoever built it.
  **A session the chat made ends when the chat unmounts** — nothing renders its approvals once it is gone, so a
  turn left running would drive a screen the user has navigated away from; a session handed down by an
  `AgentProvider` or an `Agent.Zone` belongs to whoever provided it.
- **The panel is customized in three widening steps, and most designs stop at the first.** Props first:
  `open` / `onOpenChange` drive it from the app's own control (`launcher={false}` then draws no launcher of its
  own), `launcherPlacement` / `hideLauncherBelow` place the launcher — which sits above the page's bottom chrome
  and under every menu and modal — `launcherClassName` / `panelClassName` reach one surface each where
  `className` reaches both, `intro`
  replaces the empty-state line — where starter questions go — and `header` adds controls beside the built-in
  clear and close. `title` takes a node (a mark before the name); give `label` then, as the panel's accessible
  name. The header's parts carry `data-slot="agent-header"`, `"agent-title"` and `"agent-running"`, so
  `panelClassName="[&_[data-slot=agent-running]]:bg-accent"` restyles one without leaning on the markup. A modal,
  menu or popconfirm opened from inside the floating panel, `header` included, stacks above the panel, while
  one the page opens stays under it. While the turn waits on an approval, card or question, a scrim the panel
  opened sinks under the panel so the answer stays reachable, and it comes back once answered. `chrome={false}` drops the header bar whole, for an `inline` chat inside a
  panel the app already titles, and `defaultDraft` opens the composer with text in it without sending it. A panel driven by a
  controlled `open` with **no** `onOpenChange` draws no close button at all rather than an inert one. Then the
  slots: `AgentLauncher`, `AgentSteps`, `AgentBubble`, `AgentComposer`, `AgentApproval`,
  `AgentQuestion`, `AgentToolCard`, `AgentToolRow`, `AgentQueued`, `AgentMenu`, `AgentMarkdown` and `AgentCode` each replace one part in `_overrides.tsx`, and
  `akanjs/ui` exports every default beside them (`DefaultBubble`, `DefaultComposer`, …) so a skin composes the
  one it is replacing. **`AgentSteps` is one agent turn** — the messages between the user message that opened it
  and the next one, with `isRunning` saying whether more are still coming — which is the grain a chat needs to
  fold a turn's steps into a `details` and stand its answer outside them. It is the one boundary a per-message
  slot cannot see, since neither message on either side of it knows it is at an edge. The default draws the turn's
  messages flat into a Fragment, so a chat that binds nothing renders exactly what it did before the slot existed. The attachment row is exported on its own as `AgentAttachments`, because a replaced
  `AgentBubble` that redraws it by hand forks the rule for which carrier is shown how — and then keeps whatever
  that rule was on the day it was copied. `AgentCode` is where a highlighter binds — the fence's language reaches it — and a
  replacement for `AgentBubble` carries its own `memo`, since the transcript re-renders on every delta. Only then
  `AgentChat`, which replaces the panel whole: it also replaces the slash commands, the compaction notice and the
  approval gate, so reach for it when the *layout* differs, not when the look does.
  A manifest reaches a layout-mounted chat like any other component: the override provider wraps the whole layout
  stack, root layouts included. `UiOverrideProvider` is also a public `akanjs/ui` export, for giving one mount site
  a different slot map than its route would.
- **The composer is a textarea**: Enter sends, Shift+Enter writes a newline, and it grows to a few lines before
  it scrolls. The vertical arrows still walk what was sent, but only from the first or last line — anywhere else
  the caret is the textarea's own. On a phone the panel is the whole screen (it is a card from `sm:` up) and it
  lifts above the on-screen keyboard, which only `visualViewport` reports.
  **Enter during a running turn parks the message and sends it the moment the turn ends** — the Queue button
  beside Stop does the same, and the placeholder says so. One slot, not a list: a second send joins the first on
  a new line, so the model is handed one user message. The card above the composer (`AgentQueued`) shows what is
  waiting with two ways out — ✎ takes it back into the composer, ahead of whatever was typed since, and ✕ drops it.
  **Stop hands a parked message back to the composer rather than opening the next turn with it**, so Stop means
  stop; `/new` drops it along with the conversation it was written for, the way it drops staged files. A `/prompt`
  parks like text and runs when its turn comes; the built-ins (`/new`, `/copy`, …) never park, and a question the
  agent is waiting on still takes the composer as its answer.
- **The LLM is configured in `option.ts`, never through the environment.** `option.setLlm({ apiKey, model, host })`
  — or `setLlm((options) => …)` to read the key out of the app's own env object, which is where a secret belongs —
  fills whichever adaptor holds `LlmAdaptorRole`, reaching it as the `llmOption` use. The settings are the role's
  rather than one provider's, so they survive a swap. **`OpenaiLlm` is the built-in default**, pointed at
  `https://api.openai.com/v1`; with no `apiKey` or no `model` the app still boots and the chat answers
  `llmUnavailable`. Swap providers the way middleware is applied:
  `option.applyAdaptor(LlmAdaptorRole, AnthropicLlm)`. An app may still write its own — an `adapt()` class in a
  `srvkit/` implementing `LlmAdaptor.chat(request, onDelta?)`, where ignoring `onDelta` still answers whole — and
  whatever settings it needs beyond `LlmOption` travel through the same `setLlm`, read back with
  `use<MyLlmOption>()` from an interface extending it.
- **Two adaptors ship, one per wire — a vendor is a host and a model name, not a protocol.** `OpenaiLlm` is the
  chat-completions dialect (`OpenaiDialect`) pointed at whatever `host` names, so OpenAI, DeepSeek, Groq,
  Together, OpenRouter, Ollama and a self-hosted vLLM are all one class and one `option.setLlm({ host, model })`.
  `AnthropicLlm` is the Messages API and declares `{ image: true, document: true }`; it is its own file rather
  than a branch, because the system prompt is a field and not a message, tool calls and results are content
  blocks, the results ride in a *user* turn, roles must alternate — so two wire turns that map to one role are
  merged — and `max_tokens` is required. **Both require `model`**: a default would age into a 404, and worse, it
  would decide the vision claim for the app.
- **`OpenaiLlm` claims vision for its default host and for nothing else.** OpenAI's own endpoint takes image
  parts, so that is what it answers with no `host` set. A `host` the app named is a gateway the class knows
  nothing about, and it stays text-only until `option.setLlm({ accepts })` says otherwise — handing bytes to a
  model that cannot decode them kills the whole turn on a 400, where text-only degrades them to a note the model
  can repeat back. A `host` naming OpenAI's own endpoint is the default host by hostname, not a gateway, and an
  app's own chat-completions adaptor claims through `OpenaiLlm.acceptsOf(llmOption)` instead of copying the rule —
  a copy that read "any host is a gateway" kept a vision model text-only for an app that spelled out
  `https://api.openai.com/v1`.
- **A refusal is `agent.error.llmRequestFailed`, and it names the host** — unless the prompt did not fit. It
  carries `{ provider, status }`, the hostname and the HTTP status; the provider's own sentence goes to the server
  log only, because it can quote an account id or part of a key and `Err` data reaches the browser.
  `LlmOverflow.refusal(host, status, reason)` builds it, and reads the one refusal a chat can undo — a prompt past
  the window, recognized from each provider's own sentence — as `agent.error.contextOverflow` with the `limit` it
  named, which the relay flags so the chat compacts and asks again. An adaptor an app wrote throws through the same function, so its refusals
  translate and recover the way the shipped ones do without a key in the framework's dictionary it cannot add.
- **`accepts` is answered per model, through `option.setLlm({ accepts })`.** An adaptor answers for an API and one
  API serves models that differ, so the override rides beside the `model` it is a fact about. It is not a table
  the framework keeps: a table is a claim about models that ship after it, and getting this wrong is the worst
  failure available — a provider handed bytes it cannot decode either refuses the turn or accepts it having seen
  nothing, and the model then answers confidently about a file it never read.
- **`contextWindow` is declared the same way: `option.setLlm({ contextWindow })`.** Every turn relays it with the
  answer ceiling the adaptor actually sends (`LlmAdaptor.limits` — `AnthropicLlm` always sends one, `OpenaiLlm`
  none), and the chat guards its window with it. It is not a table either; a model id is retired or renamed long
  before a table notices.
- **An adaptor answers `null` for "not configured" and *throws* for a refusal it can explain.** The two are
  different things to be told: collapsing both into `null`, the way the adapter convention otherwise reads, left a
  user reading `llmUnavailable` — "no model is configured" — about a conversation that had merely outgrown the
  context window. A thrown `Err` reaches the chat as its own text, so the reason the provider gave is what the
  user sees. It travels as the dictionary key plus the values that key interpolates, on both the JSON and the SSE
  path, and **`fetchRunner` resolves it against the dictionary one step before the transcript** — the endpoint has
  no language to resolve it in and the browser does, which is why the key was reaching the screen raw.
