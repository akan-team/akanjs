import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";

  const partRows = [
    {
      name: <span className="font-sans">{l.trans({ en: "Cloud server", ko: "클라우드 서버" })}</span>,
      desc: l.trans({
        en: "Decides what should happen and sends commands to the edge.",
        ko: "무엇을 할지 결정하고 엣지에 명령을 보냅니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Edge server", ko: "엣지 서버" })}</span>,
      desc: l.trans({
        en: "Does the work close to the device or user, and reports status back.",
        ko: "장비나 사용자 가까이에서 일을 처리하고, 상태를 돌려보냅니다.",
      }),
    },
    {
      name: "fetch + { origin }",
      desc: l.trans({
        en: "Connects both sides with typed signal calls; only `{ origin }` differs from a local call.",
        ko: "양쪽을 타입이 있는 signal 호출로 잇고, 로컬 호출과는 `{ origin }` 옵션 하나만 다릅니다.",
      }),
      example: "await fetch.startJob(jobId, { origin: edgeOrigin });",
    },
  ];

  const policyRows = [
    {
      key: "origin",
      type: "string",
      tags: ["query · mutation · pubsub"],
      desc: l.trans({
        en: "The server that receives the call: scheme, host and API prefix.",
        ko: "호출을 받을 서버로, scheme과 host에 API prefix까지 적습니다.",
      }),
      example: `{ origin: \`https://\${host}\${getApiPrefix()}\` }`,
    },
    {
      key: "timeout",
      type: "number | false",
      default: "30000",
      tags: ["query · mutation"],
      desc: l.trans({
        en: "Milliseconds before the caller gives up; overrides the endpoint's `timeout`, and `false` waits.",
        ko: "호출자가 포기하기까지의 ms로, endpoint에 선언된 `timeout`보다 우선하고 `false`면 계속 기다립니다.",
      }),
    },
    {
      key: "token",
      type: "string",
      tags: ["query · mutation"],
      desc: l.trans({
        en: "Sent as `Authorization: Bearer <token>`, so the remote guards judge that account.",
        ko: "`Authorization: Bearer <token>`으로 보내므로, 원격 서버의 guard가 그 계정으로 판단합니다.",
      }),
    },
    {
      key: "onResync",
      type: "() => void",
      tags: ["pubsub"],
      desc: l.trans({
        en: "Runs after the room is subscribed again following a dropped connection.",
        ko: "끊긴 연결이 복구되어 room을 다시 구독한 뒤에 실행됩니다.",
      }),
    },
  ];

  const errorRows = [
    {
      when: l.trans({ en: "The remote endpoint threw an `Err`", ko: "원격 endpoint가 `Err`를 던짐" }),
      result: l.trans({
        en: "The same `Err`, with its key, `data` and status code",
        ko: "key, `data`, 상태 코드가 그대로인 같은 `Err`",
      }),
    },
    {
      when: l.trans({
        en: "The connection was refused or the host did not resolve",
        ko: "연결이 거부되었거나 host를 찾지 못함",
      }),
      result: "`base.error.serverUnreachable` (503)",
    },
    {
      when: l.trans({ en: "No answer before the timeout", ko: "timeout 안에 응답이 없음" }),
      result: "`base.error.gatewayTimeout` (408)",
    },
    {
      when: l.trans({
        en: "A proxy in front answered 502, 503 or 504 with its own page",
        ko: "앞단 프록시가 자체 페이지로 502, 503, 504를 응답함",
      }),
      result: "`base.error.serverUnavailable` · `base.error.gatewayTimeout`",
    },
  ];

  const dataRows = [
    {
      name: "fetch.startJob(...)",
      desc: l.trans({
        en: (
          <span>
            <strong>Commands.</strong> A query or mutation, with typed arguments and a typed result.
          </span>
        ),
        ko: (
          <span>
            <strong>명령.</strong> 인자와 결과에 타입이 있는 query나 mutation입니다.
          </span>
        ),
      }),
    },
    {
      name: "fetch.subscribeJobStatus(...)",
      desc: l.trans({
        en: (
          <span>
            <strong>Status.</strong> A pubsub room the edge publishes to.
          </span>
        ),
        ko: (
          <span>
            <strong>상태.</strong> 엣지가 발행하는 pubsub room입니다.
          </span>
        ),
      }),
    },
    {
      name: "pubsub(Binary)",
      desc: l.trans({
        en: (
          <span>
            <strong>Telemetry, video frames.</strong> Binary websocket frames; a slow subscriber gets the newest one.
          </span>
        ),
        ko: (
          <span>
            <strong>텔레메트리, 영상 프레임.</strong> websocket binary frame으로 보내고, 느린 구독자는 가장 최신 frame을
            받습니다.
          </span>
        ),
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "A separate transport", ko: "별도 통로" })}</span>,
      desc: l.trans({
        en: (
          <span>
            <strong>Huge streams.</strong> Add one only when <code>pubsub(Binary)</code> is not enough.
          </span>
        ),
        ko: (
          <span>
            <strong>아주 큰 스트림.</strong> <code>pubsub(Binary)</code>로 부족할 때만 추가합니다.
          </span>
        ),
      }),
    },
  ];

  const siteColumns = [
    { key: "setting", label: l.trans({ en: "Setting", ko: "설정" }) },
    { key: "edge", label: l.trans({ en: "Edge site", ko: "엣지 사이트" }) },
    { key: "cloud", label: l.trans({ en: "Cloud cluster", ko: "클라우드 클러스터" }) },
  ];
  const siteRows = [
    {
      setting: "`AKAN_PUBLIC_OPERATION_MODE`",
      edge: "`edge`",
      cloud: l.trans({ en: "`cloud`, the image default", ko: "`cloud` (이미지 기본값)" }),
    },
    {
      setting: "`AKAN_DATABASE_MODE`",
      edge: "`single`",
      cloud: "`cluster`",
    },
    {
      setting: l.trans({ en: "Data", ko: "데이터" }),
      edge: l.trans({
        en: "SQLite files on a mounted volume that `AKAN_SQLITE_DIR` names",
        ko: "`AKAN_SQLITE_DIR`가 가리키는 마운트 볼륨의 SQLite 파일",
      }),
      cloud: l.trans({ en: "`POSTGRES_URL` and `REDIS_URI`", ko: "`POSTGRES_URL`과 `REDIS_URI`" }),
    },
    {
      setting: l.trans({ en: "Instances", ko: "인스턴스" }),
      edge: l.trans({ en: "One container", ko: "컨테이너 하나" }),
      cloud: l.trans({ en: "Several servers", ko: "여러 서버" }),
    },
  ];

  const relatedLinks = [
    {
      href: "/cheatsheet/dev/docker#compose",
      title: l.trans({ en: "Minimal Compose", ko: "최소 compose 파일" }),
      desc: l.trans({
        en: "The compose file for one edge container and its volumes.",
        ko: "엣지 컨테이너 하나와 그 볼륨을 띄우는 compose 파일입니다.",
      }),
    },
    {
      href: "/cheatsheet/performance/realtime#pubsub",
      title: l.trans({ en: "Broadcast With pubsub", ko: "pubsub으로 room에 보내기" }),
      desc: l.trans({
        en: "Declare a room, guard it, and subscribe to it.",
        ko: "room을 선언하고, guard를 걸고, 구독하는 방법입니다.",
      }),
    },
    {
      href: "/cheatsheet/observability/error",
      title: l.trans({ en: "Error Handling", ko: "에러 처리" }),
      desc: l.trans({
        en: "Declare error keys and pick a status code for each.",
        ko: "에러 key를 선언하고 상태 코드를 고르는 방법입니다.",
      }),
    },
    {
      href: "/cheatsheet/interface/endpoint#endpoint",
      title: l.trans({ en: "Declare Endpoint", ko: "Endpoint 선언하기" }),
      desc: l.trans({
        en: "Endpoint options, including `timeout` for slow work.",
        ko: "느린 작업을 위한 `timeout`을 포함한 endpoint 옵션입니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Edge Computing", ko: "엣지 컴퓨팅" })}>
        <Docs.Title>{l.trans({ en: "Edge Computing", ko: "엣지 컴퓨팅" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  In Akan, edge computing means one Akan server calls another with the same generated <code>fetch</code>{" "}
                  your app already uses. Add one option, <code>{"{\u00a0origin\u00a0}"}</code>, and the call goes to the
                  other server.
                </span>
              ),
              ko: (
                <span>
                  Akan에서 엣지 컴퓨팅은 한 Akan 서버가 앱에서 이미 쓰는 생성된 <code>fetch</code>로 다른 Akan 서버를
                  호출하는 것입니다. <code>{"{\u00a0origin\u00a0}"}</code> 옵션 하나만 더하면 호출이 다른 서버로 갑니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Part", ko: "구성 요소" })} items={partRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="call-remote" title={l.trans({ en: "Call Another Server", ko: "다른 서버 호출하기" })}>
        <Docs.Title>{l.trans({ en: "Call Another Server", ko: "다른 서버 호출하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Every generated <code>fetch</code> call takes an options object as its last argument. Put{" "}
                  <code>{"{\u00a0origin\u00a0}"}</code> there and the call goes to that server instead of your own.
                </span>
              ),
              ko: (
                <span>
                  생성된 <code>fetch</code> 호출은 모두 마지막 인자로 옵션 객체를 받습니다. 여기에{" "}
                  <code>{"{\u00a0origin\u00a0}"}</code>을 넣으면 호출이 내 서버가 아니라 그 서버로 갑니다.
                </span>
              ),
            })}
          </div>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The origin ends in the API prefix.</strong> fetch appends the endpoint path to it as-is, as
                    in <code>https://edge-01.example.com/api</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>origin은 API prefix로 끝나야 합니다.</strong> fetch는 origin 뒤에 endpoint 경로를 그대로
                    붙입니다. 예를 들면 <code>https://edge-01.example.com/api</code>입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Read the prefix, never write it.</strong> It is configurable, so build the origin with{" "}
                    <code>getApiPrefix()</code> from <code>akanjs/base</code> instead of an <code>/api</code> literal.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>prefix는 직접 적지 말고 읽어 옵니다.</strong> 설정으로 바뀔 수 있으므로 <code>/api</code>를
                    문자열로 적지 말고 <code>akanjs/base</code>의 <code>getApiPrefix()</code>로 origin을 만듭니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The caller needs the endpoint too.</strong> A <code>fetch</code> holds only the endpoints
                    its own app and libs declare, so put the ones the edge serves in a lib both apps use, or run one app
                    on both sides.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>호출하는 쪽도 그 endpoint를 알아야 합니다.</strong> <code>fetch</code>에는 자기 앱과 lib이
                    선언한 endpoint만 있으므로, 엣지가 제공하는 endpoint는 두 앱이 함께 쓰는 lib에 두거나 한 앱을
                    양쪽에서 돌립니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: "A health check that pings one edge server:",
              ko: "엣지 서버 하나에 ping을 보내 살아 있는지 확인하는 코드입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/_edge/edge.service.ts"
          code={`import { getApiPrefix } from "akanjs/base";
import { serve } from "akanjs/service";

export class EdgeService extends serve("edge" as const, () => ({})) {
  async isEdgeAlive(edgeHost: string) {
    const origin = \`https://\${edgeHost}\${getApiPrefix()}\`;
    try {
      const result = await fetch.ping({ origin, timeout: 3000 });
      if (result !== "ping") return false;
    } catch {
      this.logger.warn(\`edge server \${edgeHost} did not answer\`);
      return false;
    }
    this.logger.info(\`edge server \${edgeHost} is alive\`);
    return true;
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>fetch.ping()</code> is built in.
                    </strong>{" "}
                    Every Akan server answers it with <code>"ping"</code>, so you declare no endpoint for it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>fetch.ping()</code>은 기본 제공됩니다.
                    </strong>{" "}
                    모든 Akan 서버가 <code>"ping"</code>으로 답하므로 따로 endpoint를 선언하지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>An unreachable server throws.</strong> A refused connection or a timeout arrives as an{" "}
                    <code>Err</code>, so the check catches it and answers <code>false</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>닿지 않는 서버는 에러를 던집니다.</strong> 연결 거부나 timeout은 <code>Err</code>로
                    도착하므로, 확인 코드는 이를 잡아 <code>false</code>로 답합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Give a probe a short <code>timeout</code>.
                    </strong>{" "}
                    Without one, a dead edge holds the call for the 30-second default.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      확인용 호출에는 짧은 <code>timeout</code>을 줍니다.
                    </strong>{" "}
                    없으면 죽은 엣지 때문에 호출이 기본값인 30초 동안 붙잡힙니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "Options for a remote call", ko: "원격 호출에 쓰는 옵션" })}
          </Docs.SubSubTitle>
          <Docs.OptionTable items={policyRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="commands" title={l.trans({ en: "Send Commands", ko: "명령 보내기" })}>
        <Docs.Title>{l.trans({ en: "Send Commands", ko: "명령 보내기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  When the cloud wants the edge to do something, call an ordinary query or mutation with the same{" "}
                  <code>{"{\u00a0origin\u00a0}"}</code>. Arguments and return values stay typed. Build the origin once
                  and pass it to each call:
                </span>
              ),
              ko: (
                <span>
                  클라우드가 엣지에게 일을 시킬 때는 평범한 query나 mutation을 같은{" "}
                  <code>{"{\u00a0origin\u00a0}"}</code>으로 호출합니다. 인자와 반환값의 타입도 그대로입니다. origin은 한
                  번 만들어 두고 호출마다 넘깁니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/_edge/edge.service.ts"
          code={`const edgeOrigin = \`https://\${edgeHost}\${getApiPrefix()}\`;

await fetch.startJob(jobId, { origin: edgeOrigin });
await fetch.stopJob(jobId, { origin: edgeOrigin });`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Long work needs a longer deadline.</strong> A call gives up after 30 seconds unless the
                    endpoint declares <code>{"{\u00a0timeout\u00a0}"}</code> or the caller passes one.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>오래 걸리는 작업에는 더 긴 제한 시간이 필요합니다.</strong> endpoint가{" "}
                    <code>{"{\u00a0timeout\u00a0}"}</code>을 선언하거나 호출할 때 넘기지 않으면, 호출은 30초 뒤에
                    포기합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Declare it on the edge endpoint.</strong> For firmware updates, provisioning and other slow
                    jobs, every caller then gets the same budget.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>제한 시간은 엣지 endpoint에 선언합니다.</strong> 펌웨어 업데이트나 프로비저닝처럼 느린
                    작업에 선언해 두면 모든 호출자가 같은 제한 시간을 씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A timeout does not cancel the work.</strong> The edge handler runs to the end after the cloud
                  stops waiting, so check the job's status before sending the command again.
                </span>
              ),
              ko: (
                <span>
                  <strong>timeout은 작업을 취소하지 않습니다.</strong> 클라우드가 기다리기를 멈춰도 엣지의 핸들러는
                  끝까지 실행됩니다. 명령을 다시 보내기 전에 작업 상태부터 확인하세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="errors" title={l.trans({ en: "Errors Come Back", ko: "에러는 그대로 돌아옵니다" })}>
        <Docs.Title>{l.trans({ en: "Errors Come Back", ko: "에러는 그대로 돌아옵니다" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  An <code>Err</code> the remote endpoint threw arrives here as that same <code>Err</code>: same key,
                  same <code>data</code>, and <code>instanceof Err</code>. Let it propagate, and your own caller gets it
                  too, so the browser toasts the sentence the remote server chose.
                </span>
              ),
              ko: (
                <span>
                  원격 endpoint가 던진 <code>Err</code>는 이쪽에도 같은 <code>Err</code>로 도착합니다. key와{" "}
                  <code>data</code>가 같고 <code>instanceof Err</code>도 참입니다. 그대로 흘려보내면 내 호출자도 같은
                  에러를 받으므로, 브라우저는 원격 서버가 고른 문장을 toast로 띄웁니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({ en: "One error crossing two servers:", ko: "에러 하나가 서버 두 대를 건너는 모습입니다:" })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title={l.trans({ en: "One error, two servers", ko: "에러 하나, 서버 둘" })}
          code={`// edge server
throw new Err("job.error.applyTimeout", { jobId, timeout: 3000 });

// cloud server — the same Err is thrown by this call
await fetch.startJob(jobId, { origin: edgeOrigin });`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "What the caller catches", ko: "호출한 쪽이 받는 에러" })}</Docs.SubSubTitle>
          <Docs.Table
            stacked
            columns={[
              { key: "when", label: l.trans({ en: "When", ko: "상황" }) },
              { key: "result", label: l.trans({ en: "Thrown on the caller", ko: "호출한 쪽에서 던져지는 것" }) },
            ]}
            rows={errorRows}
          />
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Never wrap the catch in <code>new Error</code>, or re-key it as a <code>new Err</code> of your own.
                  </strong>{" "}
                  Both discard the key the remote chose, and a plain <code>Error</code> is generalized to{" "}
                  <code>Internal Server Error</code> on the way out.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    catch한 에러를 <code>new Error</code>로 감싸거나, 내 <code>new Err</code>로 key를 바꾸지 마세요.
                  </strong>{" "}
                  둘 다 원격 서버가 고른 key를 버립니다. 일반 <code>Error</code>는 응답으로 나가면서{" "}
                  <code>Internal Server Error</code>로 바뀝니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="subscribe" title={l.trans({ en: "Listen To Status", ko: "상태 듣기" })}>
        <Docs.Title>{l.trans({ en: "Listen To Status", ko: "상태 듣기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  When the edge keeps sending status, subscribe to its <code>pubsub</code> endpoint with the same{" "}
                  <code>{"{\u00a0origin\u00a0}"}</code>. The call returns an unsubscribe function; keep it and call it
                  when you are done:
                </span>
              ),
              ko: (
                <span>
                  엣지가 상태를 계속 보낸다면 엣지의 <code>pubsub</code> endpoint를 같은{" "}
                  <code>{"{\u00a0origin\u00a0}"}</code>
                  으로 구독합니다. 구독 호출은 구독 해제 함수를 돌려주므로, 보관해 두었다가 다 쓰면 호출합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/_edge/edge.service.ts"
          code={`const unsubscribe = fetch.subscribeJobStatus(
  (status) => {
    this.logger.info(\`job status: \${status}\`);
  },
  { origin: edgeOrigin },
);

// When the job or the worker ends:
unsubscribe();`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One socket per edge server.</strong> The first subscription with an <code>origin</code>{" "}
                    opens a websocket to that server, and later ones share it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>엣지 서버마다 소켓은 하나입니다.</strong> <code>origin</code>을 준 첫 구독이 그 서버로
                    websocket을 열고, 이후 구독은 그 소켓을 함께 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Events sent during a disconnect are lost.</strong> Pass <code>onResync</code> to reload the
                    current state once the room is back.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>연결이 끊긴 동안 보낸 이벤트는 사라집니다.</strong> <code>onResync</code>를 넘기면 room을
                    다시 구독한 뒤 현재 상태를 다시 불러올 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      The edge's pubsub declares its own <code>guards</code>.
                    </strong>{" "}
                    A slice's guard map does not reach a pubsub, so a room without guards is open to any socket.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      엣지의 pubsub에는 <code>guards</code>를 직접 선언합니다.
                    </strong>{" "}
                    slice의 guard map은 pubsub에 적용되지 않으므로, guards가 없는 room은 어떤 소켓이든 구독할 수
                    있습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="remote-object" title={l.trans({ en: "Wrap A Remote Node", ko: "원격 노드 감싸기" })}>
        <Docs.Title>{l.trans({ en: "Wrap A Remote Node", ko: "원격 노드 감싸기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When you talk to the same edge server many times, wrap it in a small class that remembers its origin and its unsubscribe functions:",
              ko: "같은 엣지 서버와 여러 번 통신한다면, origin과 구독 해제 함수를 기억하는 작은 class로 감싸면 편합니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/srvkit/RemoteEdge.ts"
          code={`import { getApiPrefix } from "akanjs/base";

export class RemoteEdge {
  readonly #origin: string;
  readonly #unsubscribes: (() => void)[] = [];

  constructor(host: string) {
    this.#origin = \`https://\${host}\${getApiPrefix()}\`;
  }

  ping() {
    return fetch.ping({ origin: this.#origin });
  }

  start(jobId: string) {
    return fetch.startJob(jobId, { origin: this.#origin });
  }

  watchStatus(onStatus: (status: string) => void) {
    const stop = fetch.subscribeJobStatus(onStatus, { origin: this.#origin });
    this.#unsubscribes.push(stop);
  }

  close() {
    for (const unsubscribe of this.#unsubscribes.splice(0)) unsubscribe();
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The origin lives in one place.</strong> Every method reuses <code>#origin</code>, so no call
                    can forget the <code>{"{\u00a0origin\u00a0}"}</code> option.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>origin은 한 곳에만 있습니다.</strong> 모든 메서드가 <code>#origin</code>을 재사용하므로{" "}
                    <code>{"{\u00a0origin\u00a0}"}</code>을 빠뜨리는 호출이 생기지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>close()</code> releases every subscription at once.
                    </strong>{" "}
                    Call it when the edge goes offline or the worker stops.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>close()</code> 한 번으로 모든 구독을 해제합니다.
                    </strong>{" "}
                    엣지가 오프라인이 되거나 worker가 멈출 때 호출합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      A plain class, not <code>adapt()</code>.
                    </strong>{" "}
                    There is one per edge server, not one per process, so create it with{" "}
                    <code>{"new\u00a0RemoteEdge(host)"}</code> where you need it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>adapt()</code>가 아닌 평범한 class입니다.
                    </strong>{" "}
                    프로세스마다 하나가 아니라 엣지 서버마다 하나이므로, 필요한 곳에서{" "}
                    <code>{"new\u00a0RemoteEdge(host)"}</code>로 만듭니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="fast-data" title={l.trans({ en: "Very Fast Data", ko: "아주 빠른 데이터" })}>
        <Docs.Title>{l.trans({ en: "Very Fast Data", ko: "아주 빠른 데이터" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Keep commands and status on Akan fetch. Bytes such as telemetry or video frames can ride{" "}
                  <code>pubsub(Binary)</code>; add another transport only for streams even that cannot carry.
                </span>
              ),
              ko: (
                <span>
                  명령과 상태는 Akan fetch로 유지하세요. 텔레메트리나 영상 프레임 같은 바이트는{" "}
                  <code>pubsub(Binary)</code>로 보낼 수 있고, 그것으로도 감당하지 못하는 스트림에만 별도 통로를 둡니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Use", ko: "쓰는 것" })}
            descLabel={l.trans({ en: "Data", ko: "데이터" })}
            items={dataRows}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Bytes skip JSON.</strong> When the whole return is <code>Binary</code>, each payload goes
                    out as a websocket binary frame and arrives as a <code>Uint8Array</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>바이트는 JSON을 거치지 않습니다.</strong> 반환 타입 전체가 <code>Binary</code>이면 payload가
                    websocket binary frame으로 나가고 <code>Uint8Array</code>로 도착합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A slow subscriber gets the newest frame.</strong> Declare{" "}
                    <code>{'{\u00a0backpressure:\u00a0"queue"\u00a0}'}</code> on the pubsub when every frame must
                    arrive, such as deltas against a base.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>느린 구독자는 가장 최신 frame만 받습니다.</strong> 기준값에 대한 델타처럼 모든 frame이
                    도착해야 한다면 pubsub 옵션에 <code>{'{\u00a0backpressure:\u00a0"queue"\u00a0}'}</code>를
                    선언합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Never send bytes as <code>Any</code>.
                    </strong>{" "}
                    A <code>Buffer</code> inside <code>Any</code> turns into a JSON number array about 3.6 times larger.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      바이트를 <code>Any</code>로 보내지 마세요.
                    </strong>{" "}
                    <code>Any</code> 안의 <code>Buffer</code>는 약 3.6배 큰 JSON 숫자 배열이 됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="edge-site" title={l.trans({ en: "Run The Edge Site", ko: "엣지 사이트 띄우기" })}>
        <Docs.Title>{l.trans({ en: "Run The Edge Site", ko: "엣지 사이트 띄우기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "An edge site is usually one container that keeps its data in SQLite files. The cloud can run the same app as a cluster, from the same image.",
              ko: "엣지 사이트는 보통 데이터를 SQLite 파일에 두는 컨테이너 하나입니다. 클라우드는 같은 이미지로 같은 앱을 클러스터로 돌릴 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  Declare both database modes in <code>akan.config.ts</code>:
                </span>
              ),
              ko: (
                <span>
                  <code>akan.config.ts</code>에 두 데이터베이스 모드를 모두 선언합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  database: { modes: ["single", "cluster"] },
};

export default config;`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "Each deployment of the image then says where it runs and where its data lives:",
              ko: "그다음 이미지를 배포할 때마다 어디서 도는지, 데이터가 어디 있는지를 정합니다:",
            })}
          </div>
          <Docs.Table columns={siteColumns} rows={siteRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The operation mode and the database mode are independent.</strong> <code>edge</code> or{" "}
                    <code>cloud</code> says where the server runs; <code>single</code> or <code>cluster</code> says
                    where its data lives.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>운영 모드와 데이터베이스 모드는 서로 따로입니다.</strong> <code>edge</code>나{" "}
                    <code>cloud</code>는 서버가 어디서 도는지를, <code>single</code>이나 <code>cluster</code>는 데이터가
                    어디 있는지를 정합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Only internals follow the operation mode.</strong> An internal declared as{" "}
                    <code>{'cron("0 4 * * *", { operationMode: ["cloud"] })'}</code> never runs on the edge, while every
                    endpoint is served on both sides.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>운영 모드를 따르는 것은 internal뿐입니다.</strong>{" "}
                    <code>{'cron("0 4 * * *", { operationMode: ["cloud"] })'}</code>처럼 선언한 internal은 엣지에서 돌지
                    않고, endpoint는 모두 양쪽에서 제공됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every deployment names its mode.</strong> With two modes declared,{" "}
                    <code>AKAN_DATABASE_MODE</code> is required; only a developer machine falls back to the first.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>배포마다 모드를 적습니다.</strong> 모드를 두 개 선언했다면 <code>AKAN_DATABASE_MODE</code>가
                    꼭 필요하고, 첫 번째 모드로 넘어가는 것은 개발 기기뿐입니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "팁" })}</Docs.Title>
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Start with a normal signal.</strong> If it works locally, it can usually be called remotely
                    by changing only <code>{"{\u00a0origin\u00a0}"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>평범한 signal로 시작하세요.</strong> 로컬에서 잘 동작하면 보통{" "}
                    <code>{"{\u00a0origin\u00a0}"}</code>만 바꿔 원격으로 호출할 수 있습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep edge hosts in the database.</strong> Build each origin from <code>getApiPrefix()</code>
                    , so a prefix change reaches every one of them.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>엣지 서버 host는 DB에 저장하세요.</strong> origin을 <code>getApiPrefix()</code>로 조립해야
                    prefix가 바뀌어도 모든 origin에 반영됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Always clean up subscriptions.</strong> Otherwise a long-running worker leaks connections.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>구독은 항상 정리하세요.</strong> 그러지 않으면 오래 도는 worker에서 연결이 샙니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "함께 볼 페이지" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={relatedLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
