import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";

  const toolColumns = [
    { key: "tool", label: l.trans({ en: "Tool", ko: "도구" }), code: true },
    { key: "direction", label: l.trans({ en: "Direction", ko: "방향" }) },
    { key: "use", label: l.trans({ en: "Use it for", ko: "이럴 때" }) },
  ];
  const toolRows = [
    {
      tool: "message",
      direction: l.trans({ en: "Browser → server", ko: "브라우저 → 서버" }),
      use: l.trans({
        en: "e.g. read receipts, cursor moves, typing status, game input",
        ko: "예: 읽음 처리, 커서 이동, 입력 중 표시, 게임 입력",
      }),
    },
    {
      tool: "pubsub",
      direction: l.trans({
        en: "Server → everyone subscribed to the room",
        ko: "서버 → room을 구독한 모든 브라우저",
      }),
      use: l.trans({ en: "e.g. a new chat message, a notification", ko: "예: 새 채팅 메시지, 알림" }),
    },
    {
      tool: ".live()",
      direction: l.trans({
        en: "Database → every screen showing the list",
        ko: "데이터베이스 → 그 목록을 띄운 모든 화면",
      }),
      use: l.trans({
        en: "e.g. a list of saved rows, such as a chat history",
        ko: "예: 채팅 내역처럼 저장된 행의 목록",
      }),
    },
  ];

  const messageNotes = [
    l.trans({
      en: (
        <span>
          <strong>
            Each <code>.msg()</code> is one argument.
          </strong>{" "}
          The browser calls <code>fetch.readMessage(chatId, messageId)</code> in the same order.
        </span>
      ),
      ko: (
        <span>
          <strong>
            <code>.msg()</code> 하나가 인자 하나입니다.
          </strong>{" "}
          브라우저는 같은 순서로 <code>fetch.readMessage(chatId, messageId)</code>를 호출합니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>
            The reader comes from <code>.with(Self)</code>.
          </strong>{" "}
          Never trust a user id the browser sends.
        </span>
      ),
      ko: (
        <span>
          <strong>
            읽은 사람은 <code>.with(Self)</code>로 받습니다.
          </strong>{" "}
          브라우저가 보낸 사용자 id는 믿지 않습니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>The answer goes to the sender only.</strong> The return value arrives at{" "}
          <code>fetch.listenReadMessage(fn)</code> in the browser that sent it.
        </span>
      ),
      ko: (
        <span>
          <strong>응답은 보낸 쪽에만 갑니다.</strong> 반환값은 보낸 브라우저의 <code>fetch.listenReadMessage(fn)</code>
          으로 도착합니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>Name the guards yourself.</strong> A <code>message</code> is checked only by the <code>guards</code>{" "}
          in its own option; here <code>User</code> requires a signed-in user.
        </span>
      ),
      ko: (
        <span>
          <strong>가드는 직접 적습니다.</strong> <code>message</code>는 자기 옵션의 <code>guards</code>로만 검사합니다.
          여기서는 <code>User</code>가 로그인한 사용자만 통과시킵니다.
        </span>
      ),
    }),
  ];

  const pubsubNotes = [
    l.trans({
      en: (
        <span>
          <strong>
            <code>.room()</code> names the room.
          </strong>{" "}
          The room is this endpoint plus the <code>chatId</code>, so every chat is a room of its own.
        </span>
      ),
      ko: (
        <span>
          <strong>
            <code>.room()</code>이 room을 정합니다.
          </strong>{" "}
          room은 이 endpoint와 <code>chatId</code>의 조합이므로, 채팅마다 room이 따로 생깁니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>
            <code>exec</code> runs when a browser subscribes.
          </strong>{" "}
          It sends nothing; publishing is the service's job, shown in Chat Flow below.
        </span>
      ),
      ko: (
        <span>
          <strong>
            <code>exec</code>는 브라우저가 구독할 때 실행됩니다.
          </strong>{" "}
          여기서는 아무것도 보내지 않고, publish는 아래 채팅 흐름처럼 service가 맡습니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>Register cleanup for both events.</strong> <code>unsubscribe</code> fires when the browser leaves the
          room and <code>disconnect</code> when the socket closes; a handler on both runs only once.
        </span>
      ),
      ko: (
        <span>
          <strong>정리 작업은 두 이벤트에 모두 등록합니다.</strong> <code>unsubscribe</code>는 브라우저가 room을 떠날
          때, <code>disconnect</code>는 소켓이 끊길 때 실행되며, 두 이벤트에 함께 등록한 핸들러는 한 번만 실행됩니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>
            <code>ws.socketId</code> is a connection, not a user.
          </strong>{" "}
          A reconnect gets a new id, so keep per-user state on the account.
        </span>
      ),
      ko: (
        <span>
          <strong>
            <code>ws.socketId</code>는 사용자가 아니라 연결입니다.
          </strong>{" "}
          다시 연결하면 id가 바뀌므로, 사용자별 상태는 계정 기준으로 둡니다.
        </span>
      ),
    }),
  ];

  const callItems = [
    {
      name: "fetch.readMessage(chatId, messageId)",
      desc: l.trans({
        en: "Sends the message and returns nothing.",
        ko: "message를 보내고, 아무것도 돌려주지 않습니다.",
      }),
    },
    {
      name: "fetch.listenReadMessage(fn)",
      desc: l.trans({
        en: "Runs `fn` with each answer this browser gets and returns a function that stops listening.",
        ko: "이 브라우저가 받는 응답마다 `fn`을 실행하고, 듣기를 멈추는 함수를 돌려줍니다.",
      }),
    },
    {
      name: (
        <span>
          fetch.subscribeMessageAdded(
          <wbr />
          chatId, fn)
        </span>
      ),
      desc: l.trans({
        en: "Joins the chat's room, runs `fn` on every publish, and returns an unsubscribe function.",
        ko: "그 채팅의 room에 들어가 publish마다 `fn`을 실행하고, 구독을 끊는 함수를 돌려줍니다.",
      }),
    },
  ];

  const saveNotes = [
    l.trans({
      en: (
        <span>
          <strong>Room arguments first, payload last.</strong> <code>messageAdded(chatId, chatMessage)</code> publishes
          to that chat's room.
        </span>
      ),
      ko: (
        <span>
          <strong>room 인자가 먼저, 보낼 값이 마지막입니다.</strong> <code>messageAdded(chatId, chatMessage)</code>는 그
          채팅의 room으로 publish합니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>A failed save publishes nothing.</strong> If <code>createChatMessage</code> throws, no browser sees a
          message that was never stored.
        </span>
      ),
      ko: (
        <span>
          <strong>저장이 실패하면 아무것도 보내지 않습니다.</strong> <code>createChatMessage</code>가 실패하면
          publish까지 가지 않으므로, 저장되지 않은 메시지를 받는 브라우저도 없습니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>The signal is injected by field name.</strong> A field named <code>chatSignal</code> resolves to the{" "}
          <code>chat</code> module's signal.
        </span>
      ),
      ko: (
        <span>
          <strong>signal은 필드 이름으로 주입됩니다.</strong> <code>chatSignal</code>이라는 필드는 <code>chat</code>{" "}
          모듈의 signal로 연결됩니다.
        </span>
      ),
    }),
  ];

  const liveNotes = [
    l.trans({
      en: (
        <span>
          <strong>Saving is enough for the list.</strong> Every document create, update and remove reaches each open
          list, so <code>messageAdded</code> is only for other listeners.
        </span>
      ),
      ko: (
        <span>
          <strong>목록은 저장만으로 갱신됩니다.</strong> 문서 단위의 생성·수정·삭제는 열린 목록마다 전달되므로,{" "}
          <code>messageAdded</code>는 목록이 아닌 다른 곳에서 들을 때만 필요합니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>Query-level writes are not seen.</strong> <code>{"update<Filter>"}</code>,{" "}
          <code>{"remove<Filter>"}</code>, <code>updateById</code> and <code>removeById</code> fire no hooks, so they
          never reach a live list.
        </span>
      ),
      ko: (
        <span>
          <strong>쿼리 단위 쓰기는 전달되지 않습니다.</strong> <code>{"update<Filter>"}</code>,{" "}
          <code>{"remove<Filter>"}</code>, <code>updateById</code>, <code>removeById</code>는 훅을 실행하지 않아 live
          목록에 닿지 않습니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>The room uses the slice's guards.</strong> A live room delivers the same rows the list would, so name
          the guards on <code>init()</code>.
        </span>
      ),
      ko: (
        <span>
          <strong>room도 slice의 가드를 씁니다.</strong> live room은 목록과 같은 행을 보내므로, 가드를{" "}
          <code>init()</code>에 적습니다.
        </span>
      ),
    }),
  ];

  const zoneNotes = [
    l.trans({
      en: (
        <span>
          <strong>The room opens by itself.</strong> <code>Load.Units</code> subscribes to the live slice, so the list
          needs no effect.
        </span>
      ),
      ko: (
        <span>
          <strong>room은 알아서 열립니다.</strong> <code>Load.Units</code>가 live slice를 구독하므로 목록에는 effect가
          필요 없습니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>Nothing in the Zone fetches.</strong> No <code>useState</code> holds server data.
        </span>
      ),
      ko: (
        <span>
          <strong>Zone은 아무것도 fetch하지 않습니다.</strong> 서버 데이터를 <code>useState</code>에 담지도 않습니다.
        </span>
      ),
    }),
  ];

  const roomRules = [
    l.trans({
      en: (
        <span>
          <strong>Use a narrow key</strong> such as <code>chatId</code>, <code>gameId</code>, or <code>documentId</code>
          .
        </span>
      ),
      ko: (
        <span>
          <strong>좁은 key를 씁니다.</strong> <code>chatId</code>, <code>gameId</code>, <code>documentId</code>가 좋은
          예입니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>Avoid one huge room for all users</strong> unless everyone truly needs the event.
        </span>
      ),
      ko: (
        <span>
          <strong>모든 사용자가 함께 쓰는 거대한 room은 피합니다.</strong> 정말 모두가 받아야 하는 이벤트일 때만 씁니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>Guard who may send and subscribe.</strong> <code>User</code> only checks sign-in; to keep a room to
          its members, write a guard that reads <code>chatId</code> with <code>context.getArg("chatId")</code>.
        </span>
      ),
      ko: (
        <span>
          <strong>보내고 구독할 수 있는 사람을 가드로 제한합니다.</strong> <code>User</code>는 로그인만 확인하므로, 채팅
          멤버만 들이려면 <code>context.getArg("chatId")</code>로 <code>chatId</code>를 읽는 가드를 직접 만듭니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>Guards run again when the login changes.</strong> Each subscribed room is re-checked and dropped if it
          now fails, so keep guards free of side effects.
        </span>
      ),
      ko: (
        <span>
          <strong>로그인 상태가 바뀌면 가드가 다시 실행됩니다.</strong> 구독 중인 room을 다시 검사해 통과하지 못하면
          끊으므로, 가드에는 부수 효과를 두지 않습니다.
        </span>
      ),
    }),
  ];

  const tips = [
    l.trans({
      en: (
        <span>
          <strong>Keep payloads small.</strong> Send ids and small patches instead of whole pages of data.
        </span>
      ),
      ko: (
        <span>
          <strong>payload는 작게 유지합니다.</strong> 화면 전체 데이터 대신 id와 작은 변경분을 보냅니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>Commands up, notifications down.</strong> Use <code>message</code> for commands and{" "}
          <code>pubsub</code> for notifications.
        </span>
      ),
      ko: (
        <span>
          <strong>명령은 올려 보내고, 알림은 내려보냅니다.</strong> 명령에는 <code>message</code>를, 알림에는{" "}
          <code>pubsub</code>을 씁니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>Save first when losing the event is dangerous.</strong> Publish only after the save succeeds.
        </span>
      ),
      ko: (
        <span>
          <strong>유실되면 곤란한 이벤트는 먼저 저장합니다.</strong> 저장이 성공한 뒤에 publish합니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>Throttle very frequent events on the client.</strong> Game input and cursor moves are the usual cases.
        </span>
      ),
      ko: (
        <span>
          <strong>너무 잦은 이벤트는 클라이언트에서 throttle합니다.</strong> 게임 입력과 커서 이동이 대표적입니다.
        </span>
      ),
    }),
    l.trans({
      en: (
        <span>
          <strong>
            Stream bytes as <code>pubsub(Binary)</code>.
          </strong>{" "}
          It skips JSON, and a subscriber that falls behind gets only the newest frame unless you declare{" "}
          <code>{'{ backpressure: "queue" }'}</code>.
        </span>
      ),
      ko: (
        <span>
          <strong>
            바이트 스트림은 <code>pubsub(Binary)</code>로 보냅니다.
          </strong>{" "}
          JSON을 거치지 않으며, <code>{'{ backpressure: "queue" }'}</code>를 선언하지 않으면 뒤처진 구독자는 가장 최근
          프레임만 받습니다.
        </span>
      ),
    }),
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Realtime", ko: "실시간" })}>
        <Docs.Title>{l.trans({ en: "Realtime", ko: "실시간" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Realtime keeps one WebSocket open, so the server and the browser trade small events without a new request each time. Chat, games, live editors, dashboards and presence all run on it.",
              ko: "실시간 기능은 WebSocket 연결 하나를 열어 두고, 요청을 새로 보내지 않고도 작은 이벤트를 주고받습니다. 채팅, 게임, 라이브 에디터, 대시보드, 접속 상태 표시가 모두 이 연결 위에서 돌아갑니다.",
            })}
          </div>
          <Docs.Table columns={toolColumns} rows={toolRows} stacked />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A room decides who receives.</strong> A <code>pubsub</code> event reaches only the browsers
                    subscribed to that room.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>room이 받는 사람을 정합니다.</strong> <code>pubsub</code> 이벤트는 그 room을 구독한
                    브라우저에만 도착합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A saved list needs no pubsub.</strong> With <code>.live()</code> on its slice, saving the
                    row is enough.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>저장된 목록에는 pubsub이 필요 없습니다.</strong> slice에 <code>.live()</code>를 선언하면
                    행을 저장하는 것만으로 충분합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="message" title={l.trans({ en: "Send With message", ko: "message로 보내기" })}>
        <Docs.Title>{l.trans({ en: "Send With message", ko: "message로 보내기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Use <code>message</code> for small actions the browser sends to the server: a read receipt, a cursor
                  move, typing status, or game input. A read receipt declares its arguments with <code>.msg()</code>:
                </span>
              ),
              ko: (
                <span>
                  브라우저가 서버로 보내는 작은 동작에는 <code>message</code>를 씁니다. 읽음 처리, 커서 이동, 입력 중
                  표시, 게임 입력이 대표적입니다. 읽음 처리는 <code>.msg()</code>로 인자를 선언합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/chat/chat.signal.ts"
          code={`import { Self, User } from "@libs/shared/srvkit";
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
})) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {messageNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="pubsub" title={l.trans({ en: "Broadcast With pubsub", ko: "pubsub으로 room에 보내기" })}>
        <Docs.Title>{l.trans({ en: "Broadcast With pubsub", ko: "pubsub으로 room에 보내기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Use <code>pubsub</code> when the server sends one event to everyone in a room. A new chat message is
                  the simplest example. The signal names the room and what each subscription sets up:
                </span>
              ),
              ko: (
                <span>
                  서버가 room 안의 모두에게 이벤트 하나를 보낼 때는 <code>pubsub</code>을 씁니다. 새 채팅 메시지가 가장
                  쉬운 예입니다. signal에는 room과, 구독마다 준비할 일을 선언합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/chat/chat.signal.ts"
          code={`import { User } from "@libs/shared/srvkit";
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
})) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {pubsubNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A pubsub has no guard unless it declares one.</strong> The slice's guard map reaches only the
                  generated query and mutation endpoints, so a room without its own <code>guards</code> array is open to
                  anyone who can open a socket.
                </span>
              ),
              ko: (
                <span>
                  <strong>pubsub은 직접 선언하지 않으면 가드가 없습니다.</strong> slice의 guard map은 생성된
                  query·mutation endpoint에만 적용되므로, <code>guards</code> 배열이 없는 room은 소켓을 열 수 있는
                  누구에게나 열려 있습니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>
            {l.trans({ en: "Calling From the Browser", ko: "브라우저에서 호출하기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Each <code>message</code> and <code>pubsub</code> becomes a <code>fetch</code> function in the
                  browser:
                </span>
              ),
              ko: (
                <span>
                  <code>message</code>와 <code>pubsub</code>은 브라우저에서 각각 <code>fetch</code> 함수가 됩니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Call", ko: "호출" })}
            descLabel={l.trans({ en: "What it does", ko: "하는 일" })}
            items={callItems}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  Subscribe inside a <code>useEffect</code> and return the unsubscribe function as its cleanup.
                </span>
              ),
              ko: (
                <span>
                  구독은 <code>useEffect</code> 안에서 하고, 받은 구독 해제 함수를 cleanup으로 돌려줍니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="flow" title={l.trans({ en: "Chat Flow", ko: "채팅 흐름" })}>
        <Docs.Title>{l.trans({ en: "Chat Flow", ko: "채팅 흐름" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A chat message reaches the screen in four steps. The list itself never needs a hand-written subscription.",
              ko: "채팅 메시지는 네 단계를 거쳐 화면에 나타납니다. 목록 자체에는 구독 코드를 직접 쓰지 않습니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "1. Save, Then Publish", ko: "1. 저장한 뒤 publish" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "For data that must be saved, write to the database first and publish after the service succeeds:",
              ko: "저장해야 하는 데이터라면 먼저 데이터베이스에 기록하고, service가 성공한 뒤에 publish합니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/chat/chat.service.ts"
          code={`import { serve } from "akanjs/service";

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
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {saveNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "2. Declare a Live Slice", ko: "2. live slice 선언" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Declare <code>.live()</code> on the slice that feeds the list:
                </span>
              ),
              ko: (
                <span>
                  목록을 채우는 slice에 <code>.live()</code>를 선언합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/chatMessage/chatMessage.signal.ts"
          code={`import { Admin, User } from "@libs/shared/srvkit";
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
) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {liveNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "3. Load the Snapshot in the Route", ko: "3. route에서 스냅샷 불러오기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  The browser does not fetch the first list itself. The route loads the slice before the first byte and
                  hands the snapshot down as an <code>init</code> prop, so the first paint is server HTML:
                </span>
              ),
              ko: (
                <span>
                  첫 목록은 브라우저가 직접 가져오지 않습니다. route가 첫 바이트를 보내기 전에 slice를 불러 스냅샷을{" "}
                  <code>init</code> prop으로 넘기므로, 첫 화면은 서버가 그린 HTML입니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/chat/[chatId]/_index.tsx"
          code={`import { ChatMessage, fetch } from "@apps/myapp/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("chatId", ID)
  .render(({ chatId }) => {
    const { chatMessageInitInChat } = fetch.initChatMessageInChat(chatId);
    return <ChatMessage.Zone.List init={chatMessageInitInChat} />;
  });`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>
            {l.trans({ en: "4. Draw It With Load.Units", ko: "4. Load.Units로 그리기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>Load.Units</code> seeds the store from that snapshot, and the live slice keeps the list in sync
                  from there:
                </span>
              ),
              ko: (
                <span>
                  <code>Load.Units</code>가 그 스냅샷으로 store를 채우고, 그 뒤로는 live slice가 목록을 최신으로
                  유지합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/chatMessage/ChatMessage.Zone.tsx"
          code={`"use client";
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
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {zoneNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="room" title={l.trans({ en: "Design Rooms", ko: "room 설계" })}>
        <Docs.Title>{l.trans({ en: "Design Rooms", ko: "room 설계" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The room key decides who receives an event, so keep it as narrow as the audience.",
              ko: "room key가 곧 이벤트를 받는 범위입니다. 받을 사람의 범위만큼만 좁게 잡습니다.",
            })}
          </div>
          <ul className={bulletList}>
            {roomRules.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className={bulletList}>
            {tips.map((tip, idx) => (
              <li key={idx}>{tip}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
