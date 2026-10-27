import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "Observability: 메트릭 | Akan.js" : "Observability: Metrics | Akan.js";
    const description =
      lang === "ko"
        ? "실행 중인 앱에서 health와 metrics를 읽고, 문제를 좁혀 가는 순서."
        : "Read health and metrics from the running app, and the order to troubleshoot in.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const bulletList = "my-4 list-disc space-y-2 pl-5";
    const off = l.trans({ en: "off", ko: "꺼짐" });

    const questionRows = [
      {
        name: "GET /_akan/app/health",
        desc: l.trans({
          en: (
            <span>
              <strong>Is it alive?</strong> Whether each replica is up and ready to take requests.
            </span>
          ),
          ko: (
            <span>
              <strong>살아 있나요?</strong> replica마다 떠 있는지, 요청을 받을 준비가 됐는지 보여 줍니다.
            </span>
          ),
        }),
      },
      {
        name: "GET /_akan/app/metrics",
        desc: l.trans({
          en: (
            <span>
              <strong>How busy is it?</strong> Requests in flight, WebSocket load, memory and the render queue.
            </span>
          ),
          ko: (
            <span>
              <strong>얼마나 바쁜가요?</strong> 처리 중인 요청, WebSocket 부하, 메모리, 렌더링 대기열을 보여 줍니다.
            </span>
          ),
        }),
      },
      {
        name: "akan logs <app>",
        desc: l.trans({
          en: (
            <span>
              <strong>Why?</strong> Which endpoint, queue or render path produced those numbers.
            </span>
          ),
          ko: (
            <span>
              <strong>왜 그런가요?</strong> 그 숫자를 만든 endpoint, 큐, 렌더링 경로를 로그에서 찾습니다.
            </span>
          ),
        }),
      },
    ];

    const termRows = [
      {
        name: "gateway",
        desc: l.trans({
          en: "A front process that hands requests to replicas, e.g. under `akan start` or with 2+ replicas.",
          ko: "요청을 replica에게 나눠 주는 앞단 프로세스입니다. `akan start`로 띄우거나 replica가 둘 이상일 때 생깁니다.",
        }),
      },
      {
        name: "replica",
        desc: l.trans({
          en: "A server process that handles requests or jobs; each one is an entry in `children`.",
          ko: "요청이나 작업을 처리하는 서버 프로세스입니다. 응답의 `children` 배열에 하나씩 들어갑니다.",
        }),
      },
      {
        name: "solo",
        desc: l.trans({
          en: "One replica with no gateway in front, the container default; it answers both endpoints itself.",
          ko: "gateway 없이 replica 하나만 도는 형태로, 컨테이너의 기본값입니다. replica가 두 endpoint에 직접 답합니다.",
        }),
      },
      {
        name: "RSC worker",
        desc: l.trans({
          en: "The separate process that renders pages, one per web-serving replica.",
          ko: "페이지를 렌더링하는 별도 프로세스입니다. 웹을 서빙하는 replica마다 하나씩 붙습니다.",
        }),
      },
    ];

    const healthFieldRows = [
      {
        name: "status",
        desc: l.trans({
          en: "`running`, or `stopping` while the server shuts down.",
          ko: "평소에는 `running`이고, 서버가 내려가는 동안에는 `stopping`입니다.",
        }),
      },
      {
        name: "children[].role",
        desc: l.trans({
          en: "`all` does both, `federation` serves requests, `batch` runs background internals only.",
          ko: "`all`은 요청과 작업을 모두, `federation`은 요청을, `batch`는 백그라운드 internal만 맡습니다.",
        }),
      },
      {
        name: "children[].ready",
        desc: l.trans({
          en: "`true` once the replica has booted and can take requests or jobs.",
          ko: "replica가 부팅을 마치고 요청이나 작업을 받을 수 있게 되면 `true`가 됩니다.",
        }),
      },
      {
        name: "children[].status",
        desc: l.trans({
          en: "Where the replica is in its lifecycle; see the table below.",
          ko: "replica가 지금 어느 단계에 있는지입니다. 아래 표를 보세요.",
        }),
      },
      {
        name: ["restartCount", "lastRestartReason", "lastErrorMessage"],
        desc: l.trans({
          en: "How often the replica restarted and why; read these first when it keeps coming back.",
          ko: "replica가 몇 번, 왜 재시작했는지 알려 주므로 계속 재시작된다면 여기부터 봅니다.",
        }),
      },
      {
        name: "solo",
        desc: l.trans({
          en: "Appears only in solo, where the replica's entry carries no restart fields.",
          ko: "solo일 때만 붙고, 이때 replica 항목에는 재시작 필드가 없습니다.",
        }),
      },
    ];

    const statusColumns = [
      { key: "status", label: "status", code: true },
      { key: "desc", label: l.trans({ en: "Meaning", ko: "뜻" }) },
    ];

    const statusRows = [
      {
        status: "starting",
        desc: l.trans({
          en: "The process was spawned and is still booting.",
          ko: "프로세스가 떴고 아직 부팅 중입니다.",
        }),
      },
      {
        status: "ready",
        desc: l.trans({
          en: "It takes requests, but the gateway's first health ping has not come back yet.",
          ko: "요청을 받을 수 있지만, gateway가 보낸 첫 health ping의 응답은 아직 오지 않았습니다.",
        }),
      },
      {
        status: "healthy",
        desc: l.trans({
          en: "It answers the gateway's health ping, sent every 2 seconds.",
          ko: "2초마다 오는 gateway의 health ping에 응답하고 있습니다.",
        }),
      },
      {
        status: "unhealthy",
        desc: l.trans({
          en: "It missed pings for 5 s (15 s under `akan start`) or was unreachable; the gateway restarts it.",
          ko: "5초(`akan start`에서는 15초) 동안 ping에 답하지 않았거나 연결할 수 없어서, gateway가 재시작합니다.",
        }),
      },
      {
        status: "exited",
        desc: l.trans({
          en: "The process ended, and the gateway starts it again.",
          ko: "프로세스가 종료됐고, gateway가 다시 띄웁니다.",
        }),
      },
      {
        status: "crashed",
        desc: l.trans({
          en: "`akan start` only: boot failed three times in a row, so it waits for your next save.",
          ko: "`akan start` 전용입니다. 부팅이 세 번 연속 실패해 다음 코드 저장을 기다립니다.",
        }),
      },
    ];

    const sideColumns = [
      { key: "gateway", label: l.trans({ en: "Gateway", ko: "gateway" }) },
      { key: "solo", label: l.trans({ en: "Solo", ko: "solo" }) },
    ];
    const both = { gateway: true, solo: true };
    const gatewayOnly = { gateway: true, solo: false };

    const metricGroups = [
      {
        label: l.trans({ en: "Top level", ko: "최상위" }),
        rows: [
          {
            name: "rooms · sockets",
            desc: l.trans({
              en: "Pubsub rooms with a subscriber, and the sockets subscribed to them.",
              ko: "구독자가 있는 pubsub room 수와, 그 room을 구독한 소켓 수입니다.",
            }),
            marks: gatewayOnly,
          },
          {
            name: "gateway",
            desc: l.trans({
              en: "The gateway process's own memory and event-loop sample.",
              ko: "gateway 프로세스 자신의 메모리와 이벤트 루프 샘플입니다.",
            }),
            marks: gatewayOnly,
          },
          {
            name: "proxyHop",
            desc: l.trans({
              en: "Time to hand a request from the gateway to a replica, only with `AKAN_TRACE=1`.",
              ko: "gateway가 요청을 replica로 넘기는 데 걸린 시간입니다. `AKAN_TRACE=1`일 때만 채워집니다.",
            }),
            marks: gatewayOnly,
          },
        ],
      },
      {
        label: l.trans({ en: "Each replica, in children[]", ko: "replica별 (children[] 안)" }),
        rows: [
          {
            name: "activeRequests · totalRequests",
            desc: l.trans({
              en: "Requests in flight now, and requests since the replica started.",
              ko: "지금 처리 중인 요청과, replica가 뜬 뒤 받은 전체 요청 수입니다.",
            }),
            marks: gatewayOnly,
          },
          {
            name: "activeWebSockets",
            desc: l.trans({
              en: "Open WebSocket connections passed to this replica.",
              ko: "이 replica로 이어진 WebSocket 연결 수입니다.",
            }),
            marks: gatewayOnly,
          },
          {
            name: "restartCount · lastRestartReason",
            desc: l.trans({
              en: "How often the replica restarted, and why the last time.",
              ko: "replica가 재시작한 횟수와 마지막 이유입니다.",
            }),
            marks: gatewayOnly,
          },
          {
            name: "rssBytes · heapUsedBytes",
            desc: l.trans({
              en: "The replica's memory in the last sample.",
              ko: "마지막 샘플 시점의 replica 메모리입니다.",
            }),
            marks: both,
          },
          {
            name: "rscWorkerRssBytes",
            desc: l.trans({
              en: "Memory of the replica's RSC worker, which is a separate process.",
              ko: "replica에 딸린 RSC worker의 메모리입니다. 별도 프로세스라 따로 잡힙니다.",
            }),
            marks: both,
          },
          {
            name: "eventLoopLagP99Ms",
            desc: l.trans({
              en: "How late timers fired in the last window; high means something blocks the process.",
              ko: "직전 구간에서 타이머가 늦게 실행된 정도입니다. 높으면 무언가 프로세스를 막고 있습니다.",
            }),
            marks: both,
          },
          {
            name: "rscPendingRenderCount",
            desc: l.trans({
              en: "Renders sent to the RSC worker that have not come back yet.",
              ko: "RSC worker에 보냈지만 아직 돌아오지 않은 렌더링 수입니다.",
            }),
            marks: both,
          },
          {
            name: "trace",
            desc: l.trans({
              en: "Per-endpoint timings and query counts, only with `AKAN_TRACE=1`.",
              ko: "endpoint별 소요 시간과 쿼리 수입니다. `AKAN_TRACE=1`일 때만 붙습니다.",
            }),
            marks: both,
          },
        ],
      },
    ];

    const readRows = [
      {
        name: "activeRequests",
        desc: l.trans({
          en: "Requests being handled now; if it stays high, a slow endpoint may be holding work.",
          ko: "지금 처리 중인 요청입니다. 계속 높다면 느린 endpoint가 작업을 붙잡고 있을 수 있습니다.",
        }),
      },
      {
        name: ["activeWebSockets", "rooms", "sockets"],
        desc: l.trans({
          en: "Realtime load: open connections, and the rooms they subscribe to.",
          ko: "실시간 부하입니다. 열린 연결 수와, 그 연결이 구독한 room 수를 봅니다.",
        }),
      },
      {
        name: ["rssBytes", "heapUsedBytes"],
        desc: l.trans({
          en: "Memory size; watch the trend across samples, not one value.",
          ko: "메모리 크기입니다. 값 하나보다 여러 샘플에 걸친 추세를 보세요.",
        }),
      },
      {
        name: "rscWorkerRssBytes",
        desc: l.trans({
          en: "Add it to the replica's `rssBytes`; the sum is what the replica really costs.",
          ko: "replica의 `rssBytes`에 더해서 보세요. 그 합이 replica가 실제로 쓰는 메모리입니다.",
        }),
      },
      {
        name: "rscPendingRenderCount",
        desc: l.trans({
          en: "Server renders waiting on the RSC worker; a rising value means render work is queuing.",
          ko: "RSC worker를 기다리는 서버 렌더링입니다. 값이 오르면 렌더링 작업이 밀리고 있습니다.",
        }),
      },
      {
        name: "eventLoopLagP99Ms",
        desc: l.trans({
          en: "How late the event loop ran its timers; a high value means work is blocking requests.",
          ko: "이벤트 루프가 타이머를 얼마나 늦게 돌렸는지입니다. 높으면 어떤 작업이 요청을 막고 있습니다.",
        }),
      },
      {
        name: ["restartCount", "lastRestartReason"],
        desc: l.trans({
          en: "Replica restarts and the last reason; a rising count means the replica keeps failing.",
          ko: "replica 재시작 횟수와 마지막 이유입니다. 계속 오르면 replica가 반복해서 죽고 있습니다.",
        }),
      },
      {
        name: ["rscWorkerRecycleCount", "rscWorkerLastRecycleReason"],
        desc: l.trans({
          en: "Planned RSC worker swaps at a limit such as `rss>…MiB`; frequent swaps point at render memory.",
          ko: "RSC worker가 `rss>…MiB` 같은 한도에 닿아 교체된 횟수와 이유입니다. 잦다면 렌더링 메모리를 의심하세요.",
        }),
      },
    ];

    const memoryEnvItems = [
      {
        key: "AKAN_MEMORY_LOG",
        type: '"1"',
        default: off,
        desc: l.trans({
          en: "Logs one `memory role=…` line per process on every sample.",
          ko: "샘플마다 프로세스당 `memory role=…` 줄 하나를 로그로 남깁니다.",
        }),
      },
      {
        key: "AKAN_MEMORY_LOG_INTERVAL_MS",
        type: "number (ms)",
        default: "60000",
        desc: l.trans({
          en: "Sample interval for these lines and for the numbers in `/_akan/app/metrics`.",
          ko: "이 로그 줄과 `/_akan/app/metrics` 수치가 함께 쓰는 샘플 주기입니다.",
        }),
      },
      {
        key: "AKAN_MEMORY_GC_ON_REPORT",
        type: '"1"',
        default: off,
        desc: l.trans({
          en: "Forces a full GC before each sample so heap numbers show live memory, and adds `gcDurationMs`.",
          ko: "샘플마다 먼저 전체 GC를 돌려 heap 수치가 살아 있는 메모리만 보이게 하고, `gcDurationMs`를 더합니다.",
        }),
      },
    ];

    const nextReads = [
      {
        href: "/cheatsheet/observability/logging#live-tail",
        title: l.trans({ en: "Live Tail", ko: "실시간 로그 보기" }),
        desc: l.trans({
          en: "Filter `akan logs` by level, endpoint, trace and role.",
          ko: "`akan logs`를 레벨, endpoint, trace, role로 걸러 봅니다.",
        }),
      },
      {
        href: "/cheatsheet/observability/logging#request-line",
        title: l.trans({ en: "Request Line And AKAN_TRACE", ko: "요청 요약 줄과 AKAN_TRACE" }),
        desc: l.trans({
          en: "One summary line per call, and what `AKAN_TRACE=1` adds.",
          ko: "호출마다 남는 요약 줄과, `AKAN_TRACE=1`이 더하는 값을 정리했습니다.",
        }),
      },
      {
        href: "/cheatsheet/dev/docker#replica",
        title: l.trans({ en: "Scale With AKAN_REPLICA", ko: "AKAN_REPLICA로 확장" }),
        desc: l.trans({
          en: "Replica slots, and exactly when a gateway appears.",
          ko: "replica 자리별 의미와, gateway가 생기는 조건입니다.",
        }),
      },
      {
        href: "/cheatsheet/dev/k8s#scale",
        title: l.trans({ en: "Kubernetes Probes", ko: "Kubernetes probe" }),
        desc: l.trans({
          en: "How the pod's probes call `/_akan/app/health`.",
          ko: "pod의 probe가 `/_akan/app/health`를 어떻게 부르는지 봅니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="overview" title={l.trans({ en: "Health And Metrics", ko: "상태와 메트릭" })}>
          <Docs.Title>{l.trans({ en: "Health And Metrics", ko: "상태와 메트릭" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "When an app feels slow or stops answering, ask the running app before you guess. Two endpoints are built in and need no setup.",
                ko: "앱이 느리거나 응답하지 않을 때는 추측하기 전에 실행 중인 앱에게 먼저 물어보세요. 설정 없이 바로 쓸 수 있는 endpoint 두 개가 들어 있습니다.",
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Where to look", ko: "볼 곳" })}
              descLabel={l.trans({ en: "What it answers", ko: "답해 주는 질문" })}
              items={questionRows}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>No setup, no token.</strong> Both are plain GET routes at the root of the app port (
                      <code>8282</code> by default), not under the API prefix.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>설정도 토큰도 필요 없습니다.</strong> 둘 다 앱 포트(기본 <code>8282</code>)의 루트에 있는
                      GET 경로이고, API prefix 아래에 있지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Same shape with or without a gateway.</strong> A solo replica answers in the gateway's
                      shape and adds <code>{'"solo": true'}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>gateway가 있든 없든 형태가 같습니다.</strong> solo replica도 gateway와 같은 형태로 답하고{" "}
                      <code>{'"solo": true'}</code>를 덧붙입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Only checking the port?</strong> <code>/_akan/bench/ping</code> answers a plain{" "}
                      <code>ok</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>포트만 확인하려면</strong> <code>/_akan/bench/ping</code>을 부르세요. <code>ok</code> 한
                      단어로 답합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="health" title={l.trans({ en: "Check Health", ko: "Health 확인" })}>
          <Docs.Title>{l.trans({ en: "Check Health", ko: "Health 확인" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Open health first when the app does not load. It tells you whether the server answers and whether each replica is ready.",
                ko: "앱이 열리지 않으면 health부터 보세요. 서버가 응답하는지, replica마다 요청을 받을 준비가 됐는지 알려 줍니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    Call it on the app port with the <code>AKAN_STATUS_TOKEN</code> bearer; outside <code>local</code>,
                    a caller without it gets only <code>{"{ status }"}</code>. The second line prints only the replica
                    summary and needs <code>jq</code>:
                  </span>
                ),
                ko: (
                  <span>
                    앱 포트로 <code>AKAN_STATUS_TOKEN</code> bearer와 함께 호출합니다. <code>local</code>이 아니면 토큰
                    없는 호출은 <code>{"{ status }"}</code>만 받습니다. 두 번째 줄은 replica 요약만 뽑아 보며,{" "}
                    <code>jq</code>가 필요합니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            language="bash"
            title="Terminal"
            code={`curl -s -H "Authorization: Bearer $AKAN_STATUS_TOKEN" http://localhost:8282/_akan/app/health
curl -s -H "Authorization: Bearer $AKAN_STATUS_TOKEN" localhost:8282/_akan/app/health | jq '.children[] | {role, status, ready}'`}
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Under <code>akan start</code>, a gateway runs one replica, and the response looks like this
                    (trimmed):
                  </span>
                ),
                ko: (
                  <span>
                    <code>akan start</code>에서는 gateway가 replica 하나를 띄우고, 응답은 다음과 같습니다(일부 생략):
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            language="json"
            title={l.trans({ en: "Response", ko: "응답" })}
            code={`{
  "status": "running",
  "pid": 72128,
  "children": [
    {
      "idx": 0,
      "role": "all",
      "status": "healthy",
      "ready": true,
      "pid": 72129,
      "restartCount": 0,
      "restartPending": false
    }
  ]
}`}
          />
          <Docs.Description>
            <Docs.SubSubTitle>{l.trans({ en: "Reading the fields", ko: "필드 읽기" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={healthFieldRows} />
            <Docs.SubSubTitle>{l.trans({ en: "Replica status", ko: "replica 상태값" })}</Docs.SubSubTitle>
            <Docs.Table columns={statusColumns} rows={statusRows} />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>A 200 does not mean ready.</strong> With a gateway in front, health answers 200 even while a
                    replica is <code>starting</code> or restarting. Read <code>children[].ready</code>, not the status
                    code.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>200이 곧 준비 완료는 아닙니다.</strong> gateway가 있으면 replica가 <code>starting</code>
                    이거나 재시작 중이어도 health는 200으로 답합니다. 상태 코드가 아니라 <code>children[].ready</code>를
                    보세요.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="metrics" title={l.trans({ en: "Check Metrics", ko: "Metrics 확인" })}>
          <Docs.Title>{l.trans({ en: "Check Metrics", ko: "Metrics 확인" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Open metrics when the app answers but feels busy. It shows traffic, WebSocket load, memory and the render queue for every process.",
                ko: "앱은 응답하는데 바빠 보이면 metrics를 보세요. 트래픽, WebSocket 부하, 메모리, 렌더링 대기열을 프로세스마다 보여 줍니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "Call it the same way; outside local it answers 401 without the token, the one to give a scraper. The second line picks two numbers per replica:",
                ko: "호출 방법은 같으며, local이 아니면 토큰 없이는 401로 답합니다. scraper에는 이 토큰을 줍니다. 두 번째 줄은 replica마다 숫자 두 개만 골라 봅니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            language="bash"
            title="Terminal"
            code={`curl -s -H "Authorization: Bearer $AKAN_STATUS_TOKEN" http://localhost:8282/_akan/app/metrics
curl -s -H "Authorization: Bearer $AKAN_STATUS_TOKEN" localhost:8282/_akan/app/metrics | jq '.children[].metrics | {activeRequests, rssBytes}'`}
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: "A trimmed response with a gateway in front:",
                ko: "gateway가 있을 때의 응답입니다(일부 생략):",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            language="json"
            title={l.trans({ en: "Response", ko: "응답" })}
            code={`{
  "rooms": 12,
  "sockets": 34,
  "gateway": {
    "rssBytes": 180000000,
    "heapUsedBytes": 72000000
  },
  "proxyHop": null,
  "children": [
    {
      "role": "all",
      "rooms": 12,
      "metrics": {
        "reportedAt": 1790223722512,
        "activeRequests": 2,
        "totalRequests": 136,
        "activeWebSockets": 10,
        "rssBytes": 420000000,
        "heapUsedBytes": 60000000,
        "rscWorkerRssBytes": 310000000,
        "eventLoopLagP99Ms": 6.8,
        "rscPendingRenderCount": 1
      }
    }
  ]
}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The top level is the gateway's view.</strong> <code>rooms</code> counts pubsub rooms with
                      a subscriber, and <code>sockets</code> the sockets subscribed to one.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>최상위는 gateway가 본 값입니다.</strong> <code>rooms</code>는 구독자가 있는 pubsub room
                      수, <code>sockets</code>는 room을 하나 이상 구독한 소켓 수입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>children</code> has one entry per replica.
                      </strong>{" "}
                      Its <code>metrics</code> carries that replica's traffic, memory and render numbers.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>children</code>에는 replica마다 항목이 하나씩 있습니다.
                      </strong>{" "}
                      그 안의 <code>metrics</code>에 해당 replica의 트래픽, 메모리, 렌더링 수치가 담깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Request and socket counts are live.</strong> The gateway counts{" "}
                      <code>activeRequests</code>, <code>totalRequests</code> and <code>activeWebSockets</code> as it
                      passes traffic on; memory, lag and render numbers are periodic samples.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>요청과 소켓 수는 실시간 값입니다.</strong> <code>activeRequests</code>,{" "}
                      <code>totalRequests</code>, <code>activeWebSockets</code>는 gateway가 트래픽을 넘기면서 바로
                      셉니다. 메모리, 지연, 렌더링 수치는 주기적인 샘플입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>
              {l.trans({ en: "With a gateway, or solo", ko: "gateway가 있을 때와 solo일 때" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "A solo replica has no gateway counting for it, so several fields come back empty:",
                ko: "solo에는 대신 세어 줄 gateway가 없어서, 몇몇 필드는 비어서 옵니다:",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Field", ko: "필드" })}
              columns={sideColumns}
              groups={metricGroups}
              markLabel={l.trans({ en: "Has a value", ko: "값이 있음" })}
              emptyLabel={l.trans({ en: "null, 0 or absent", ko: "null, 0 또는 없음" })}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="read" title={l.trans({ en: "How To Read", ko: "숫자 읽는 법" })}>
          <Docs.Title>{l.trans({ en: "How To Read", ko: "숫자 읽는 법" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "One snapshot rarely tells the story. Take a few samples a minute apart, and read each number against the question it answers.",
                ko: "스냅샷 하나로 알 수 있는 것은 많지 않습니다. 1분 간격으로 몇 번 받아 보고, 숫자마다 무엇을 알려 주는 값인지 따져 읽으세요.",
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Number", ko: "수치" })}
              descLabel={l.trans({ en: "What it tells you", ko: "알 수 있는 것" })}
              items={readRows}
            />
            <Docs.Alert type="info">
              {l.trans({
                en: (
                  <span>
                    <strong>Most numbers are samples, not live values.</strong> Memory, lag and render counts refresh
                    every <code>AKAN_MEMORY_LOG_INTERVAL_MS</code> (60 s by default), and <code>reportedAt</code> says
                    when. Compare responses at least one interval apart.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>대부분의 수치는 실시간 값이 아니라 샘플입니다.</strong> 메모리, 지연, 렌더링 수치는{" "}
                    <code>AKAN_MEMORY_LOG_INTERVAL_MS</code>(기본 60초)마다 새로 잡히고, 언제 잡혔는지는{" "}
                    <code>reportedAt</code>에 있습니다. 비교할 응답은 최소 한 주기 간격을 두고 받으세요.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="memory-log" title={l.trans({ en: "Memory Logs", ko: "메모리 로그" })}>
          <Docs.Title>{l.trans({ en: "Memory Logs", ko: "메모리 로그" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "When one metrics response cannot pin down a memory problem, log every sample and watch how the values move.",
                ko: "metrics 응답 하나로 메모리 문제를 잡기 어렵다면, 샘플마다 로그를 남기고 값이 어떻게 움직이는지 보세요.",
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    Set these in the environment the server starts with: the workspace <code>.env</code> locally, or the
                    container env in a deployment:
                  </span>
                ),
                ko: (
                  <span>
                    서버가 시작할 때 읽는 환경변수에 넣습니다. 로컬에서는 워크스페이스의 <code>.env</code>에, 배포에서는
                    컨테이너 env에 둡니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            language="bash"
            title=".env"
            showLineNumbers={false}
            code={`AKAN_MEMORY_LOG=1
AKAN_MEMORY_LOG_INTERVAL_MS=10000
AKAN_MEMORY_GC_ON_REPORT=1`}
          />
          <Docs.Description>
            <Docs.OptionTable items={memoryEnvItems} />
            <div>
              {l.trans({
                en: (
                  <span>
                    Each sample then prints one line per process. Pick those lines out of the running app with{" "}
                    <code>akan logs</code>:
                  </span>
                ),
                ko: (
                  <span>
                    그러면 샘플마다 프로세스당 한 줄이 찍힙니다. 실행 중인 앱에서 <code>akan logs</code>로 이 줄만 골라
                    봅니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            language="bash"
            title="Terminal"
            showLineNumbers={false}
            code={`akan logs <app> --grep "memory role="
# memory role=all pid=72129 rss=412.3MiB heapUsed=57.5MiB … rscWorkerRss=298.0MiB elLag=1.2/6.8/9.4ms`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>rss</code> and <code>rscWorkerRss</code> are two processes.
                      </strong>{" "}
                      Add them to see what the replica really costs.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>rss</code>와 <code>rscWorkerRss</code>는 서로 다른 프로세스입니다.
                      </strong>{" "}
                      둘을 더해야 replica가 실제로 쓰는 메모리가 됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>elLag</code> is mean/p99/max.
                      </strong>{" "}
                      It is event-loop lag in milliseconds since the previous sample.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>elLag</code>는 평균/p99/최대입니다.
                      </strong>{" "}
                      직전 샘플 이후 구간의 이벤트 루프 지연을 밀리초로 보여 줍니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The gateway's own line is at verbose.</strong> That is below the default <code>info</code>
                      , so set <code>AKAN_PUBLIC_LOG_LEVEL=verbose</code> to see it in the console.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>gateway 자신의 줄은 verbose 레벨입니다.</strong> 기본값 <code>info</code>보다 낮으므로
                      콘솔에서 보려면 <code>AKAN_PUBLIC_LOG_LEVEL=verbose</code>로 둡니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Turn <code>AKAN_MEMORY_GC_ON_REPORT</code> off once you are done.
                    </strong>{" "}
                    The forced GC pauses the process on every sample, even when <code>AKAN_MEMORY_LOG</code> is off.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      진단이 끝나면 <code>AKAN_MEMORY_GC_ON_REPORT</code>를 끄세요.
                    </strong>{" "}
                    강제 GC는 샘플마다 프로세스를 멈추게 하고, <code>AKAN_MEMORY_LOG</code>가 꺼져 있어도 실행됩니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="checklist" title={l.trans({ en: "Troubleshooting Order", ko: "확인 순서" })}>
          <Docs.Title>{l.trans({ en: "Troubleshooting Order", ko: "확인 순서" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Go from the cheapest question to the most detailed one, and stop as soon as you find the cause.",
                ko: "가장 가벼운 질문부터 자세한 질문 순으로 확인하고, 원인을 찾으면 거기서 멈추세요.",
              })}
            </div>
            <ol className="my-4 list-decimal space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Open health.</strong> If a replica is not <code>ready</code> or shows{" "}
                      <code>unhealthy</code>, fix startup first; <code>lastErrorMessage</code> and{" "}
                      <code>lastRestartReason</code> say why.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>health를 봅니다.</strong> replica가 <code>ready</code>가 아니거나 <code>unhealthy</code>
                      라면 시작 문제부터 해결합니다. 이유는 <code>lastErrorMessage</code>와{" "}
                      <code>lastRestartReason</code>에 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Open metrics.</strong> Check <code>activeRequests</code>, <code>activeWebSockets</code>,{" "}
                      <code>rooms</code>, memory and <code>eventLoopLagP99Ms</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>metrics를 봅니다.</strong> <code>activeRequests</code>, <code>activeWebSockets</code>,{" "}
                      <code>rooms</code>, 메모리, <code>eventLoopLagP99Ms</code>를 확인합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>If memory keeps growing,</strong> turn on memory logs and compare several samples.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>메모리가 계속 늘면</strong> 메모리 로그를 켜고 여러 샘플을 비교합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Find the cause in the logs.</strong> <code>akan logs &lt;app&gt;</code> shows which
                      endpoint, queue or render path made the numbers, and <code>AKAN_TRACE=1</code> adds per-endpoint
                      timings to metrics.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>원인은 로그에서 찾습니다.</strong> 어떤 endpoint, 큐, 렌더링 경로가 그 숫자를 만들었는지{" "}
                      <code>akan logs &lt;app&gt;</code>으로 확인하고, <code>AKAN_TRACE=1</code>을 켜면 metrics에
                      endpoint별 소요 시간이 붙습니다.
                    </span>
                  ),
                })}
              </li>
            </ol>
            <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "이어서 볼 문서" })}</Docs.SubSubTitle>
            <Docs.LinkGrid items={nextReads} />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
