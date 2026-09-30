# Agent

- Source: /references/ui/agent
- Mirror: /llms/pages/references/ui/agent.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- Agent UI (#agent-ui)
- Chat (#Chat)
- Development Dock (#agent-dock)

## Content

Agent

Agent UI

An assistant that presses the buttons already on the screen, under the same guards, while the person watches. It is not a separate API for robots.

The `Agent` namespace is that UI. One `<Agent.Chat />` in a layout is the whole integration; the other members narrow it or show what it sees.

**The relay endpoint never runs a tool.** Every call runs in the user's own browser session, through the app's guards and the approval card. So a tool exists only where a component declared one, and what the screen does not offer the user, the agent cannot do either.

Words used on this page

Term

- tool: One action a component publishes with `st.tool`, usually the handler its button calls.

- surface: Everything the agent can do and read on the current screen: the mounted tools and keys.

- session: One conversation with its loop and options. `Agent.Chat` and `Agent.Zone` each build one.

- transcript: The conversation so far. It is sent to the model again on every turn.

- built-ins: Runtime tools every screen gets: `navigate`, `goBack`, `readScreen`, `readState`, `highlight`.

- resource: A value a component publishes with `st.expose` or `st.useState` for the agent to read.

Members

Member

- Own UI

- Own chat

- Name prefix

- What the user talks to

- Guidance and scope

- Development

Yes

No

Where the concepts live

This page lists every member and its props. The ideas behind them are explained here:

- In-Page Agent — How the loop, the surface, the approval gate and compaction fit together.

- Agent Chat Cheatsheet — The short version: mount, configure, declare a tool, ship.

Chat

The chat people see: a floating panel wired to the tools and state this screen declared. The loop and every tool call run in this browser. Mount it once, in a layout.

Props / API

Session Options

How the conversation runs, read once at mount. Inside an `Agent.Zone` or `AgentProvider` the chat joins that session, so these belong to whoever built it.

- string — App-wide framing. Route guidance from mounted `Agent.Guide`s layers on top of it.

- AgentRunner — fetchRunner() — Swaps the transport. The default posts to `runAgentTurn`; `httpRunner({ url })` posts elsewhere.

- number — 12 — Model round trips one ask may spend. At the limit, the chat asks the user whether to keep going.

- CompactOptions — { at: 24_000, keep: 6, buffer: 13_000 } — Summarizes past `at` estimated tokens or `buffer` short of the known window. `{ at: 0 }` turns it off.

- BuiltinOption — true — `true` gives all five built-ins, `false` none, an array only those named. `askUser` always stays.

- PersistOption | SessionHistory — Transcript survives reloads in sessionStorage; `{ storage: "local" }` or `SessionHistory` moves it.

- (replaced, summary) => void — Runs after a compaction replaced messages with one summary; a host syncs its own watermark here.

- boolean | AgentVisualOption — true — Rings the calling control (`reveal`) and a pointer presses it (`cursor`). `false` turns both off.

Opening And Placement

- boolean — false — Starts the panel open. The chat keeps its own open state after that.

- boolean / (open) => void — Open state the app controls. `open` alone draws no close button.

- boolean — true — `false` draws no launcher, for an app that opens the panel from a control of its own.

- boolean — false — Renders in the page flow instead of floating, for a zone chat inside its own section.

- boolean — true — Cmd/Ctrl+L opens the panel. `false` gives the chord back, for a shell that already uses it.

Look

- string — Reaches whichever surface is showing: the launcher while closed, the panel while open.

- string — Styles one surface each, where `className` reaches both.

- string — Panel heading. Left out, it reads "Agent" in the user's language.

- ReactNode — Replaces the intro line while the transcript is empty. Starter questions go here.

- ReactNode / boolean — chrome = true — Controls left of clear and close. `chrome={false}` drops the whole bar, leaving `/new` to clear.

Composer Input

- string — Composer text read once at mount, e.g. a `?prompt=` value to prefill without sending it.

- AttachReader — Turns a file into an attachment; `null` falls back to the built-in reader for images and text.

- { perFileBytes?, perMessageBytes?, perMessageCount? } — Size and count caps. Defaults: 4 MB per file, 8 MB and five files per message.

- ReferenceSource[] / boolean — `@` menu sources, each with a `search`. `mentions` draws pointers as names, on when sources exist.

- VoiceEngine — Press-to-talk into the composer. Replies are read aloud only when the question was spoken.

**Closing the panel keeps the conversation.** The session lives in a ref, so it survives reopening; without `persist` it ends with the page.

**Function props need a small client component.** `attach`, `voice`, `reference`, `runner`, `onCompact` and `onOpenChange` carry functions, which cannot cross the RSC boundary from a server layout. Wrap the chat in `ui/` the way `apps/akan/ui/DocsAgentChat.tsx` does with `useSpeech()` from `@libs/util/webkit`.

**A controlled `open` alone stays server-safe.** Without `onOpenChange` no function is passed, so a server component can still render it.

**The launcher appears after hydration.** The panel is a `lazy(…, { ssr: false })` boundary, so its chunk loads once the page has hydrated. That is normal.

**Server settings live in `lib/option.ts`.** `option.setLlm({ apiKey, model, host })` and `option.setAgentAccess(SignedIn)` configure it, never environment variables.

**Answer `data` when the provider cannot reach a `url`.** The provider fetches an `attach` result's `url` itself. Answering both sends the bytes to the model and keeps the address for the thumbnail.

A layout mounts it once, with a translated title and a transcript that survives reloads:

- Zone: A section with its own conversation over a narrowed view of the same screen. An `Agent.Chat` inside binds to it automatically, so two zones on one screen run two conversations side by side, each seeing only its own subtree.

- Guide: Standing guidance for a route subtree. Render it from a `_layout.tsx` or a page, and its text joins every turn's instructions while that subtree is mounted. It draws nothing.

- History: Connects the enclosing zone's transcript to storage the app owns. It does what `persist` does, as a mounted leaf instead of a prop, and draws nothing.

- Skip: A region the default screen read leaves out: chrome that costs tokens and answers nothing, such as a footer, a cookie banner or a repeated nav.

- Scope: Prefixes every tool and resource registered below it, so repeated list items can reuse local names. It opens no conversation and holds no session.

Development Dock

Each component declares its own agent surface, so no single file tells you what the whole screen published. `Agent.Dock` shows it. Mount it next to the chat during development:

**Production draws nothing.** `Agent.Dock` and `Agent.Context` render nothing when `AKAN_PUBLIC_ENV=main`, so leaving them mounted costs a visitor nothing.

**The other parts do not check the environment.** An inspector you assemble from `Agent.Section`, `Agent.StateKey`, `Agent.Tool` or `Agent.Transcript` has to hide itself in production.

**`open` expands Tools.** Transcript always starts expanded; the other sections start folded.

What each section answers

Section

- Tools: Did this screen publish what its author meant, under the names the instructions use?

- State: Which keys are readable right now, and what does one actually return when read?

- Context: What would the next turn carry? Assemble prints the tool names, guides and context blocks.

- Withheld: Which keys were refused, and for what reason.

- Transcript: What has the agent already done to this page?

The parts

Each part is exported, so an app that wants a dock of its own shape composes them instead of re-reading the surface.

- { className?, bridge?, surface?, open? } — The whole panel: `bridge` supplies the state keys, `surface` the tools, `open` expands Tools.

- { className? } — An Assemble button that prints what a turn would carry: tool names, guides, context blocks.

- { className?, title, count, children, open? } — One collapsible `<details>` group with a count beside its title. The dock draws five.

- { className?, bridge, name, entry, live? } — One readable key, read and masked on click, so an object no model claims is refused here.

- { className?, surface, tool, onRun } — One declared tool with its arguments as JSON, and a Run button that calls it in the running app.

- { className?, calls } — What the agent did, oldest first, to check against what the page did. There is no undo.

Restyling the chat

Eleven of the chat's own parts are override slots, so an app re-skins the transcript or the composer without re-implementing the loop. `AgentChat` replaces the whole panel.

Overridable Slots

The full slot list, and how a `_overrides.tsx` binds one.

## Code Examples

### apps/koyo/page/(user)/_layout.tsx

```ts
import { usePage } from "@apps/koyo/client";
import { layout } from "akanjs/client";
import { Agent } from "akanjs/ui";

export default layout().render(({ children }) => {
  const { l } = usePage();
  return (
    <>
      {children}
      <Agent.Chat
        title={l.trans({ en: "Assistant", ko: "도우미" })}
        instructions="Help the operator schedule flights. Confirm before submitting a plan."
        persist
        compact={{ at: 120_000, keep: 8 }}
      />
    </>
  );
});
```

### apps/koyo/page/(user)/_layout.tsx

```ts
import { layout } from "akanjs/client";
import { Agent } from "akanjs/ui";

export default layout().render(({ children }) => (
  <>
    {children}
    <Agent.Chat persist />
    <Agent.Dock open />
  </>
));
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

