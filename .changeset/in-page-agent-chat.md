---
"akanjs": patch
"use-agentic": patch
---

feat: component-level in-page agent — a chat that reads the rendered screen and drives it

The agent surface work so far described what an app *can* do (the store catalogue, the MCP catalogue); this ships
the half that knows what the *screen* is doing and lets a user hand it the wheel. One mount —
`<Agent.Chat />` in a layout — is the whole integration.

**`use-agentic`** is the new framework-independent core: a mount-lifetime surface
(`registerTool`/`registerResource`/`openScope`/`registerGuide`, name stacks where the newest registration wins and
unregistering restores what it shadowed), hooks (`useAgentState`/`useAgentTool`/`useAgentResource`/`useAgentGuide`,
declarations mount-static and behavior always-latest), and `AgentSession` — the client-side conversation loop:
send → model turn → tool calls → approval gate → execute → report resource diffs → next turn. The loop lives in the
browser because the tools do; the server is one stateless turn relay that never executes anything. Failures land in
the transcript rather than being thrown past it. The wire is documented in `WIRE.md` so any backend can serve it.

**The screen context is derived, not declared — and it follows the rendered screen, not the bundle.**
`Load.Units`/`Load.View` register scopes and curated item lists as they mount (labels come from the `text: "title"`
search role), `StoreInstance` counts which state keys the mounted components are reading — `st.use`, `st.sel`, and
`st.ref` all count, the selector-based pair by running the selector once over a recording proxy — and a store's
catalogued actions and state are published only while one of its keys is live. `AgentContext` assembles route +
screen + live-state blocks per turn — primitives inline, everything else one masked `readState(key)` call away.
`remove*` names default to a confirm gate, and the framework adds two built-ins beside `readState`: `navigate`
(internal paths only, the same router `Link` rides) and `readScreen`, which serializes the rendered DOM into
compact text — headings, links, control values with their `data-akan-*` annotations — so "what does this page
say?" is answerable; the chat's own UI is skipped via `data-agent-ui` and a password value is never read.

**Exposure is the store author's to trim.** `static agent = false` keeps a whole store off the surface — the
framework's base store declares it, which also stops `readState` from reaching the `tryJwt` credential — and
`static agent = { exclude: [...] }` withholds named actions and state keys; `st.use.x({ agent: false })`
subscribes without counting toward liveness. Generated `set<Key>` conveniences are no longer published at all:
they carried no schema, so they listed as zero-argument levers that wrote `undefined`.

**`Agent.Chat`** is the user-facing half: launcher, transcript, composer, and the inline approval card, behind an
`ssr: false` lazy boundary so none of it touches the server HTML, and re-skinnable through the `AgentChat`
`_overrides.tsx` slot. Its default runner posts the wire to the app's own `runAgentTurn` route through
`httpRunner`, which negotiates streaming via `accept`: the relay answers `text/event-stream` — one `RunnerEvent`
per SSE `data:` line, assistant text arriving as it is generated — and a server that does not stream answers the
same JSON turn. The endpoint reads the request with `.with(Req)` and returns a raw `Response` for the SSE half;
`LlmAdaptor.chat` gained an optional `onDelta`, and an adapter that ignores it still answers whole. An app that
mounts no relay degrades to a transcript message. `ThemeToggle` now publishes the current `theme` and a
`setTheme` tool, so "switch to dark mode" works out of the box wherever it is mounted.
A tool call is **one row** that resolves in place — pending, then `✓`/`✕` with the result's error or change count
— rather than a badge on the assistant message and a second row for its result: the model needs both wire
messages, but the user watched one thing happen, and the name appearing twice read as a doubled call. The row
carries the call's arguments, because two searches are otherwise the same row twice.
`<Agent.Guide instructions="..." />` layers route-scoped guidance by render position: nested Guides concatenate,
navigation withdraws them. `prompt()` endpoints double as the chat's slash commands with no listing endpoint —
the client reads its own serialized signals, and the prompt's GET enforces its guards at call time.

**The relay is framework-embedded.** `runAgentTurn`, the `agentTurn` scalar, `AgentTurnStream`, and the
`AgentRelayAccess` guard ship with `akanjs` itself, registered the way the `base` module is — every app serves the
relay with no lib to mount, `AKAN_AGENT=false` takes it off, and a lib that still carries its own `agent` module
wins the refName so older workspaces keep working. `DeepseekLlm` (OpenAI-compatible REST, zero SDK dependencies)
is the predefined default behind a new `LlmAdaptorRole`; an app swaps providers in its `option.ts` with
`applyAdaptor(LlmAdaptorRole, OwnLlm)` — the same builder family as `applyMiddleware`, and the override mechanism
works for every predefined adaptor role. The endpoint stays outside MCP — its `Any` bodies are refused from the
catalogue — and `AgentRelayAccess` defaults to allow but now **warns at boot while no policy is registered**; a
policy that throws fails closed.

**An app configures its server in `lib/option.ts`, not through the environment and not in `main.ts`.** `AkanOption`
gained three setters, each read from every lib in mount order with the app's own last, so an app tightens what a
library declared without restating it. `setLlm({ apiKey, model, host })` — or `setLlm((options) => …)` to take the
key out of the app's own gitignored env object — reaches whichever adaptor holds `LlmAdaptorRole` as the
`llmOption` use, replacing `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` / `DEEPSEEK_HOST`; the settings belong to the role
rather than to one provider, so they survive a swap. `setAgentAccess(SignedIn)` names the guards
`AgentRelayAccess` forwards to, which `AgentRelayAccess.use` takes at boot. `setMcp({ … })` carries the MCP server
settings that `new AkanApp("./server", { mcp })` used to spell as child environment variables — the gateway there
only spawns children, while `option.ts` is already handed to the process that mounts `/mcp`, so `AkanAppOptions.mcp`
is gone. Every `AKAN_MCP_*` env spelling still works for a deployment configuring what the source does not, and an
option written in code still wins over the env of the same name.

**`<Agent.Zone id="comments">` runs a second agent over one section, in parallel with the root.** Zones are views
of the same surface, never walls: everything mounted inside — `st.use` subscriptions (liveness is now tagged with
the ambient scope), hook tools, guides — belongs to the zone's own conversation *and* stays visible to the root
agent, so wrapping a section costs the root nothing. An `Agent.Chat` inside binds to the zone session
automatically, a zone's `readScreen` reads only its own `data-agent-zone` container, and guides follow the layout
cascade — ancestors and own, never a sibling's. The core grew `surface.view(path)` (`SurfaceView`), and
`AgentSession` now runs over any view.

**`persist` keeps the transcript across reloads.** Off by default; `<Agent.Chat persist />` stores settled
messages in sessionStorage (per-tab, gone when the tab closes), `{ storage: "local" }` outlives it, and each
`Agent.Zone persist` keys its own entry by scope path. Restores drop the assistant draft a reload cut short,
saves are debounced against streaming deltas, a versioned envelope discards stale wire shapes, only the newest 50
messages are kept, and a full or blocked storage never breaks the chat. The chat header gained a clear button
that empties both the transcript and the stored copy.
