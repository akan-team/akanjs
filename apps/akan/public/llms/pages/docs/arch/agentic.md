# In-Page Agent

- Source: /docs/arch/agentic
- Mirror: /llms/pages/docs/arch/agentic.md
- Section: docs
- Category: Architecture
- Priority: P2

## Headings

- In-Page Agent (#agent-overview)
- Mount and Secure (#agent-mount)
- The Declared Surface (#agent-surface)
- Zone Agents (#agent-zones)
- Skipping A Region (#agent-skip)
- Showing the Work (#agent-visual)
- Swapping the Model (#agent-llm)

## Content

In-Page Agent

One action a component publishes for the agent, usually the handler its button already calls.

Everything the agent can do and read on the current screen: the mounted tools and keys.

One model answer, together with every tool call it made on the way.

The conversation so far. It is sent to the model again on every turn.

A card that holds a call until the user approves it.

The server endpoint runAgentTurn. It passes the transcript to the LLM and never runs a tool.

A section wrapped in Agent.Zone, with a conversation of its own.

Mounted st.use / st.sel / st.ref keys, hook tools, and Agent.Guide text.

The loop, the approval card, and the six slash commands its / menu lists.

A stateless HTTP relay. It spends the LLM key and never runs a tool.

The whole transcript in, one assistant answer out. OpenaiLlm is the default.

Off by default. Keeps the transcript in sessionStorage; { storage: "local" } outlives the tab.

Text appears as it is generated. The same endpoint answers text/event-stream; no app code.

App-wide framing. Route-scoped guidance layers on through a mounted Agent.Guide.

Handles files that need a parser, like a PDF's text, or uploads the file and answers a url.

A press-to-talk microphone, and spoken replies to questions asked by voice.

The only way an action reaches an agent. It returns the callable to wire to onClick.

desc is required and comes first. arg is what the caller must pass; opt is what it may, and an omitted opt arrives as null.

Both take a scalar, an enum, or one array level of either ([String], [TaskStatus]), so a list never has to be taught as a string format.

A third argument narrows the values at render time: .arg("branch", String, { oneOf: branchCodes }) is enumOf for values known only once the component has its data.

confirm holds the call on the approval card: true for every call, or a function of the arguments for the ones that deserve it.

A remove* name confirms by default, reading destructiveness off the name as MCP hints do. Write { confirm: false } to opt out.

settle: false marks a read of what is already there, so the turn reports without waiting for the DOM. The default waits, since a write may still be landing.

A falsy name declares the tool without publishing it. The callable still handles a person's click; nothing reaches the agent.

Every chain ends in a hook, so a conditional surface withholds the name instead of skipping the declaration.

The name follows the render: a control that appears later publishes, and one that goes away stops.

Derived values and local state, each ending in one hook. .value() takes the value the component holds, or a thunk when a ref the children fill builds it; .init() is useState and returns the same pair.

The declared type checks what you hand over and masks how it reads: a model class strips its hidden, secret and visual fields; Any passes untouched.

Read-only unless set: true, which publishes a set<Name> tool of the same type. { report: false } keeps a key that changes every second out of change reports.

The data-akan-* attributes for a handler passed by reference, and {} for an inline arrow: a closure says nothing about what it does, and a guessed mark is worse than none.

Every akanjs/ui control already spreads it, so an app writes it only on a control of its own.

key says which of several same-named controls this is, in the call argument's own words. Without it the pointer cannot tell a tab's menus apart, so it draws nothing.

Subscribes without joining the surface. There is no store-level switch; a store class says nothing about agents.

Opens an internal path through the same router Link uses.

Returns to the previous page in this session's history.

Reads the rendered screen as compact text.

Reads one store key, masked by its model.

Scrolls one thing into view and flashes it, to show the user where it is.

Hands a decision back to the user on a question card.

It waits for the screen

router.push returns while the payload is still in flight, so navigate, and every tool not declared a read, waits for the DOM to hold still before reporting. Reading built-ins are declared, so looking around costs nothing.

Calls travel in a batch

Every call the model makes in a turn runs in order and comes back as one tool message: one round trip. Chained one per turn, each call would cost a round trip and a resend of the transcript.

The turn cap asks

At maxTurns the agent asks whether to keep going. Whatever the user types instead rides as their own turn.

Start a new conversation.

Send the last message again.

Summarize the conversation so far.

Copy this conversation.

Show what you can do here.

List this screen's tools.

The default. Speaks chat-completions to any host: OpenAI, DeepSeek, Groq, OpenRouter, Ollama.

Speaks the Messages API, and reads a PDF as well as a picture.

Every Akan app can host a chat agent that reads the screen and works it for the user; the assistant on this page is one. It can only press what the screen already offers, so it never gets a lever the user does not have.

What it may do is what a component declared, and what it may read is what a component subscribed. A store class alone publishes nothing.

One mount

<Agent.Chat /> in a layout is the whole integration: launcher, transcript, approval card and a streaming loop.

Tools run in the browser

The server is a stateless relay that never runs a tool. Every action runs in the user's own session, behind guards and the approval card.

Built into the framework

The relay endpoint, two LLM adaptors and the chat UI all ship with akanjs. There is no extra library to mount.

The chat and every tool run inside the user's browser, on the controls the page already shows. The server is only a relay that spends the LLM key and never runs a tool.

Words used on this page

Term

Runtime map

Piece

External agents that call your domain over HTTP use the MCP server instead. It is a different catalogue, derived from signal guards.

MCP Server

Mount and Secure

Turning the agent on takes three steps: mount the chat, give it an LLM key, and name who may use it.

Mount <Agent.Chat /> once, in a layout. The runAgentTurn relay is already served on every app.

Give it a key with option.setLlm in lib/option.ts.

Name a guard with option.setAgentAccess. Until you do, every call is refused.

AgentRelayAccess refuses every call until a guard is registered, the same answer None gives, so the chat cannot spend the LLM key. A product with accounts names its own guard in option.ts, as it would on any endpoint. AKAN_AGENT=false removes the whole surface.

Agent.Chat options

Option

Attachments

Voice

attach and voice carry functions, and a function cannot cross the RSC boundary, so a server layout cannot pass them. Mount the chat from a small client component in ui/ instead:

The Declared Surface

The agent's surface is exactly what the mounted components declare. Declare a tool beside the control that does the same thing, and the agent and the user press one handler.

Declaring tools and state

Six built-in tools

These are on every screen, whatever it declares. builtins narrows the first five; askUser belongs to the session and always stays.

Tool

What the agent can read

Return the answer, not the record

How a turn runs

Long work and Stop

Slash commands

The chat answers six commands of its own. An app writes none of them.

Command

Long conversations summarize themselves

Compaction keeps the tail

Past the threshold, every message above the cut becomes one summary message, and the last few messages are kept as they were. The cut always lands on a user message.

Zone Agents

Agent.Zone gives one section of a screen its own conversation, so each part of a busy page can have a focused agent.

Two zones, one root agent

Two zones on one screen, each with its own inline chat that reads only its own section, while the root agent's chat keeps seeing both.

Skipping A Region

Agent.Skip keeps a region such as a footer, a cookie banner or a repeated nav out of the default readScreen. Those regions cost as many tokens as real content, on the read and on every later turn, because the read stays in the transcript.

Showing the Work

The chat panel is closed as often as it is open, so the page itself shows what the agent does. The control a call came from is ringed, scrolled into view if needed, and a pointer travels to it and presses it.

An app writes nothing for this. Passing the handler by reference, as in onChange={st.do.setTitleOnTask}, is what publishes the tool and marks the control, so an inline arrow silently loses all three: the tool, the mark and the pointer.

Try it below. Both buttons hand their st.tool callable straight to onClick. Ask the agent to count up three times and reset, and watch where it presses.

The pointer lives for a turn

What it refuses to draw

A ring on the wrong element is worse than none, because it tells the user something untrue. So nothing is drawn when:

Almost nothing waits for the animation: the call starts the moment the effect receives its event, so decoration never slows the agent.

Navigation and links

To turn it off, visual={false} draws nothing, and visual={{ cursor: false }} keeps the ring but drops the pointer.

Swapping the Model

The model is configured in option.ts, never in the environment. setLlm fills apiKey, model, host, accepts, maxTokens and contextWindow for whichever adaptor holds LlmAdaptorRole, so the settings survive a provider swap.

Two adaptors ship, one per wire:

Adaptor

Writing your own adaptor

An adaptor implements one method, chat(request, onDelta?): the whole transcript goes in and one assistant answer comes out. Install it with applyAdaptor; as with applyMiddleware, the last writer wins.

## Code Examples

### apps/<app>/page/_layout.tsx · apps/<app>/lib/option.ts

```ts
// page/_layout.tsx
<Agent.Chat persist />

// lib/option.ts — the key lives in env, which is gitignored
import { SignedIn } from "../srvkit";

export const option = new AkanOption<ModulesOptions>()
  .setLlm((options) => options.llm ?? {})
  .setAgentAccess(SignedIn);
```

### apps/akan/ui/DocsAgentChat.tsx

```ts
"use client";
import { useSpeech } from "@libs/util/webkit";
import { Agent } from "akanjs/ui";

export const DocsAgentChat = () => {
  const voice = useSpeech();
  return <Agent.Chat persist voice={voice} />;
};
```

### <Model>.Zone.tsx — the tool and the button are one declaration

```ts
const waypointList = st.use.waypointList();
const publish = st.tool("publishPlan")
  .desc("Publish the flight plan being edited.")
  .exec(() => st.do.publishPlan());
const focusWaypoint = st.tool("focusWaypoint")
  .desc("Center the map on one waypoint.")
  .arg("waypointId", ID)
  .opt("zoom", Int)
  .exec((waypointId, zoom) => st.do.selectWaypoint(waypointId, zoom));

st.expose("selectedWaypointId", ID)
  .desc("The waypoint the map is centered on.")
  .value(selected?.id ?? null);

<Button onClick={publish}>{l("plan.publishPlan")}</Button>
<Agent.Guide instructions="This screen edits the weekly flight plan. Focus a waypoint before editing it." />
```

### two zones, two parallel conversations

```ts
<Agent.Zone id="comments" label="Comment management" instructions="Moderate the comment queue." persist>
  <Comment.Zone.Board init={commentInit} />
  <Agent.Chat inline />
</Agent.Zone>

<Agent.Zone id="posts" label="Post management">
  <Post.Zone.Editor init={postInit} />
  <Agent.Chat inline />
</Agent.Zone>
```

### a region marked, and what the read prints instead

```ts
<Agent.Skip label="site footer">
  <Footer />
</Agent.Skip>

// Or on the element the page already renders, where a wrapper div would move a flex or grid layout:
<footer id="footer" data-agent-skip="site footer">…</footer>

// readScreen then prints this in place of the whole region:
// [skipped: site footer (#footer)]
```

### apps/<app>/page/_layout.tsx

```ts
<Agent.Chat visual={false} />

<Agent.Chat visual={{ cursor: false }} />
```

### apps/<app>/lib/option.ts

```ts
import { LlmAdaptorRole } from "akanjs/service";
import { MyLlm } from "../srvkit";

export const option = new AkanOption<ModulesOptions>()
  .setLlm((options) => options.llm ?? {})
  .applyAdaptor(LlmAdaptorRole, MyLlm);
```

### akanjs/service — LlmAdaptor

```ts
export interface LlmAdaptor {
  chat(request: LlmTurnRequest, onDelta?: (delta: string) => void): Promise<LlmTurnAnswer | null>;
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

