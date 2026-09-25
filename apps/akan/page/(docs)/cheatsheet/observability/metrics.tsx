import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Health And Metrics", ko: "상태와 메트릭" })}>
        <Docs.Title>{l.trans({ en: "Health And Metrics", ko: "상태와 메트릭" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When an Akan app feels slow or does not respond, start with two runtime endpoints. Health tells you whether the app is alive, and metrics tells you how busy it is.",
              ko: "Akan 앱이 느리거나 응답하지 않을 때는 두 가지 런타임 endpoint부터 확인하세요. Health는 앱이 살아있는지 알려주고, metrics는 얼마나 바쁜지 알려줍니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`/_akan/app/health` checks gateway and child process status.",
                ko: "`/_akan/app/health`는 gateway와 child process 상태를 확인합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`/_akan/app/metrics` checks requests, sockets, rooms, and memory.",
                ko: "`/_akan/app/metrics`는 request, socket, room, memory를 확인합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use logs after metrics when you need the reason behind the numbers.",
                ko: "숫자의 이유가 필요하면 metrics 다음에 log를 확인하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="health" title={l.trans({ en: "Check Health", ko: "Health 확인" })}>
        <Docs.Title>{l.trans({ en: "Check Health", ko: "Health 확인" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use health first when the app does not open. It shows whether the gateway is running and whether child servers are ready.",
              ko: "앱이 열리지 않는다면 health를 먼저 보세요. Gateway가 실행 중인지, child server가 준비되었는지 확인할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          language="bash"
          title={l.trans({ en: "Health endpoint", ko: "Health endpoint" })}
          code={`curl http://localhost:8282/_akan/app/health`}
        />
        <Code.Snippet
          title={l.trans({ en: "Simplified response", ko: "단순화한 응답 예시" })}
          code={`{
  "status": "running",
  "children": [
    {
      "role": "federation",
      "status": "healthy",
      "ready": true,
      "pid": 12345
    }
  ]
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="metrics" title={l.trans({ en: "Check Metrics", ko: "Metrics 확인" })}>
        <Docs.Title>{l.trans({ en: "Check Metrics", ko: "Metrics 확인" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use metrics when the app is alive but feels busy. It gives a quick picture of traffic, WebSocket load, rooms, and process memory.",
              ko: "앱은 살아있지만 바빠 보일 때 metrics를 보세요. 트래픽, WebSocket 부하, room, 프로세스 메모리를 빠르게 볼 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          language="bash"
          title={l.trans({ en: "Metrics endpoint", ko: "Metrics endpoint" })}
          code={`curl http://localhost:8282/_akan/app/metrics`}
        />
        <Code.Snippet
          title={l.trans({ en: "Simplified response", ko: "단순화한 응답 예시" })}
          code={`{
  "rooms": 12,
  "sockets": 34,
  "gateway": {
    "rssBytes": 180000000,
    "heapUsedBytes": 72000000
  },
  "children": [
    {
      "role": "federation",
      "metrics": {
        "activeRequests": 2,
        "activeWebSockets": 10,
        "rscPendingRenderCount": 1
      }
    }
  ]
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="read" title={l.trans({ en: "How To Read", ko: "읽는 방법" })}>
        <Docs.Title>{l.trans({ en: "How To Read", ko: "읽는 방법" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`activeRequests` means requests currently being handled. If it stays high, a slow endpoint may be blocking work.",
                ko: "`activeRequests`는 현재 처리 중인 request입니다. 계속 높다면 느린 endpoint가 작업을 막고 있을 수 있습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`activeWebSockets` and `rooms` help you understand realtime connection load.",
                ko: "`activeWebSockets`와 `rooms`는 realtime 연결 부하를 이해하는 데 도움이 됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`rssBytes` and `heapUsedBytes` show memory size. Watch the trend, not only one snapshot.",
                ko: "`rssBytes`와 `heapUsedBytes`는 메모리 크기를 보여줍니다. 한 번의 값보다 추세를 보세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`rscPendingRenderCount` can hint that server rendering work is queued or waiting.",
                ko: "`rscPendingRenderCount`는 서버 렌더링 작업이 대기 중인지 볼 때 힌트가 됩니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="memory-log" title={l.trans({ en: "Memory Logs", ko: "메모리 로그" })}>
        <Docs.Title>{l.trans({ en: "Memory Logs", ko: "메모리 로그" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When a memory issue is hard to catch from one metrics response, turn on periodic memory logs and watch how the values change over time.",
              ko: "한 번의 metrics 응답으로 메모리 문제를 잡기 어렵다면 주기적인 메모리 로그를 켜고 값이 시간에 따라 어떻게 바뀌는지 보세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          language="bash"
          title={l.trans({ en: "Useful env", ko: "유용한 env" })}
          code={`AKAN_MEMORY_LOG=1
AKAN_MEMORY_LOG_INTERVAL_MS=10000
AKAN_MEMORY_GC_ON_REPORT=1`}
        />
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`AKAN_MEMORY_LOG=1` prints memory summaries periodically.",
                ko: "`AKAN_MEMORY_LOG=1`은 메모리 요약을 주기적으로 출력합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`AKAN_MEMORY_LOG_INTERVAL_MS` changes the report interval.",
                ko: "`AKAN_MEMORY_LOG_INTERVAL_MS`는 출력 주기를 바꿉니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`AKAN_MEMORY_GC_ON_REPORT=1` runs GC before reporting, useful for diagnosis.",
                ko: "`AKAN_MEMORY_GC_ON_REPORT=1`은 보고 전에 GC를 실행해 진단에 도움을 줍니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="checklist" title={l.trans({ en: "Troubleshooting Order", ko: "확인 순서" })}>
        <Docs.Title>{l.trans({ en: "Troubleshooting Order", ko: "확인 순서" })}</Docs.Title>
        <Docs.Description>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Open health. If a child is not ready or unhealthy, fix startup first.",
                ko: "Health를 봅니다. Child가 ready가 아니거나 unhealthy라면 먼저 시작 문제를 해결합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Open metrics. Check active requests, sockets, rooms, and memory.",
                ko: "Metrics를 봅니다. Active request, socket, room, memory를 확인합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "If memory keeps growing, enable memory logs and compare several samples.",
                ko: "메모리가 계속 늘면 memory log를 켜고 여러 샘플을 비교합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use app logs to find which endpoint, queue, or render path caused the numbers.",
                ko: "어떤 endpoint, queue, render path가 원인인지 app log로 확인합니다.",
              })}
            </li>
          </ol>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
