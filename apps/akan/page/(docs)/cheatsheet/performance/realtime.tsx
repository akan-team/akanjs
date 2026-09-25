import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Realtime", ko: "실시간" })}>
        <Docs.Title>{l.trans({ en: "Realtime", ko: "실시간" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Realtime features keep a WebSocket connection open so the app can send small events quickly. Use it for chat, games, live editors, dashboards, and presence.",
              ko: "실시간 기능은 WebSocket 연결을 유지해 작은 이벤트를 빠르게 주고받게 합니다. 채팅, 게임, 라이브 에디터, 대시보드, 접속 상태에 사용하세요.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`message` is a client-to-server event.",
                ko: "`message`는 client에서 server로 보내는 이벤트입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`pubsub` is a server-to-room broadcast.",
                ko: "`pubsub`은 server에서 room으로 보내는 broadcast입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`room` decides who should receive the event.",
                ko: "`room`은 누가 이벤트를 받을지 정합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="message" title={l.trans({ en: "Use message", ko: "message 사용" })}>
        <Docs.Title>{l.trans({ en: "Use message", ko: "message 사용" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `message` for small actions from the browser to the server: read receipt, cursor move, typing status, or game input.",
              ko: "브라우저에서 서버로 보내는 작은 동작에는 `message`를 사용하세요. 읽음 처리, 커서 이동, 입력 중 표시, 게임 입력이 좋은 예입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Read receipt", ko: "읽음 처리" })}
          code={`export class ChatEndpoint extends endpoint(srv.chat, ({ message }) => ({
  readMessage: message(Boolean, { guards: [User] })
    .msg("chatId", ID)
    .msg("messageId", ID)
    .exec(async function (chatId, messageId) {
      await this.chatService.markAsRead(chatId, messageId);
      return true;
    }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="pubsub" title={l.trans({ en: "Use pubsub", ko: "pubsub 사용" })}>
        <Docs.Title>{l.trans({ en: "Use pubsub", ko: "pubsub 사용" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `pubsub` when the server needs to send one event to everyone in a room. A new chat message is the simplest example.",
              ko: "서버가 room 안의 모든 사람에게 이벤트 하나를 보내야 한다면 `pubsub`을 사용합니다. 새 채팅 메시지가 가장 쉬운 예입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Chat broadcast", ko: "채팅 broadcast" })}
          code={`export class ChatEndpoint extends endpoint(srv.chat, ({ pubsub }) => ({
  messageAdded: pubsub(cnst.ChatMessage)
    .room("chatId", ID)
    .with(Ws)
    .exec(async (chatId, ws) => {
      // The room key decides which connected users receive this event.
    }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="flow" title={l.trans({ en: "Chat Flow", ko: "채팅 흐름" })}>
        <Docs.Title>{l.trans({ en: "Chat Flow", ko: "채팅 흐름" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "For data that must be saved, write to the database first and publish after the service succeeds.",
              ko: "저장되어야 하는 데이터라면 먼저 데이터베이스에 기록하고, service가 성공한 뒤 publish하세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Save then publish", ko: "저장 후 publish" })}
          code={`async addMessage(chatId: string, content: string, senderId: string) {
  const message = await this.chatModel.createMessage({
    chat: chatId,
    sender: senderId,
    content,
  });
  await this.chatSignal.messageAdded(chatId, message);
  return message;
}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "On the client, subscribe to the room and update local UI state when a new message arrives. Keep the subscription close to the screen that owns the list.",
              ko: "클라이언트에서는 room을 구독하고 새 message가 도착하면 로컬 UI 상태를 갱신합니다. 구독 코드는 목록을 소유한 화면 가까이에 두세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Client subscription", ko: "클라이언트 구독" })}
          code={`"use client";

export const ChatMessages = ({ chatId }: { chatId: string }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const unsubscribe = fetch.subscribeMessageAdded(chatId, (message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => unsubscribe();
  }, [chatId]);

  return <Chat.MessageList messages={messages} />;
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="room" title={l.trans({ en: "Design Rooms", ko: "Room 설계" })}>
        <Docs.Title>{l.trans({ en: "Design Rooms", ko: "Room 설계" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Use a narrow room key such as `chatId`, `gameId`, or `documentId`.",
                ko: "`chatId`, `gameId`, `documentId`처럼 좁은 room key를 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Avoid one huge room for all users unless everyone truly needs the event.",
                ko: "모든 사용자가 정말 필요한 이벤트가 아니라면 거대한 공용 room을 피하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use guards so only allowed users can send or subscribe.",
                ko: "허용된 사용자만 보내거나 구독할 수 있도록 guard를 사용하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Keep payloads small. Send ids and small patches instead of full pages.",
                ko: "Payload는 작게 유지하세요. 전체 page보다 id와 작은 변경분을 보내세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use `message` for commands and `pubsub` for notifications.",
                ko: "명령에는 `message`, 알림에는 `pubsub`을 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "If losing the event is dangerous, save it first and publish after saving.",
                ko: "이벤트 유실이 위험하다면 먼저 저장하고 저장 후 publish하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "For games or cursors, throttle very frequent events on the client.",
                ko: "게임이나 커서는 너무 잦은 이벤트를 client에서 throttle하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
