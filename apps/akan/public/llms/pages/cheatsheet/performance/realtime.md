# Realtime

- Source: /cheatsheet/performance/realtime
- Mirror: /llms/pages/cheatsheet/performance/realtime.md
- Section: cheatsheet
- Category: Performance
- Priority: P2

## Headings

- Realtime (#overview)
- Use message (#message)
- Use pubsub (#pubsub)
- Chat Flow (#flow)
- Design Rooms (#room)
- Tips (#tips)

## Content

Realtime

Realtime features keep a WebSocket connection open so the app can send small events quickly. Use it for chat, games, live editors, dashboards, and presence.

`message` is a client-to-server event.

`pubsub` is a server-to-room broadcast.

`room` decides who should receive the event.

Use message

Use `message` for small actions from the browser to the server: read receipt, cursor move, typing status, or game input.

Read receipt

Use pubsub

Use `pubsub` when the server needs to send one event to everyone in a room. A new chat message is the simplest example.

Chat broadcast

Chat Flow

For data that must be saved, write to the database first and publish after the service succeeds.

Save then publish

On the client, subscribe to the room and update local UI state when a new message arrives. Keep the subscription close to the screen that owns the list.

Client subscription

Design Rooms

Use a narrow room key such as `chatId`, `gameId`, or `documentId`.

Avoid one huge room for all users unless everyone truly needs the event.

Use guards so only allowed users can send or subscribe.

Tips

Keep payloads small. Send ids and small patches instead of full pages.

Use `message` for commands and `pubsub` for notifications.

If losing the event is dangerous, save it first and publish after saving.

For games or cursors, throttle very frequent events on the client.

## Code Examples

### Code

```ts
export class ChatEndpoint extends endpoint(srv.chat, ({ message }) => ({
  readMessage: message(Boolean, { guards: [User] })
    .msg("chatId", ID)
    .msg("messageId", ID)
    .exec(async function (chatId, messageId) {
      await this.chatService.markAsRead(chatId, messageId);
      return true;
    }),
})) {}
```

### Code

```ts
export class ChatEndpoint extends endpoint(srv.chat, ({ pubsub }) => ({
  messageAdded: pubsub(cnst.ChatMessage)
    .room("chatId", ID)
    .with(Ws)
    .exec(async (chatId, ws) => {
      // The room key decides which connected users receive this event.
    }),
})) {}
```

### Code

```ts
async addMessage(chatId: string, content: string, senderId: string) {
  const message = await this.chatModel.createMessage({
    chat: chatId,
    sender: senderId,
    content,
  });
  await this.chatSignal.messageAdded(chatId, message);
  return message;
}
```

### Code

```ts
"use client";

export const ChatMessages = ({ chatId }: { chatId: string }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const unsubscribe = fetch.subscribeMessageAdded(chatId, (message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => unsubscribe();
  }, [chatId]);

  return <Chat.MessageList messages={messages} />;
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

