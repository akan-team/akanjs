# Realtime

- Source: /cheatsheet/performance/realtime
- Mirror: /llms/pages/cheatsheet/performance/realtime.md
- Section: cheatsheet
- Category: Performance
- Priority: P2

## Headings

- Realtime (#overview)
- Send With message (#message)
- Broadcast With pubsub (#pubsub)
- Chat Flow (#flow)
- Design Rooms (#room)
- Tips (#tips)

## Content

Realtime

Realtime keeps one WebSocket open, so the server and the browser trade small events without a new request each time. Chat, games, live editors, dashboards and presence all run on it.

Tool

Direction

Use it for

- message — Browser → server — e.g. read receipts, cursor moves, typing status, game input

- pubsub — Server → everyone subscribed to the room — e.g. a new chat message, a notification

- .live() — Database → every screen showing the list — e.g. a list of saved rows, such as a chat history

**A room decides who receives.** A `pubsub` event reaches only the browsers subscribed to that room.

**A saved list needs no pubsub.** With `.live()` on its slice, saving the row is enough.

Send With message

Use `message` for small actions the browser sends to the server: a read receipt, a cursor move, typing status, or game input. A read receipt declares its arguments with `.msg()`:

**Each `.msg()` is one argument.** The browser calls `fetch.readMessage(chatId, messageId)` in the same order.

**The reader comes from `.with(Self)`.** Never trust a user id the browser sends.

**The answer goes to the sender only.** The return value arrives at `fetch.listenReadMessage(fn)` in the browser that sent it.

**Name the guards yourself.** A `message` is checked only by the `guards` in its own option; here `User` requires a signed-in user.

Broadcast With pubsub

Use `pubsub` when the server sends one event to everyone in a room. A new chat message is the simplest example. The signal names the room and what each subscription sets up:

**`.room()` names the room.** The room is this endpoint plus the `chatId`, so every chat is a room of its own.

**`exec` runs when a browser subscribes.** It sends nothing; publishing is the service's job, shown in Chat Flow below.

**Register cleanup for both events.** `unsubscribe` fires when the browser leaves the room and `disconnect` when the socket closes; a handler on both runs only once.

**`ws.socketId` is a connection, not a user.** A reconnect gets a new id, so keep per-user state on the account.

**A pubsub has no guard unless it declares one.** The slice's guard map reaches only the generated query and mutation endpoints, so a room without its own `guards` array is open to anyone who can open a socket.

Calling From the Browser

Each `message` and `pubsub` becomes a `fetch` function in the browser:

Call

What it does

- fetch.readMessage(chatId, messageId): Sends the message and returns nothing.

- fetch.listenReadMessage(fn): Runs `fn` with each answer this browser gets and returns a function that stops listening.

- fetch.subscribeMessageAdded(chatId, fn): Joins the chat's room, runs `fn` on every publish, and returns an unsubscribe function.

Subscribe inside a `useEffect` and return the unsubscribe function as its cleanup.

Chat Flow

A chat message reaches the screen in four steps. The list itself never needs a hand-written subscription.

1. Save, Then Publish

For data that must be saved, write to the database first and publish after the service succeeds:

**Room arguments first, payload last.** `messageAdded(chatId, chatMessage)` publishes to that chat's room.

**A failed save publishes nothing.** If `createChatMessage` throws, no browser sees a message that was never stored.

**The signal is injected by field name.** A field named `chatSignal` resolves to the `chat` module's signal.

2. Declare a Live Slice

Declare `.live()` on the slice that feeds the list:

**Saving is enough for the list.** Every document create, update and remove reaches each open list, so `messageAdded` is only for other listeners.

**Query-level writes are not seen.** `update<Filter>`, `remove<Filter>`, `updateById` and `removeById` fire no hooks, so they never reach a live list.

**The room uses the slice's guards.** A live room delivers the same rows the list would, so name the guards on `init()`.

3. Load the Snapshot in the Route

The browser does not fetch the first list itself. The route loads the slice before the first byte and hands the snapshot down as an `init` prop, so the first paint is server HTML:

4. Draw It With Load.Units

`Load.Units` seeds the store from that snapshot, and the live slice keeps the list in sync from there:

**The room opens by itself.** `Load.Units` subscribes to the live slice, so the list needs no effect.

**Nothing in the Zone fetches.** No `useState` holds server data.

Design Rooms

The room key decides who receives an event, so keep it as narrow as the audience.

**Use a narrow key** such as `chatId`, `gameId`, or `documentId`.

**Avoid one huge room for all users** unless everyone truly needs the event.

**Guard who may send and subscribe.** `User` only checks sign-in; to keep a room to its members, write a guard that reads `chatId` with `context.getArg("chatId")`.

**Guards run again when the login changes.** Each subscribed room is re-checked and dropped if it now fails, so keep guards free of side effects.

Tips

**Keep payloads small.** Send ids and small patches instead of whole pages of data.

**Commands up, notifications down.** Use `message` for commands and `pubsub` for notifications.

**Save first when losing the event is dangerous.** Publish only after the save succeeds.

**Throttle very frequent events on the client.** Game input and cursor moves are the usual cases.

**Stream bytes as `pubsub(Binary)`.** It skips JSON, and a subscriber that falls behind gets only the newest frame unless you declare `{ backpressure: "queue" }`.

## Code Examples

### apps/myapp/lib/chat/chat.signal.ts

```ts
import { Self, User } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint } from "akanjs/signal";

import * as srv from "../srv";

export class ChatEndpoint extends endpoint(srv.chat, ({ message }) => ({
  readMessage: message(Boolean, { guards: [User] })
    .msg("chatId", ID)
    .msg("messageId", ID)
    .with(Self)
    .exec(async function (chatId, messageId, self) {
      await this.chatService.markAsRead(chatId, messageId, self.id);
      return true;
    }),
})) {}
```

### apps/myapp/lib/chat/chat.signal.ts

```ts
import { User } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, Ws } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class ChatEndpoint extends endpoint(srv.chat, ({ pubsub }) => ({
  messageAdded: pubsub(cnst.ChatMessage, { guards: [User] })
    .room("chatId", ID)
    .with(Ws)
    .exec(async function (chatId, ws) {
      const markAway = () => this.chatService.markAway(chatId, ws.socketId);
      ws.on("unsubscribe", markAway);
      ws.on("disconnect", markAway);
    }),
})) {}
```

### apps/myapp/lib/chat/chat.service.ts

```ts
import { serve } from "akanjs/service";

import * as db from "../db";
import type * as sig from "../sig";
import type * as srv from "../srv";

export class ChatService extends serve(db.chat, ({ service, signal }) => ({
  chatMessageService: service<srv.ChatMessageService>(),
  chatSignal: signal<sig.Chat>(),
})) {
  async addMessage(chatId: string, content: string, senderId: string) {
    const chatMessage = await this.chatMessageService.createChatMessage({
      chat: chatId,
      sender: senderId,
      content,
    });
    await this.chatSignal.messageAdded(chatId, chatMessage);
    return chatMessage;
  }
}
```

### apps/myapp/lib/chatMessage/chatMessage.signal.ts

```ts
import { Admin, User } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { slice } from "akanjs/signal";

import * as srv from "../srv";

export class ChatMessageSlice extends slice(
  srv.chatMessage,
  { guards: { root: Admin, get: User, cru: User } },
  (init) => ({
    inChat: init({ guards: [User] })
      .param("chatId", ID)
      .live()
      .exec(function (chatId) {
        return this.chatMessageService.queryInChat(chatId);
      }),
  }),
) {}
```

### apps/myapp/page/chat/[chatId]/_index.tsx

```ts
import { ChatMessage, fetch } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("chatId", ID)
  .render(async ({ chatId }) => {
    const [{ chatMessageInitInChat }] = await Promise.all([
      fetch.initChatMessageInChat(chatId),
    ]);
    return <ChatMessage.Zone.List init={chatMessageInitInChat} />;
  });
```

### apps/myapp/lib/chatMessage/ChatMessage.Zone.tsx

```ts
"use client";
import { ChatMessage, type cnst } from "@apps/myapp/client";
import type { ClientInit } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface ListProps {
  className?: string;
  init: ClientInit<"chatMessage", cnst.LightChatMessage>;
}
export const List = ({ className, init }: ListProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(chatMessage) => (
        <ChatMessage.Unit.Row key={chatMessage.id} chatMessage={chatMessage} />
      )}
    />
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

