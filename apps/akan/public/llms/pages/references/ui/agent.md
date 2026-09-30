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

Own UI

Own chat

Name prefix

- What the user talks to

  - Agent.Chat: The chat panel: launcher, transcript, composer and approval card. Mount it once.

  - Agent.Zone: A section with its own conversation over a narrowed view of the same screen.

- Guidance and scope

  - Agent.Guide: Standing instructions for a route subtree. Renders nothing.

  - Agent.History: Connects the enclosing zone's transcript to storage the app owns. Renders nothing.

  - Agent.Skip: A region the default screen read leaves out, named so it can still be asked for.

  - Agent.Scope: Prefixes the tools and resources below it, without opening a conversation.

- Development

  - Agent.Dock: The development inspector: tools, readable state, withheld keys and the transcript.

  - Dock parts: `Agent.Context`, `Agent.Section`, `Agent.StateKey`, `Agent.Tool`, `Agent.Transcript`: the dock's pieces, for an inspector of your own.

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

- instructions (string): App-wide framing. Route guidance from mounted `Agent.Guide`s layers on top of it.

- runner (AgentRunner, default fetchRunner()): Swaps the transport. The default posts to `runAgentTurn`; `httpRunner({ url })` posts elsewhere.

- maxTurns (number, default 12): Model round trips one ask may spend. At the limit, the chat asks the user whether to keep going.

- compact (CompactOptions, default { at: 24_000, keep: 6, buffer: 13_000 }): Summarizes past `at` estimated tokens or `buffer` short of the known window. `{ at: 0 }` turns it off.

- builtins (BuiltinOption, default true): `true` gives all five built-ins, `false` none, an array only those named. `askUser` always stays.

- persist (PersistOption | SessionHistory): Transcript survives reloads in sessionStorage; `{ storage: "local" }` or `SessionHistory` moves it.

- onCompact ((replaced, summary) => void): Runs after a compaction replaced messages with one summary; a host syncs its own watermark here.

- visual (boolean | AgentVisualOption, default true): Rings the calling control (`reveal`) and a pointer presses it (`cursor`). `false` turns both off.

Opening And Placement

- defaultOpen (boolean, default false): Starts the panel open. The chat keeps its own open state after that.

- open / onOpenChange (boolean / (open) => void): Open state the app controls. `open` alone draws no close button.

- launcher (boolean, default true): `false` draws no launcher, for an app that opens the panel from a control of its own.

- inline (boolean, default false): Renders in the page flow instead of floating, for a zone chat inside its own section.

- shortcut (boolean, default true): Cmd/Ctrl+L opens the panel. `false` gives the chord back, for a shell that already uses it.

Look

- className (string): Reaches whichever surface is showing: the launcher while closed, the panel while open.

- launcherClassName / panelClassName (string): Styles one surface each, where `className` reaches both.

- title (string): Panel heading. Left out, it reads "Agent" in the user's language.

- intro (ReactNode): Replaces the intro line while the transcript is empty. Starter questions go here.

- header / chrome (ReactNode / boolean, default chrome = true): Controls left of clear and close. `chrome={false}` drops the whole bar, leaving `/new` to clear.

Composer Input

- defaultDraft (string): Composer text read once at mount, e.g. a `?prompt=` value to prefill without sending it.

- attach (AttachReader): Turns a file into an attachment; `null` falls back to the built-in reader for images and text.

- attachLimits ({ perFileBytes?, perMessageBytes?, perMessageCount? }): Size and count caps. Defaults: 4 MB per file, 8 MB and five files per message.

- reference / mentions (ReferenceSource[] / boolean): `@` menu sources, each with a `search`. `mentions` draws pointers as names, on when sources exist.

- voice (VoiceEngine): Press-to-talk into the composer. Replies are read aloud only when the question was spoken.

**Closing the panel keeps the conversation.** The session lives in a ref, so it survives reopening; without `persist` it ends with the page.

**Function props need a small client component.** `attach`, `voice`, `reference`, `runner`, `onCompact` and `onOpenChange` carry functions, which cannot cross the RSC boundary from a server layout. Wrap the chat in `ui/` the way `apps/akan/ui/DocsAgentChat.tsx` does with `useSpeech()` from `@libs/util/webkit`.

**A controlled `open` alone stays server-safe.** Without `onOpenChange` no function is passed, so a server component can still render it.

**The launcher appears after hydration.** The panel is a `lazy(…, { ssr: false })` boundary, so its chunk loads once the page has hydrated. That is normal.

**Server settings live in `lib/option.ts`.** `option.setLlm({ apiKey, model, host })` and `option.setAgentAccess(SignedIn)` configure it, never environment variables.

**Answer `data` when the provider cannot reach a `url`.** The provider fetches an `attach` result's `url` itself. Answering both sends the bytes to the model and keeps the address for the thumbnail.

A layout mounts it once, with a translated title and a transcript that survives reloads:

- Zone: A section with its own conversation over a narrowed view of the same screen. An `Agent.Chat` inside binds to it automatically, so two zones on one screen run two conversations side by side, each seeing only its own subtree.

  - id (string): Required. Sets the name prefix and `data-agent-zone`; characters outside `A-Za-z0-9_-` become `-`.

  - children (ReactNode): The section itself. Everything mounted here is part of the zone.

  - className (string): Goes on the wrapper `div` that carries `data-agent-zone`.

  - label (string): Readable name for the scope, sent to the model with the screen context.

  - instructions (string): Zone guidance, mounted as an `Agent.Guide`: the root agent reads it too, a sibling zone never.

  - runner / maxTurns / compact / builtins / persist / onCompact / visual (same as Chat): Same contracts as the chat's, applied to this zone's session and read once at mount.

  - session (AgentSession): Runs the zone on a session the app built and owns; unmounting the zone leaves it running.

  - onSession ((session) => void): Hands the session out once it exists, for a page or store that sends into it or watches it.

  - **Zones are views, never walls.** Tools, `st.use` subscriptions and guides mounted inside belong to this zone's session and to the root agent both.

  - **Everything a zone publishes is named `<id>.<name>`.** Instructions that name a tool must carry the prefix; a bare name is a tool that does not exist, and the model spends a turn on `Unknown tool`. Build the name from the id, and check the published list with `Agent.Context`'s Assemble.

  - **A zone that must stay on its screen withholds the rest.** `builtins={["readScreen", "readState"]}` takes `navigate`, `goBack` and `highlight` away rather than discouraging them, so no prompt can talk the model past it.

  - **Each zone persists on its own.** `persist` is keyed by the zone's scope path, so two zones never share a transcript.

- Guide: Standing guidance for a route subtree. Render it from a `_layout.tsx` or a page, and its text joins every turn's instructions while that subtree is mounted. It draws nothing.

  - instructions (string): The text, always in English: the model reads it, so the `l()` rule does not apply.

  - **The render tree is the cascade.** Each mounted Guide adds its own block, and navigating away withdraws it.

  - **It is a component, not a route stage.** Neither `page()` nor `pageConfig` has an `instructions` field, and `*.abstract.md` is never served to agents.

- History: Connects the enclosing zone's transcript to storage the app owns. It does what `persist` does, as a mounted leaf instead of a prop, and draws nothing.

  - load / save / clear (SessionHistory["load" | "save" | "clear"]): The three sides of the store. Inline closures are fine, since they are read through a ref.

  - onCompact ((replaced, summary) => void): Where a host with its own server-side summary moves its watermark.

  - **Why a component rather than `persist`.** A function cannot cross the server/client boundary as a prop, so passing `persist` to whoever builds the session makes every ancestor up to it a client component. With this leaf as the only client module, the zone and its chat stay in a server component.

  - **It needs an enclosing session.** Mount it inside `Agent.Zone` or `AgentProvider`, as in `<Agent.Zone id="thread"><ThreadHistory … /></Agent.Zone>`. The root `Agent.Chat` hands no session down, so use its `persist` there.

  - **Restoring happens only on a fresh conversation.** Mounted with the zone, it restores; mounted after something has happened, it only saves from then on.

  - **The store is attached only while this is mounted.** A zone's own session ends with the zone anyway, but one the app passed in outlives this and stops saving on unmount. To keep saving, call `session.setHistory` yourself; that takes the slot, so a later unmount here leaves it alone.

- Skip: A region the default screen read leaves out: chrome that costs tokens and answers nothing, such as a footer, a cookie banner or a repeated nav.

  - label (string): Printed in place of the region, and the name `section` takes to read it anyway. Required.

  - children (ReactNode): The region itself.

  - className (string): Goes on the wrapper `div`.

  - **The agent knows what it skipped.** `[skipped: <label>]` stands in its place, so asked about the footer it says it did not read one instead of saying there is none. `section: "<label>"` reads it on request.

  - **It hides text, not behaviour.** Tools and state keys are declarations, not markup: an `st.tool` inside is published as before, and `highlight` still reaches a control in here.

  - **Where a wrapper would move the layout, use the attribute.** Between a flex container and its children, put it on the element you already render: `<footer data-agent-skip="site footer">`.

- Scope: Prefixes every tool and resource registered below it, so repeated list items can reuse local names. It opens no conversation and holds no session.

  - id (string): The prefix: everything below is published as `<id>.<name>`, nested scopes joined with dots.

  - children (ReactNode): The subtree the prefix applies to.

  - kind (string): What sort of scope this is. `Agent.Zone` opens its own with `kind="zone"`.

  - **Scope or Zone?** Use `Agent.Scope` when a repeated subtree needs distinct tool names but shares the screen's one agent. `Agent.Zone` wraps a scope and adds a conversation of its own.

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

- Agent.Dock ({ className?, bridge?, surface?, open? }): The whole panel: `bridge` supplies the state keys, `surface` the tools, `open` expands Tools.

- Agent.Context ({ className? }): An Assemble button that prints what a turn would carry: tool names, guides, context blocks.

- Agent.Section ({ className?, title, count, children, open? }): One collapsible `<details>` group with a count beside its title. The dock draws five.

- Agent.StateKey ({ className?, bridge, name, entry, live? }): One readable key, read and masked on click, so an object no model claims is refused here.

- Agent.Tool ({ className?, surface, tool, onRun }): One declared tool with its arguments as JSON, and a Run button that calls it in the running app.

- Agent.Transcript ({ className?, calls }): What the agent did, oldest first, to check against what the page did. There is no undo.

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

### apps/koyo/ui/CommentZone.tsx

```ts
import { Agent } from "akanjs/ui";
import type { ReactNode } from "react";

interface CommentZoneProps {
  className?: string;
  children: ReactNode;
}
export const CommentZone = ({ className, children }: CommentZoneProps) => {
  return (
    <Agent.Zone
      className={className}
      id="comments"
      label="Comment management"
      instructions="Moderate the comment queue. Call comments.approveComment to accept one."
      builtins={["readScreen", "readState"]}
      persist
    >
      {children}
      <Agent.Chat inline defaultOpen chrome={false} />
    </Agent.Zone>
  );
};
```

### apps/koyo/page/(user)/plan/_layout.tsx

```ts
import { layout } from "akanjs/client";
import { Agent } from "akanjs/ui";

export default layout().render(({ children }) => (
  <>
    <Agent.Guide instructions="This section edits the weekly flight plan. Focus a waypoint before editing it." />
    {children}
  </>
));
```

### apps/koyo/ui/ThreadHistory.tsx

```ts
"use client";
import { Agent } from "akanjs/ui";

interface ThreadHistoryProps {
  threadId: string;
}
export const ThreadHistory = ({ threadId }: ThreadHistoryProps) => {
  return (
    <Agent.History
      load={() => loadThreadMessages(threadId)}
      save={(messages) => saveThreadMessages(threadId, messages)}
      clear={() => clearThreadMessages(threadId)}
    />
  );
};
```

### apps/koyo/ui/SiteFooter.tsx

```ts
import { Agent } from "akanjs/ui";

export const SiteFooter = () => {
  return (
    <Agent.Skip label="site footer">
      <footer className="border-border border-t px-6 py-10 text-foreground/60">
        <LegalLinks />
      </footer>
    </Agent.Skip>
  );
};
```

### apps/koyo/ui/WaypointRow.tsx

```ts
import { Agent } from "akanjs/ui";

interface WaypointRowProps {
  waypointId: string;
  name: string;
}
export const WaypointRow = ({ waypointId, name }: WaypointRowProps) => {
  return (
    <Agent.Scope id={waypointId} label={name}>
      <WaypointEditor waypointId={waypointId} />
    </Agent.Scope>
  );
};
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

