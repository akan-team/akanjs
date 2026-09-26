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

tool

One action a component publishes with `st.tool`, usually the handler its button calls.

surface

Everything the agent can do and read on the current screen: the mounted tools and keys.

session

One conversation with its loop and options. `Agent.Chat` and `Agent.Zone` each build one.

transcript

The conversation so far. It is sent to the model again on every turn.

built-ins

Runtime tools every screen gets: `navigate`, `goBack`, `readScreen`, `readState`, `highlight`.

resource

A value a component publishes with `st.expose` or `st.useState` for the agent to read.

Own UI

Own chat

Name prefix

What the user talks to

The chat panel: launcher, transcript, composer and approval card. Mount it once.

A section with its own conversation over a narrowed view of the same screen.

Guidance and scope

Standing instructions for a route subtree. Renders nothing.

Connects the enclosing zone's transcript to storage the app owns. Renders nothing.

A region the default screen read leaves out, named so it can still be asked for.

Prefixes the tools and resources below it, without opening a conversation.

Development

The development inspector: tools, readable state, withheld keys and the transcript.

Dock parts

`Agent.Context`, `Agent.Section`, `Agent.StateKey`, `Agent.Tool`, `Agent.Transcript`: the dock's pieces, for an inspector of your own.

In-Page Agent

How the loop, the surface, the approval gate and compaction fit together.

Agent Chat Cheatsheet

The short version: mount, configure, declare a tool, ship.

App-wide framing. Route guidance from mounted `Agent.Guide`s layers on top of it.

Swaps the transport. The default posts to `runAgentTurn`; `httpRunner({ url })` posts elsewhere.

Model round trips one ask may spend. At the limit, the chat asks the user whether to keep going.

Summarizes past `at` estimated tokens or `buffer` short of the known window. `{ at: 0 }` turns it off.

`true` gives all five built-ins, `false` none, an array only those named. `askUser` always stays.

Transcript survives reloads in sessionStorage; `{ storage: "local" }` or `SessionHistory` moves it.

Runs after a compaction replaced messages with one summary; a host syncs its own watermark here.

Rings the calling control (`reveal`) and a pointer presses it (`cursor`). `false` turns both off.

Starts the panel open. The chat keeps its own open state after that.

Open state the app controls. `open` alone draws no close button.

`false` draws no launcher, for an app that opens the panel from a control of its own.

Renders in the page flow instead of floating, for a zone chat inside its own section.

Cmd/Ctrl+L opens the panel. `false` gives the chord back, for a shell that already uses it.

Reaches whichever surface is showing: the launcher while closed, the panel while open.

Styles one surface each, where `className` reaches both.

Panel heading. Left out, it reads "Agent" in the user's language.

Replaces the intro line while the transcript is empty. Starter questions go here.

Controls left of clear and close. `chrome={false}` drops the whole bar, leaving `/new` to clear.

Composer text read once at mount, e.g. a `?prompt=` value to prefill without sending it.

Turns a file into an attachment; `null` falls back to the built-in reader for images and text.

Size and count caps. Defaults: 4 MB per file, 8 MB and five files per message.

`@` menu sources, each with a `search`. `mentions` draws pointers as names, on when sources exist.

Press-to-talk into the composer. Replies are read aloud only when the question was spoken.

Did this screen publish what its author meant, under the names the instructions use?

Which keys are readable right now, and what does one actually return when read?

What would the next turn carry? Assemble prints the tool names, guides and context blocks.

Which keys were refused, and for what reason.

What has the agent already done to this page?

The whole panel: `bridge` supplies the state keys, `surface` the tools, `open` expands Tools.

An Assemble button that prints what a turn would carry: tool names, guides, context blocks.

One collapsible `<details>` group with a count beside its title. The dock draws five.

One readable key, read and masked on click, so an object no model claims is refused here.

One declared tool with its arguments as JSON, and a Run button that calls it in the running app.

What the agent did, oldest first, to check against what the page did. There is no undo.

A section with its own conversation over a narrowed view of the same screen. An `Agent.Chat` inside binds to it automatically, so two zones on one screen run two conversations side by side, each seeing only its own subtree.

Required. Sets the name prefix and `data-agent-zone`; characters outside `A-Za-z0-9_-` become `-`.

The section itself. Everything mounted here is part of the zone.

Goes on the wrapper `div` that carries `data-agent-zone`.

Readable name for the scope, sent to the model with the screen context.

Zone guidance, mounted as an `Agent.Guide`: the root agent reads it too, a sibling zone never.

same as Chat

Same contracts as the chat's, applied to this zone's session and read once at mount.

Runs the zone on a session the app built and owns; unmounting the zone leaves it running.

Hands the session out once it exists, for a page or store that sends into it or watches it.

Standing guidance for a route subtree. Render it from a `_layout.tsx` or a page, and its text joins every turn's instructions while that subtree is mounted. It draws nothing.

The text, always in English: the model reads it, so the `l()` rule does not apply.

Connects the enclosing zone's transcript to storage the app owns. It does what `persist` does, as a mounted leaf instead of a prop, and draws nothing.

The three sides of the store. Inline closures are fine, since they are read through a ref.

Where a host with its own server-side summary moves its watermark.

A region the default screen read leaves out: chrome that costs tokens and answers nothing, such as a footer, a cookie banner or a repeated nav.

Printed in place of the region, and the name `section` takes to read it anyway. Required.

The region itself.

Goes on the wrapper `div`.

Prefixes every tool and resource registered below it, so repeated list items can reuse local names. It opens no conversation and holds no session.

The prefix: everything below is published as `<id>.<name>`, nested scopes joined with dots.

The subtree the prefix applies to.

What sort of scope this is. `Agent.Zone` opens its own with `kind="zone"`.

Agent UI

An assistant that presses the buttons already on the screen, under the same guards, while the person watches. It is not a separate API for robots.

Words used on this page

Term

Members

Member

Yes

No

Where the concepts live

This page lists every member and its props. The ideas behind them are explained here:

Chat

The chat people see: a floating panel wired to the tools and state this screen declared. The loop and every tool call run in this browser. Mount it once, in a layout.

Props / API

Session Options

How the conversation runs, read once at mount. Inside an `Agent.Zone` or `AgentProvider` the chat joins that session, so these belong to whoever built it.

Opening And Placement

Look

Composer Input

A layout mounts it once, with a translated title and a transcript that survives reloads:

Development Dock

What each section answers

Section

The parts

Each part is exported, so an app that wants a dock of its own shape composes them instead of re-reading the surface.

Restyling the chat

Overridable Slots

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

