# Agent Chat

- Source: /cheatsheet/interface/agent-chat
- Mirror: /llms/pages/cheatsheet/interface/agent-chat.md
- Section: cheatsheet
- Category: Interface
- Priority: P2

## Headings

- Where A Turn Runs (#one-turn)
- Mounting The Chat (#mount)
- Every Part Is A Slot (#slots)
- A Tool The User Answers (#card)
- Pointing At Data (#reference)
- The Queue And The Slash Menu (#queue)
- Keeping The Transcript (#transcript)

## Content

Agent Chat

Where A Turn Runs

`Agent.Chat` adds a chat that drives your screens for the user. The server only relays messages; every tool runs in the user's own browser tab.

Words used on this page

Term

- turn: Everything the agent says and does between one user message and the next.

- transcript: The conversation so far, kept in the browser tab and sent to the model every turn.

- relay: The `runAgentTurn` endpoint, which passes the transcript to the LLM and never runs a tool.

- tool: One action a component publishes with `st.tool`, usually the handler its button calls.

- approval card: A card that holds a call until the user approves it.

- slot: One part of the chat you can replace in `_overrides.tsx`.

- reference: Data the user pointed at with `@`, carried inside their message.

- zone: A section wrapped in `Agent.Zone`, with a conversation of its own.

One refund, traced

A customer on the order screen types “refund the last one”, and a moment later the order is refunded. These are the questions a security reviewer asks first:

Question

Answer

- Which machine ran the refund? — The customer's browser tab, through the handler the Refund button calls.

- Whose credential did it carry? — The signed-in user's own, exactly like a click on that page.

- What kept it off someone else's order? — The guards every call passes, plus the approval card when the tool asks for one.

- What did the server do? — `runAgentTurn` forwarded the transcript and tool descriptions and returned one answer.

- What did the server keep? — Nothing: it holds no session and stores no transcript.

One turn, end to end

Screen

st.tool declarations · subscribed keys

the transcript lives in this tab

guarded by AgentRelayAccess

LLM provider

named in option.setLlm

The tool calls the model asked for

Approval card

confirm and guard

The tool runs in this browser

the handler the button calls

Change report

what moved on screen

Nothing is stored server-side

holds no session, runs no tool

**Name a guard, or the chat answers no one.** `AgentRelayAccess` refuses every caller until `lib/option.ts` calls `option.setAgentAccess(SignedIn)` with your own guard. It takes the same guards any endpoint names, ANDed when there are several.

Mounting The Chat

Mount `Agent.Chat` once, in the layout that wraps every screen the agent should reach. That one element brings the launcher, the transcript, the approval card and the streaming loop:

**`instructions` is English, always.** The model reads it whatever language the shop sells in, and the same holds for every `.desc()` and `Agent.Guide`.

**`title` and `intro` go through `l()`.** `l()` is for strings a person reads, which is why `instructions` does not use it.

**`persist` keeps the conversation across reloads.** The last section covers where it is kept.

**Do not mount it conditionally to close it.** Unmounting aborts the session and throws the conversation away. To open the chat from your own control, pass the controlled pair `open` and `onOpenChange`.

Props

- title (string, default l("base.agent")): Header text and the panel's accessible name.

- instructions (string): App-wide guidance for the model, in English, which `Agent.Guide` adds route guidance to.

- defaultOpen (boolean, default false): Opens the panel on first render while the panel owns its state.

- open (boolean): Controlled open state, paired with `onOpenChange`; left off, the panel owns it.

- onOpenChange ((open: boolean) => void): Called on open and close; without it, a controlled panel draws no close button.

- launcher (boolean, default true): `false` draws no floating button, for a shell that already has its own entry point.

- intro (ReactNode): Replaces the empty-state line while the transcript is empty, where starter questions go.

- header (ReactNode): Extra controls in the header bar, left of the built-in clear and close buttons.

- chrome (boolean, default true): `false` drops the header bar and `header` for an inline chat; `/new` still clears.

- defaultDraft (string, default ""): The composer's opening text, read once at mount and never sent, where a `?prompt=` value goes.

- inline (boolean, default false): Renders in the page flow instead of floating, for a zone chat inside its own section.

- shortcut (boolean, default true): ⌘L on Apple platforms and Ctrl+L elsewhere; `false` gives the chord back to the browser.

- launcherClassName (string): Classes for the closed button only, where `className` reaches both surfaces.

- panelClassName (string): Classes for the open panel only.

- builtins (boolean | AgentBuiltin[], default true): Which built-in tools this chat's agent gets: all, none, or exactly the ones listed.

- persist (PersistOption | SessionHistory): Keeps the transcript across reloads, as the last section shows.

`attach`, `voice`, `visual`, `maxTurns`, `compact` and the rest are listed in the Agent UI reference.

Five built-in tools

Besides what the screen declares, the runtime gives every chat these five tools. `builtins` picks which ones this chat's agent gets.

Tool

- navigate: Opens an internal path through the same router `Link` uses.

- goBack: Returns to the previous page in this session's history.

- readScreen: Reads the rendered screen as compact text.

- readState: Reads one store key the screen subscribed, masked by its model.

- highlight: Scrolls one thing into view and flashes it, to show the user where it is.

**Keep a chat on its screen** with `builtins={["readScreen", "readState", "highlight"]}`. Without `navigate` and `goBack` it cannot leave.

**A withheld tool does not exist for the model.** Calling it anyway answers "unknown tool", the same as a name that was never registered.

**A screen's own tool is never withheld.** A tool a component declares under a built-in's name belongs to the screen, so `builtins` leaves it alone.

**`askUser` is not on this list.** It belongs to the session, so `builtins` never removes it.

**There is no general wait tool.** One was built and removed because, knowing no key's meaning, it parked turns on whatever key looked promising; declare a waiting tool beside the control that starts the work instead.

Every Part Is A Slot

A brand rarely wants the framework's bubble, but always wants its approval gate. So you replace parts, not the chat: twelve slots bind in a `page/**/_overrides.tsx` manifest and cascade down the route tree like layouts.

Slot

Description and default export

- AgentChat: The whole panel (launcher, transcript, cards and composer), so reach for it last.

- AgentLauncher: The closed-state button, given `label`, `hotkey` and `unread` for a new-message badge. — DefaultLauncher

- AgentBubble: One message; wrap yours in `memo()`, since the transcript re-renders on every delta. — DefaultBubble

- AgentSteps: One whole agent turn plus `isRunning`; the default adds no element. — DefaultSteps

- AgentComposer: The input row with Send and Stop, whose field shell comes from the `input` recipe slot. — DefaultComposer

- AgentApproval: The confirm gate above the composer, which a `remove*` tool reaches by default. — DefaultApproval

- AgentQuestion: The `askUser` card, which shows the choices while a free-text answer goes in the composer. — DefaultQuestion

- AgentQueued: The message parked while a turn runs, with its take-back and drop controls. — DefaultQueued

- AgentMenu: The completion list above the composer: `/` commands and `@` references. — DefaultAgentMenu

- AgentMarkdown: Assistant text, built as React elements and never with `dangerouslySetInnerHTML`. — DefaultMarkdown

- AgentCode: A fenced code block in that text, where a highlighter binds; `lang` is the fence's language. — DefaultCode

- AgentToolCard: The frame around a card tool's own component. — DefaultToolCard

**Compose the default.** Eleven slots export their default beside them, so a replacement can wrap the one it replaces instead of rewriting it.

**`AgentChat` is the last resort.** It replaces the whole panel and has no exported default to compose.

Folding a turn with AgentSteps

`AgentSteps` is the one slot that is not a re-skin. It receives a whole turn, so it can fold the steps into a `<details>` and leave the final answer outside:

Then bind it, with any other slots, in the route's manifest:

**A turn is the unit only this slot sees.** Neither message on either side of a turn boundary knows it sits at an edge, so a per-message slot cannot fold one.

**`isRunning` is true only for the last turn while the session works on it.** Without it, a live progress line and a finished turn's header look the same.

**The default adds nothing.** `DefaultSteps` draws the same flat bubbles into a Fragment, so it takes no `className` and no existing layout notices it.

A Tool The User Answers

Some arguments are the user's to give: a delivery address, a phone number, a date someone has to look up. A model that fills them in has answered its own question, and prompting cannot reliably stop it.

Declare the tool with `st.tool(name)`, a `.desc()`, and the `.arg()`s the model passes.

End the chain with `.card(render)` instead of `.exec(fn)`. The call parks in the chat and your form renders there.

In the form, call `submit(value)` to answer or `cancel(reason)` to decline.

Here the model asks the customer for an address, and the Deliver button stays off until one exists:

How a card differs from an exec

- submit(value) — What the form submits is the call's result, which the model reads back. `cancel(reason)` arrives as an error instead, so a dismissed card is something the agent can respond to.

- Arguments Are Checked First — Before the card is parked, never while it renders. A bad argument reaches the model as a refusal it can fix; a throw in your component would take the chat panel down.

- It Waits Outside The Tool Queue — A form in front of a person is not work. Holding the execution lock through it would freeze every other agent on the page behind one unanswered card.

- confirm — Not read for a `.card()` at all. The card in front of the user is already the asking.

**The frame always draws a dismiss,** even when your form has no cancel button, so a turn never parks on something the user cannot get out of.

**Store writes are still reported.** The screen is snapshotted before and after the wait, so a card that writes what it collected into the store reports what moved like any other call.

Pointing At Data

“Why was this one refunded?” can only be answered if the chat knows which one. The @ menu lets the user point at it, instead of typing an id or making the agent spend a turn searching.

A Whole Document

Declared on the chat's `reference` prop. The `@` menu finds rows with your own search.

One Field On Screen

Called from the component that draws the field. It hands over the value it already holds, with no round trip.

Whole documents in the @ menu

Which documents a user may point at is the app's answer, not the framework's, so each source brings its own search:

Each source is a `ReferenceSource`, an object of five fields:

- refName (string): Your own model name, the vocabulary your published tools already speak.

- label (string): What this group of rows is called in the `@` menu, so pass it through `l()`.

- type (AgentFieldType): The model class that masks the value before it leaves the browser.

- search ((query, signal) => Promise<ReferenceCandidate[]>): Your query for the menu rows, whose `signal` aborts when the user keeps typing.

- resolve ((refId) => Promise<unknown>): Loads the document, once, when the user picks a row.

**`type` decides what leaves the browser.** It uses `st.expose`'s vocabulary: the value is masked by the model class you name, so its `hidden`, `secret` and `visual` fields never travel.

**Name the class that carries the field.** A `Light` class usually does not, and a reference masked by one arrives without the field that was the reason for pointing.

**`search` needs a query the browser may call.** Here it is a slice wrapping a `q.search()` filter, which belongs only on data that is safe to enumerate.

**Mount this chat from a client component.** `reference` holds functions, which a server layout cannot pass, so the chat lives in a small component under `ui/`.

One field with useAgentReference

The component that draws a field already holds its value. It is also the only thing that knows a rich-text field stored as `field(Any)` reads as a paragraph, not as an editor document:

**It needs a session above it,** so render the button inside an `Agent.Zone` or an `AgentProvider`. A root `Agent.Chat` beside `children` does not share its session, and outside a zone the call only logs a warning.

**`path` names the field.** It is a dotted path into the document, so two fields of one document are two separate references.

In the composer

**Pointers read as names.** Where sources are declared, a Lexical editor loaded as its own chunk shows each pointer as the name it points at, not as the raw `@[label](mention:…)` token.

**`mentions={false}` keeps the plain textarea.** Use it when you override the composer or want to see the tokens you send; the draft string is identical either way.

**The token carries the reference.** Deleting it drops the reference just as removing the chip does, and a token pasted from an earlier message travels as a pointer with no value.

**A reference is a snapshot, capped at 20,000 characters.** Past that, the JSON is clipped mid-structure and a note tells the model so. Unlike a tool result, which answers one turn, it rides every turn after its message and is the last thing compaction folds.

The Queue And The Slash Menu

A turn takes seconds, and a user who thinks of the next thing should not have to wait to type it. Enter during a turn parks the message and sends it the moment the turn ends.

**One slot.** A second send joins the first on a new line, so the model receives one user message, not two.

**It is shown, not held silently.** The `AgentQueued` card above the composer offers take-back and drop, since a send that left the composer but is not in the transcript would read as lost.

**Stop means stop.** Stop hands the parked message back to the composer instead of opening the next turn with it.

Slash commands

The / menu lists these six commands and nothing else:

Command

- /new, /clear: Starts a new conversation, even mid-turn or over an open question card.

- /retry: Resends the last user message and leaves everything above it in place.

- /compact: Summarizes the whole conversation now, keeping nothing verbatim.

- /copy: Copies the transcript as markdown with the page URL and time; local notes are left out.

- /help: Lists the commands as a local note that is never sent to the model.

- /tools: Lists the tools and readable keys this screen published; a zone chat lists its zone only.

**An app cannot add a / command.** A product's own reusable request is a `page().prompt()`, which MCP clients list and the in-page chat does not.

**Anything else is a message.** A `/word` that is not one of the six is sent to the model as ordinary text.

**Commands run mid-turn.** They work while a turn is in flight or a question card is open; `/retry` and `/compact` answer that the agent is busy.

Keys in the composer

Key

- Enter: Sends, parks the message during a turn, or picks the row when a menu is open.

- Shift+Enter: Adds a new line.

- ↑ / ↓: Walks what was sent from the first or last line, or moves the selection in an open menu.

- Tab: Completes the selected / command, or picks the selected @ row.

- Esc: Hides an open menu; otherwise closes the panel.

- ⌘L / Ctrl+L: Opens the chat and focuses the composer, unless `shortcut={false}`.

Session calls behind the menu

Call

- session.note(text): Writes a local note: shown in the transcript, never sent to the model.

- session.report(error): Records a host-side failure, such as a command that threw, as an error in the transcript.

- session.retry(): Resends only the last user message and keeps everything above it.

**Why a note and not a plain message.** The transcript is the model's history, so `/help` text appended plainly would come back next turn as something the assistant believes it said.

**Reaching the session.** `Agent.Zone`'s `onSession` hands it over, `useAgent()` reads it inside a zone, and a composer override receives it as the `session` prop.

**With `persist`, recall survives a reload.** The ↑/↓ list is seeded from the restored transcript, and the half-written draft you walked away from comes back at the end of the walk.

Keeping The Transcript

The relay keeps no session, so the conversation lives in one browser tab and nowhere else. `persist` keeps it across reloads, and `Agent.History` keeps it on your server.

Write

How it is kept

- persist — `sessionStorage`, which survives a refresh but dies with the tab, so no shared PC keeps it.

- persist={{ storage: "local" }} — `localStorage`, for a conversation that should outlive the tab.

- persist={{ key: "…" }} — Your own storage key; the default is `akan.agent.<appName>`, plus the zone path in a zone.

- <Agent.History /> — Your own server, through three functions you write.

On your server: Agent.History

A server store is a `SessionHistory` of three functions. A function cannot cross the RSC boundary as a prop, so passing it would make every ancestor up to the session's owner a client component. Instead it mounts as a leaf component inside the zone it keeps, the way `Agent.Guide` does:

**It needs an enclosing session.** Put `Agent.History` inside an `Agent.Zone` or `AgentProvider`; outside one it throws while rendering.

**Session options go on the zone.** Inside an `Agent.Zone` the chat binds to the zone's session, so `persist`, `builtins` and `instructions` set on that `Agent.Chat` are ignored.

**`onCompact` follows compaction.** It is called after a compaction replaced messages with one summary, which is where a host with its own server-side summary moves its watermark.

What each store keeps

Rule

- Every store

  - Restores into an untouched chat only: Mounted with the zone, it restores; mounted later, it only saves from then on.

  - Saves after every change: Debounced and one save at a time; a failed save is silent.

- Web storage only

  - Keeps the newest 50 messages

  - Drops file bytes and reference values: A file keeps its name, type, url and ref; a reference keeps its pointer and a note to read it again.

Applies

Does not apply

Web storage holds a few megabytes and one screenshot fills much of it. A failed save is silent, so storing file bytes would quietly stop saving the transcript. `Agent.History` receives the messages as they are, content included.

Read next

What the chat can do on these screens is a separate subject: a component declares one action with `st.tool` and makes one store key readable by reading it, and nothing is derived from a store class.

In-Page Agent

The agent's surface: st.tool actions, readable keys, zones and LLM adaptors.

Agent UI Reference

Every prop of Agent.Chat, Agent.Zone, Agent.History and the rest.

## Code Examples

### apps/koyo/page/(shop)/_layout.tsx

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
        title={l("koyo.assistant")}
        instructions="This is a Korean-style yogurt ice cream shop. An order moves draft -> paid -> served."
        intro={<p className="py-6 text-center text-foreground/50 text-sm">{l("koyo.assistantIntro")}</p>}
        persist
      />
    </>
  );
});
```

### apps/koyo/ui/KoyoTurn.tsx

```ts
"use client";
import { usePage } from "@apps/koyo/client";
import { DefaultSteps, type StepsProps } from "akanjs/ui";

export const KoyoTurn = ({ messages, isRunning, progress, results }: StepsProps) => {
  const { l } = usePage();
  const answer = messages.at(-1);
  const steps = isRunning ? messages : messages.slice(0, -1);
  return (
    <div className="flex flex-col gap-1">
      <details open={isRunning}>
        <summary className="cursor-pointer text-foreground/50 text-xs">
          {isRunning ? l("koyo.turnWorking") : l("koyo.turnSteps", { count: steps.length })}
        </summary>
        <DefaultSteps isRunning={isRunning} messages={steps} progress={progress} results={results} />
      </details>
      {isRunning || !answer ? null : <DefaultSteps isRunning={false} messages={[answer]} results={results} />}
    </div>
  );
};
```

### apps/koyo/page/(shop)/_overrides.tsx

```ts
import { KoyoBubble, KoyoTurn } from "@apps/koyo/ui";
import { override } from "akanjs/ui";

export default override({ AgentBubble: KoyoBubble, AgentSteps: KoyoTurn });
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx

```ts
"use client";
import { IcecreamOrder, st, usePage } from "@apps/koyo/client";
import { ID } from "akanjs/base";
import { Button } from "akanjs/ui";

interface DeliveryProps {
  className?: string;
  icecreamOrderId: string;
}

export const Delivery = ({ className, icecreamOrderId }: DeliveryProps) => {
  const { l } = usePage();
  const address = st.use.deliveryAddress();
  st.tool("collectDeliveryAddress")
    .desc("Ask the customer for the address this order goes to. Never write an address the customer did not give.")
    .arg("icecreamOrderId", ID)
    .card(({ submit, cancel }, orderId) => (
      <IcecreamOrder.Template.Address
        icecreamOrderId={orderId}
        onCancel={() => cancel("the customer closed the address form")}
        onSubmit={submit}
      />
    ));
  const deliver = st.tool("deliverIcecreamOrder")
    .desc("Deliver this order to the address already on it.")
    .exec(() => st.do.deliverIcecreamOrder(icecreamOrderId));
  return (
    <div className={className}>
      <Button disabled={!address} onClick={deliver}>
        {l("icecreamOrder.deliverIcecreamOrder")}
      </Button>
    </div>
  );
};
```

### apps/koyo/ui/KoyoAgentChat.tsx

```ts
"use client";
import { cnst, fetch, usePage } from "@apps/koyo/client";
import { Agent } from "akanjs/ui";

export const KoyoAgentChat = () => {
  const { l } = usePage();
  return (
    <Agent.Chat
      persist
      reference={[
        {
          refName: "icecreamOrder",
          label: l("icecreamOrder.modelName"),
          type: cnst.IcecreamOrder,
          search: async (query, signal) => {
            const orders = await fetch.icecreamOrderListInMention(query, 0, 8, "relevance");
            if (signal.aborted) return [];
            return orders.map((order) => ({ refId: order.id, label: order.code, description: order.status }));
          },
          resolve: (refId) => fetch.icecreamOrder(refId),
        },
      ]}
    />
  );
};
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Util.tsx

```ts
"use client";
import { usePage } from "@apps/koyo/client";
import { Button, useAgentReference } from "akanjs/ui";

interface ReferMemoProps {
  className?: string;
  icecreamOrderId: string;
  code: string;
  memo: string;
}

export const ReferMemo = ({ className, icecreamOrderId, code, memo }: ReferMemoProps) => {
  const { l } = usePage();
  const refer = useAgentReference();
  return (
    <Button
      className={className}
      onClick={() =>
        refer({
          refName: "icecreamOrder",
          refId: icecreamOrderId,
          label: code,
          path: "memo",
          type: String,
          value: memo,
        })
      }
      size="xs"
      variant="ghost"
    >
      {l("icecreamOrder.referMemo")}
    </Button>
  );
};
```

### apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx

```ts
"use client";
import { fetch } from "@apps/koyo/client";
import { Agent } from "akanjs/ui";
import type { ReactNode } from "react";

interface DeskProps {
  className?: string;
  children: ReactNode;
}

export const Desk = ({ className, children }: DeskProps) => {
  return (
    <Agent.Zone className={className} id="orderDesk" instructions="Work the order desk." label="Order desk">
      <Agent.History
        clear={() => void fetch.clearIcecreamOrderChat()}
        load={async () => (await fetch.loadIcecreamOrderChat()).messages}
        save={(messages) => void fetch.saveIcecreamOrderChat(messages)}
      />
      {children}
      <Agent.Chat chrome={false} inline />
    </Agent.Zone>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

