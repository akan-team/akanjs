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
- Swapping the Model (#agent-llm)

## Content

In-Page Agent

Every Akan app can host a chat agent that reads the rendered screen and drives it — the assistant on this page is one. What it may do is what a component declared, and what it may read is what a component subscribed. A store class publishes nothing on its own: an agent presses the controls the screen already offers the user, and never a lever the screen does not have.

One mount

<Agent.Chat /> in a layout is the whole integration — launcher, transcript, approval card, and a streaming loop.

Tools run in the browser

The server is a stateless relay that never executes a tool. Every action runs in the caller's own session, gated by guards and the approval card.

Framework built-in

The relay endpoint, the DeepSeek adaptor, and the chat UI all ship with akanjs — no extra library to mount.

Runtime Map

Mounted st.use / st.sel / st.ref keys, hook tools, and Agent.Guide text.

The loop, the approval card, its own /new · /retry · /compact · /copy · /help · /tools, and slash commands from prompt() endpoints.

A stateless HTTP relay. It spends the LLM key and never runs a tool.

The whole transcript in, one assistant answer out. DeepSeek is the default.

External agents that call your domain over HTTP use the MCP server instead — a different catalogue, derived from signal guards.

MCP Server

Mount and Secure

Mount the chat once in a layout. The framework serves runAgentTurn on every app. option.setLlm gives it a key; AKAN_AGENT=false removes the whole surface.

AgentRelayAccess refuses every call until a guard is registered — the same answer None gives. Without one the chat cannot spend the LLM key. A product with accounts names its own guard in the same option.ts, as it would on any other endpoint.

Keeps the transcript across reloads in sessionStorage. Pass { storage: "local" } to outlive the tab. Off by default.

The same endpoint answers text/event-stream. Assistant text arrives as it is generated, with zero app code.

App-global framing on Agent.Chat. Route-scoped guidance layers on through mounted Agent.Guide.

The composer attaches images and text files on its own; attach is where an app reads what needs a parser, like a PDF's text. Nothing is stored — the bytes ride one turn's request, and a reloaded transcript keeps the name without the content. The ceilings are the message's rather than the file's — 4 MB per file, 8 MB and five files per message, and the same file twice refused by name — because what a provider refuses is the sum, and a request that cannot be sent is one the user has to empty the composer to escape.

A press-to-talk microphone whose transcript lands in the composer to be corrected, and a reply read aloud one sentence at a time — but only when the ask itself came in by voice, so a typed question never turns the speakers on. useSpeech from @libs/util/webkit is the engine: the browser's own recognition on the web, Capacitor plugins in a WebView, which has neither.

attach and voice carry functions, and a function cannot cross the RSC boundary — so a server layout cannot pass either. Mount the chat from a small client component in ui/ that calls the hook, the way apps/akan/ui/DocsAgentChat.tsx does.

The Declared Surface

st.tool publishes one action and hands back the callable you wire to onClick, so the agent and the user press the same handler. st.use, st.sel, and st.ref make one store key readable while the component reading it is mounted. Unmount and both withdraw on the next turn.

Six tools are on every screen whatever it declares:

Internal paths only, the same router Link rides.

The previous page in this session's history. Global like navigate, because history is not a control a page owns — a page that draws no back link is not a page you may not leave.

The rendered DOM as compact text. Headings carry their anchor and a truncated read names the sections below the cut, so a long screen stays reachable: pass one of those names — or a heading's own text — as section.

One masked store key.

Scrolls one thing into view and flashes it once the scroll lands, so the agent can show the user where a thing is instead of describing where it is. The target is a tool name, a state key, a scope path, an anchor, or a heading's text. Nothing hidden ever resolves.

Hands a decision back to the user. The turn parks on the question card until they pick an option or write their own answer; dismissing it is an error the agent reads, never a silent empty answer.

A tool that changes the screen waits for the screen before it answers: router.push returns while the payload is still in flight, so navigate — and the session, after every non-query tool — waits for the DOM to hold still before reporting. And the turn cap is a question rather than a dead end: at maxTurns the agent asks whether to keep going, and what the user types instead rides as their own turn.

Long work is awaited, not polled. The session awaits a tool's own promise, so a .exec that awaits the store action finishing the job simply makes the turn take that long — and the change report that follows carries whatever landed, so the model needs no second call to read it. A tool that returns early leaves the agent to ask again and again, one round trip per look, which burns the whole maxTurns budget in seconds on a job measured in minutes. Say so in the desc. For the job a tool cannot await — one started in an earlier turn, or by a person clicking the button — declare a waiting tool of your own beside the control that starts the work: a general built-in wait was tried and removed, because a tool reachable on every screen with no idea what any key means gets spent on whatever key looks promising, parking turns nobody asked to park. Stop reaches a tool that is still running: the session races every call against its abort signal, and the signal itself arrives through AgentAbort.current, the same module slot AgentProgress is. Honouring it is optional, since the race lands whatever the tool does; what it buys is the tool's own cleanup. Import both from akanjs/store — an app may not reach use-agentic directly. A stopped turn answers the calls it never ran: every provider dialect refuses an assistant message whose tool_calls have no results, on that turn and on every later one, so Stop landing between a call and its result would otherwise leave a transcript nothing can be sent from.

The chat answers six commands of its own, listed in the same / menu ahead of the prompts: /new (/clear), /retry, /compact, /copy, /help and /tools. An app writes none of them and cannot add one — a product's own command is a prompt() endpoint, which is guarded and server-side. A built-in wins a name collision with a prompt, the mirror image of the tool rule: a component's st.tool may shadow a built-in it means to replace, but no library's prompt may take /new away from the user who typed it. /new and /copy work mid-turn and ahead of the question card, so /new ends the turn it is clearing instead of being answered into it as text. A command's output is a local message — rendered in the transcript, withheld from the wire, because the transcript is the model's history and text appended plainly would come back next turn as something the assistant believes it said. /copy exists because nothing else keeps the transcript: the relay is stateless, so an export is the one path a wrong answer has to whoever could fix it. And ↑ walks back through what was sent, ↓ forward — seeded from the transcript, so a persisted chat does not lose only what was just typed — while the / menu takes those keys whenever it is open: Enter picks the highlighted row, Tab completes its name, and Escape closes the menu and then the panel.

A long conversation summarizes itself, because nothing else keeps it inside the model's window: the loop runs in the browser and the relay holds no session, so an uncompacted chat grows until the provider refuses the whole request. Past compact.at estimated tokens the history above the last keep messages becomes one message standing in for it — before the turn that would have overflowed, since a provider answers an over-long request with a refusal rather than a shorter answer. The cut only ever lands on a user message, so the kept half never opens with a tool result whose call was summarized away. The summarizing turn carries no tools and no screen context, and is fed a bounded digest rather than the transcript itself, which is the one thing already known not to fit. compact={{ at, keep }} on Agent.Chat tunes it per provider, { at: 0 } turns it off, and /compact does the same on demand keeping nothing.

Reading is per key, not per store: a key the screen does not read stays unreadable even while a sibling key of the same store is live, and every read is masked by the model that key declares. hidden and secret fields never cross the boundary. Base-store plumbing is subscribed with `{ agent: false }` so routing and the caller's credential stay off the surface; a component that wants an agent to read a base key opts it in, as ThemeToggle does for theme.

The only way an action reaches an agent. desc is required and comes first; arg is what the caller must pass and opt what it may. Returns the callable to wire to onClick; a remove* name confirms by default.

Derived values and local state. The declared type typechecks what you hand over and masks how it reads — a model class strips its own hidden, secret, and visual fields; Any passes untouched. Read-only unless set: true.

Subscribes without joining the surface. There is no store-level exposure switch — a store class says nothing about agents.

Zone Agents

Wrap a section in Agent.Zone and everything mounted inside — subscriptions, hook tools, guides — belongs to that zone's own conversation as well as to the root agent. Zones are views of the screen, never walls between its parts. A zone's readScreen reads only its own container, and an Agent.Chat mounted inside binds to the zone session automatically.

Guides follow the layout cascade: a zone reads its ancestors' guidance plus its own, and never a sibling's. The root chat outside the zones keeps seeing the whole screen, so wrapping a section costs the root agent nothing.

Skipping A Region

readScreen reads the whole rendered screen, and a footer, a cookie banner, or a nav that repeats on every route costs the same tokens as the content — on that read and on every later turn, since the read stays in the transcript. Agent.Skip leaves a region out of the default read.

What stands in its place is a named marker, never nothing. A deleted region reads as an absent one — an agent asked about the footer would answer that the page has none. The name in the marker is a section, so naming it reads the region after all: the marker is what the default read leaves out, not a wall.

It hides text, not behaviour. Tools and state keys are declarations rather than markup, so an st.tool declared inside is published exactly as before and highlight still reaches a control in there. This is field.visual one layer up: cost, not secrecy.

Reach for it second. A read is scoped from the other side too: Agent.Zone and readScreen({ section }) narrow to one container, which beats blocklisting five regions on a screen that is mostly chrome. And a footer is last in the document, so on a page long enough to truncate it was already past the cut — the regions worth marking are the ones above the content.

Swapping the Model

Everything the model needs is declared in option.ts, never in the environment. setLlm fills apiKey, model, and host for whichever adaptor holds LlmAdaptorRole, so the settings survive a provider swap. DeepSeek is the built-in default — deepseek-v4-flash at https://api.deepseek.com. With no apiKey the app still boots and the chat says no model is configured; a refusal the provider explained is thrown instead of swallowed, so the chat prints that reason in the user's language.

An adaptor implements one method — chat(request, onDelta?). The whole transcript goes in, one assistant answer comes out. Rebind the role the way applyMiddleware rebinds middleware: last writer wins.

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

