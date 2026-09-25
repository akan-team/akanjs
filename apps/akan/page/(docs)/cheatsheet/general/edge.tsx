import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Edge Computing", ko: "엣지 컴퓨팅" })}>
        <Docs.Title>{l.trans({ en: "Edge Computing", ko: "엣지 컴퓨팅" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Edge computing in Akan means this: one Akan server can call another Akan server with the same generated `fetch` object you already use in the app.",
              ko: "Akan에서 엣지 컴퓨팅은 이렇게 이해하면 됩니다. 한 Akan 서버가 앱에서 쓰던 generated `fetch` 객체로 다른 Akan 서버를 호출하는 것입니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Cloud server: decides what should happen.",
                ko: "Cloud server: 무엇을 할지 결정합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Edge server: does work close to the device or user.",
                ko: "Edge server: 장비나 사용자 가까이에서 일을 처리합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Akan fetch: connects both sides with typed signal calls.",
                ko: "Akan fetch: 양쪽을 type-safe signal 호출로 연결합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="call-remote" title={l.trans({ en: "Call Another Server", ko: "다른 서버 호출하기" })}>
        <Docs.Title>{l.trans({ en: "Call Another Server", ko: "다른 서버 호출하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The important part is the last option: `{ origin }`. It tells fetch which server should receive the signal call.",
              ko: "중요한 부분은 마지막 option인 `{ origin }`입니다. 이 값이 fetch에게 어떤 서버로 signal 호출을 보낼지 알려줍니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Include the server global API prefix (for example `/api`) in the origin, because fetch sends the call to it as-is.",
              ko: "origin에는 서버 global API prefix(예: `/api`)까지 포함해야 합니다. fetch가 이 값을 그대로 사용해 호출을 보내기 때문입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Ping an edge server", ko: "엣지 서버 ping" })}
          code={`const origin = "https://edge.example.com/api";

const result = await fetch.ping({ origin });

if (result === "ping") {
  console.info("edge server is alive");
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="commands" title={l.trans({ en: "Send Commands", ko: "명령 보내기" })}>
        <Docs.Title>{l.trans({ en: "Send Commands", ko: "명령 보내기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use normal query or mutation calls when the cloud wants the edge server to do something. The call still has typed arguments and typed return values.",
              ko: "cloud가 edge server에게 어떤 일을 시키고 싶다면 일반 query 또는 mutation 호출을 사용합니다. 이 호출도 argument와 return type이 유지됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Remote command", ko: "원격 명령" })}
          code={`const edgeOrigin = "https://edge.example.com/api";

await fetch.startJob(jobId, { origin: edgeOrigin });
await fetch.stopJob(jobId, { origin: edgeOrigin });`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="subscribe" title={l.trans({ en: "Listen To Status", ko: "상태 듣기" })}>
        <Docs.Title>{l.trans({ en: "Listen To Status", ko: "상태 듣기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use subscriptions when the edge server keeps sending status. Save the unsubscribe function so you can clean up later.",
              ko: "edge server가 상태를 계속 보내야 한다면 subscription을 사용합니다. 나중에 정리할 수 있도록 unsubscribe 함수를 저장하세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Subscribe and cleanup", ko: "구독과 정리" })}
          code={`const unsubscribe = fetch.subscribeJobStatus(
  (status) => {
    console.info(status);
  },
  { origin: "https://edge.example.com/api" },
);

// When the page or worker closes:
unsubscribe();`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="remote-object" title={l.trans({ en: "Wrap A Remote Node", ko: "원격 노드 감싸기" })}>
        <Docs.Title>{l.trans({ en: "Wrap A Remote Node", ko: "원격 노드 감싸기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When you talk to the same edge server many times, make a small class that remembers the origin and unsubscribe functions.",
              ko: "같은 edge server와 여러 번 통신한다면 origin과 unsubscribe 함수를 기억하는 작은 class로 감싸면 편합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Small wrapper", ko: "작은 wrapper" })}
          code={`class RemoteEdge {
  constructor(private origin: string) {}

  ping() {
    return fetch.ping({ origin: this.origin });
  }

  start(jobId: string) {
    return fetch.startJob(jobId, { origin: this.origin });
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="fast-data" title={l.trans({ en: "Very Fast Data", ko: "아주 빠른 데이터" })}>
        <Docs.Title>{l.trans({ en: "Very Fast Data", ko: "아주 빠른 데이터" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Keep Akan fetch for commands and status. If you need huge video or binary streams, you can add another transport just for that data.",
              ko: "명령과 상태는 Akan fetch로 유지하세요. 아주 큰 영상이나 binary stream이 필요하다면 그 데이터만을 위한 다른 통로를 추가할 수 있습니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>{l.trans({ en: "Commands: `fetch.startJob(...)`", ko: "명령: `fetch.startJob(...)`" })}</li>
            <li>
              {l.trans({ en: "Status: `fetch.subscribeJobStatus(...)`", ko: "상태: `fetch.subscribeJobStatus(...)`" })}
            </li>
            <li>
              {l.trans({
                en: "Large streams: use a dedicated path only when needed.",
                ko: "큰 stream: 꼭 필요할 때만 별도 경로를 둡니다.",
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
                en: "Start with a normal signal. If it works locally, it can usually be called remotely by changing `{ origin }`.",
                ko: "먼저 일반 signal로 시작하세요. local에서 잘 동작한다면 보통 `{ origin }`만 바꿔 원격 호출할 수 있습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Keep edge server origins in the database so cloud logic can loop over them.",
                ko: "cloud 로직이 순회할 수 있도록 edge server origin은 DB에 저장하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Always clean up subscriptions. Long-running workers can leak connections otherwise.",
                ko: "subscription은 항상 정리하세요. 오래 실행되는 worker에서는 연결이 새기 쉽습니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
