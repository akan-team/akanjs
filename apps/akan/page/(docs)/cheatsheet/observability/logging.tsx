import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const cardGrid = cardGridRecipe({ cols: "mdTwo" }, "my-4");
  const card = panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0");
  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";
  const levelType = "trace | verbose | debug | info | warn | error";
  const off = l.trans({ en: "off", ko: "꺼짐" });

  const termRows = [
    {
      name: "LogRecord",
      desc: l.trans({
        en: "What one Logger call becomes: level, logger name, process and, inside a request, its trace.",
        ko: "Logger 호출 한 번이 만드는 데이터입니다. 레벨, 로거 이름, 프로세스, 요청 안이라면 trace까지 담습니다.",
      }),
    },
    {
      name: "traceId",
      desc: l.trans({
        en: "An id shared by every line one request writes, such as `m8x1k2-a9f3c1`.",
        ko: "요청 하나가 남긴 모든 줄이 함께 갖는 id입니다. 예: `m8x1k2-a9f3c1`.",
      }),
    },
    {
      name: "sink",
      desc: l.trans({
        en: "A receiver registered with `Logger.addSink`, such as the rotating file or the hub.",
        ko: "`Logger.addSink`로 등록한 수신자입니다. 회전 로그 파일과 허브가 대표적입니다.",
      }),
    },
    {
      name: "floor",
      desc: l.trans({
        en: "The lowest level a sink or reader accepts. Records below it are dropped.",
        ko: "sink나 조회 도구가 받는 가장 낮은 레벨입니다. 그보다 낮은 레코드는 버려집니다.",
      }),
    },
    {
      name: "hub",
      desc: l.trans({
        en: "One journal of every process's records, kept by the gateway or by a solo replica.",
        ko: "모든 프로세스의 레코드를 한곳에 모은 저널입니다. gateway가, gateway가 없으면 단독 replica가 가집니다.",
      }),
    },
    {
      name: "child replica",
      desc: l.trans({
        en: "A server process behind the gateway. It sends its records to the hub over IPC.",
        ko: "gateway 뒤에서 도는 서버 프로세스입니다. 자기 레코드를 IPC로 허브에 올려 보냅니다.",
      }),
    },
  ];

  const recordRows = [
    {
      name: ["level", "sev"],
      desc: l.trans({
        en: "The level name and its OpenTelemetry severity number.",
        ko: "레벨 이름과 OpenTelemetry severity 숫자입니다.",
      }),
    },
    {
      name: ["name", "context"],
      desc: l.trans({
        en: "The logger name, and the context string passed as the second argument.",
        ko: "로거 이름과, 두 번째 인자로 넘긴 context 문자열입니다.",
      }),
    },
    {
      name: ["role", "replicaIdx", "pid"],
      desc: l.trans({
        en: "Which process wrote it. role is gateway, all, federation, batch or rsc-worker.",
        ko: "어느 프로세스가 썼는지입니다. role은 gateway, all, federation, batch, rsc-worker 중 하나입니다.",
      }),
    },
    {
      name: ["traceId", "endpoint", "origin"],
      desc: l.trans({
        en: "Filled only inside a request, such as `mutation:refundPayment` arriving over `http`.",
        ko: "요청 안에서만 채워집니다. 예: `http`로 들어온 `mutation:refundPayment`.",
      }),
    },
    {
      name: "attrs",
      desc: l.trans({
        en: "Structured key=value data attached with `Logger.emit`.",
        ko: "`Logger.emit`으로 붙인 구조화된 key=value 값입니다.",
      }),
    },
  ];

  const levelRows = [
    {
      name: "trace",
      sev: "1",
      desc: l.trans({
        en: "Every step, including the ones that are only interesting once.",
        ko: "모든 단계를 남깁니다. 한 번쯤만 궁금할 세부까지 포함합니다.",
      }),
    },
    {
      name: "verbose",
      sev: "3",
      desc: l.trans({
        en: "Detail a developer asks for on purpose. It is TRACE's upper tier, not a band of its own.",
        ko: "개발자가 일부러 켜서 보는 상세 내역입니다. 별도 대역이 아니라 TRACE 대역의 윗칸입니다.",
      }),
    },
    {
      name: "debug",
      sev: "5",
      desc: l.trans({
        en: "Diagnosis for one subsystem while you are working on it.",
        ko: "지금 손보는 하위 시스템 하나를 진단할 때 씁니다.",
      }),
    },
    {
      name: "info",
      sev: "9",
      desc: l.trans({
        en: "Normal lifecycle events. The production default.",
        ko: "정상적인 라이프사이클 이벤트입니다. 운영 기본값입니다.",
      }),
    },
    {
      name: "warn",
      sev: "13",
      desc: l.trans({
        en: "Recovered: it kept going, and somebody should know.",
        ko: "복구된 문제입니다. 처리는 계속됐지만 누군가는 알아야 합니다.",
      }),
    },
    {
      name: "error",
      sev: "17",
      desc: l.trans({
        en: "An operation failed or needs attention. Written to stderr, not stdout.",
        ko: "작업이 실패했거나 확인이 필요합니다. stdout이 아니라 stderr로 나갑니다.",
      }),
    },
  ];

  const fileNameRows = [
    {
      name: "appName-environment-operationMode",
      desc: l.trans({
        en: "App name, environment and operation mode, such as `myapp-local-local`.",
        ko: "앱 이름, 환경, 운영 모드입니다. 예: `myapp-local-local`.",
      }),
    },
    {
      name: "YYYY-MM-DD",
      desc: l.trans({
        en: "The local date. On a new date the sequence starts again at `0001`.",
        ko: "로컬 날짜입니다. 날짜가 바뀌면 sequence가 `0001`부터 다시 시작합니다.",
      }),
    },
    {
      name: "processKey",
      desc: l.trans({
        en: "`gateway`, `<replicaIdx>-<role>` for a child, or the role alone for a solo replica.",
        ko: "gateway는 `gateway`, child는 `<replicaIdx>-<role>`, 단독 replica는 role만 씁니다.",
      }),
    },
    {
      name: "sequence",
      desc: l.trans({
        en: "Four digits. A restart moves on to the next number instead of overwriting.",
        ko: "네 자리 번호입니다. 재시작하면 기존 파일을 덮어쓰지 않고 다음 번호로 넘어갑니다.",
      }),
    },
  ];

  const readingNotes = [
    l.trans({
      en: (
        <>
          <strong>Child lines carry a prefix</strong> such as <code>[child:0 all] [stderr]</code>, so one search shows
          which replica and which stream wrote them.
        </>
      ),
      ko: (
        <>
          <strong>child 줄에는 접두어가 붙습니다.</strong> <code>[child:0 all] [stderr]</code>처럼 어느 replica의 어느
          스트림인지 드러나므로 검색 한 번으로 찾을 수 있습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Child stderr reaches the file even when the terminal hides it.</strong> The gateway prints a child's
          stderr only with <code>AKAN_CHILD_STDERR=1</code>; a child's own Logger errors go to stdout, so they always
          show.
        </>
      ),
      ko: (
        <>
          <strong>child의 stderr는 터미널에 안 보여도 파일에는 남습니다.</strong> gateway는{" "}
          <code>AKAN_CHILD_STDERR=1</code>일 때만 child의 stderr를 터미널에 출력합니다. child 자신의 Logger 오류는
          stdout으로 나가므로 늘 보입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>console.log</code> in a child is captured
          </strong>{" "}
          through its stdout/stderr pipes. In the gateway process it bypasses the Logger sinks, so use Logger in runtime
          code.
        </>
      ),
      ko: (
        <>
          <strong>
            child의 <code>console.log</code>는 저장됩니다.
          </strong>{" "}
          stdout/stderr 파이프로 잡히기 때문입니다. gateway 프로세스에서는 Logger sink를 거치지 않으므로, 런타임
          코드에서는 Logger를 쓰세요.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>akan start</code> also writes <code>dev.log</code>
          </strong>{" "}
          in the runtime directory: every process of the app plus the dev host's build output, with no ANSI. The
          previous session stays as <code>dev.prev.log</code>.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>akan start</code>는 <code>dev.log</code>도 씁니다.
          </strong>{" "}
          runtime 디렉터리에 앱의 모든 프로세스와 dev host의 빌드 출력을 ANSI 없이 모읍니다. 직전 세션은{" "}
          <code>dev.prev.log</code>로 남습니다.
        </>
      ),
    }),
  ];

  const tailCards = [
    {
      title: l.trans({ en: "Filters Combine", ko: "필터는 겹쳐 적용됩니다" }),
      desc: l.trans({
        en: (
          <>
            Flags AND together; a comma list inside one flag is an OR. <code>*</code> is the only wildcard, for
            endpoints and logger names, and an endpoint reads <code>type:key</code>, as in{" "}
            <code>mutation:refundPayment</code> or <code>{"page:<routeId>"}</code>.
          </>
        ),
        ko: (
          <>
            플래그끼리는 AND, 한 플래그 안의 쉼표 목록은 OR입니다. 와일드카드는 endpoint와 로거 이름에 쓰는{" "}
            <code>*</code> 하나뿐이고, endpoint는 <code>mutation:refundPayment</code>, <code>{"page:<routeId>"}</code>
            처럼 <code>type:key</code> 모양입니다.
          </>
        ),
      }),
    },
    {
      title: l.trans({ en: "Free While Nobody Watches", ko: "보는 사람이 없으면 비용 0" }),
      desc: l.trans({
        en: (
          <>
            A child forwards over IPC only while a subscriber wants that level; under ndjson it always sends what stdout
            carries. <code>AKAN_LOG_STREAM=1</code> forwards everything, always.
          </>
        ),
        ko: (
          <>
            child는 구독자가 그 레벨을 원하는 동안에만 IPC로 레코드를 올리고, ndjson에서는 stdout에 실릴 레코드를 늘
            올립니다. <code>AKAN_LOG_STREAM=1</code>이면 모든 레코드를 항상 올립니다.
          </>
        ),
      }),
    },
    {
      title: l.trans({ en: "Bounded Ring", ko: "크기가 정해진 링" }),
      desc: l.trans({
        en: (
          <>
            The hub owner keeps 2,000 records or 4MB (<code>AKAN_LOG_BUFFER</code>, <code>AKAN_LOG_BUFFER_MB</code>).
            More than 20 identical lines a second fold into one &quot;suppressed&quot; line.
          </>
        ),
        ko: (
          <>
            허브 소유 프로세스는 레코드 2,000건 또는 4MB까지 보관합니다(<code>AKAN_LOG_BUFFER</code>,{" "}
            <code>AKAN_LOG_BUFFER_MB</code>). 같은 줄이 1초에 20번을 넘으면 &quot;suppressed&quot; 한 줄로 접힙니다.
          </>
        ),
      }),
    },
    {
      title: l.trans({ en: "Lines Without Context", ko: "문맥이 없는 줄" }),
      desc: l.trans({
        en: (
          <>
            Gateway-internal lines, the scheduler's own started/finished lines and unauthenticated primitive GET queries
            on the fast path carry no traceId or endpoint. <code>AKAN_LOG_CONTEXT=0</code> turns request context off
            everywhere.
          </>
        ),
        ko: (
          <>
            gateway 내부 줄, 스케줄러 자체의 started/finished 줄, fast path로 처리되는 비인증 primitive GET 쿼리에는
            traceId와 endpoint가 없습니다. <code>AKAN_LOG_CONTEXT=0</code>은 요청 문맥을 전부 끕니다.
          </>
        ),
      }),
    },
  ];

  const requestCards = [
    {
      title: l.trans({ en: "Request Line", ko: "요청 요약 줄" }),
      desc: l.trans({
        en: "Writes one record when a call ends, so a request is one line to grep instead of a dozen.",
        ko: "호출이 끝날 때 레코드 하나를 씁니다. 요청 하나가 열두 줄이 아니라 grep 한 줄이 됩니다.",
      }),
      chip: "AKAN_LOG_CANONICAL=1",
    },
    {
      title: l.trans({ en: "Flight Recorder", ko: "flight recorder" }),
      desc: l.trans({
        en: "Holds each call's records below the level and promotes them, marked flight=true, only if it failed or ran long.",
        ko: "호출마다 레벨에 못 미쳐 버려질 레코드를 들고 있다가, 실패했거나 오래 걸렸을 때만 flight=true로 표시해 올립니다.",
      }),
      chip: "AKAN_LOG_FLIGHT=1",
    },
  ];

  const canonicalRows = [
    {
      name: "ok | error <endpoint>",
      desc: l.trans({
        en: "The message. A clean call is written at info, a failed one at warn.",
        ko: "메시지입니다. 정상 호출은 info, 실패한 호출은 warn으로 씁니다.",
      }),
    },
    {
      name: ["ms", "status"],
      desc: l.trans({
        en: "Duration and status. On failure, status is the error's statusCode, or 500.",
        ko: "걸린 시간과 status입니다. 실패하면 에러의 statusCode, 없으면 500입니다.",
      }),
    },
    {
      name: "userId",
      desc: l.trans({
        en: "The caller's account id, once the call knows who is asking.",
        ko: "호출자를 알게 된 경우 그 계정 id입니다.",
      }),
    },
    {
      name: ["db", "dbMs", "cacheHit"],
      desc: l.trans({
        en: "Query count, query time and cache hit ratio, only under `AKAN_TRACE=1`.",
        ko: "쿼리 수, 쿼리 시간, 캐시 적중률입니다. `AKAN_TRACE=1`일 때만 붙습니다.",
      }),
    },
    {
      name: "err",
      desc: l.trans({
        en: "The first line of the error message, cut at 200 characters.",
        ko: "에러 메시지의 첫 줄입니다. 200자에서 자릅니다.",
      }),
    },
  ];

  const requestNotes = [
    l.trans({
      en: (
        <>
          <strong>Promoted lines pass every floor.</strong> A <code>flight=true</code> or <code>debug=true</code> record
          was asked for below the level, so a forwarder's floor, the stdout level and <code>--level</code> let it
          through.
        </>
      ),
      ko: (
        <>
          <strong>승격된 줄은 모든 floor를 통과합니다.</strong> <code>flight=true</code>나 <code>debug=true</code>{" "}
          레코드는 레벨 아래에서 일부러 요청된 것이므로, forwarder의 floor, stdout 레벨, <code>--level</code> 필터가
          모두 통과시킵니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Nothing is printed twice.</strong> Only lines no one wrote are promoted; if a call overflowed its
          64-record ring, the first promoted line carries <code>flightEvicted=N</code>.
        </>
      ),
      ko: (
        <>
          <strong>같은 줄이 두 번 찍히지 않습니다.</strong> 아직 어디에도 쓰이지 않은 줄만 승격되고, 호출이 64건 링을
          넘쳤다면 첫 승격 줄에 <code>flightEvicted=N</code>이 붙습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A wrong header value is ignored, not refused.</strong> The request simply runs at the normal level.
        </>
      ),
      ko: (
        <>
          <strong>헤더 값이 틀리면 거절하지 않고 무시합니다.</strong> 요청은 평소 레벨로 그대로 실행됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Measured cost:</strong> the recorder adds about 190ns to a clean call, and the gate about 20ns per
          rejected log call inside a trace. Both are off by default; the memory cap is the operator's decision.
        </>
      ),
      ko: (
        <>
          <strong>측정한 비용:</strong> recorder는 정상 호출에 약 190ns, 게이트는 trace 안에서 걸러지는 로그 호출마다 약
          20ns를 더합니다. 둘 다 기본값은 꺼짐이고, 메모리 상한은 운영자가 정합니다.
        </>
      ),
    }),
  ];

  const collectionNotes = [
    l.trans({
      en: (
        <>
          <strong>One writer.</strong> Under <code>AKAN_LOG_FORMAT=ndjson</code> the hub owner alone writes stdout, one
          JSON record per line; every other process turns its console off.
        </>
      ),
      ko: (
        <>
          <strong>writer는 하나입니다.</strong> <code>AKAN_LOG_FORMAT=ndjson</code>이면 허브 소유 프로세스만 stdout에 한
          줄에 JSON 하나씩 쓰고, 나머지 프로세스는 콘솔 출력을 끕니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Stray output is wrapped.</strong> Anything written past Logger, a crash stack included, becomes a{" "}
          <code>raw=true</code> record, so the stream stays valid JSON.
        </>
      ),
      ko: (
        <>
          <strong>Logger 밖의 출력도 감쌉니다.</strong> Logger를 거치지 않고 쓴 것은 크래시 스택까지{" "}
          <code>raw=true</code> 레코드가 되므로, 스트림은 계속 유효한 JSON입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Order by <code>seq</code>, not <code>at</code>.
          </strong>{" "}
          <code>at</code> comes from several processes' clocks; <code>seq</code> is the hub's arrival order.
        </>
      ),
      ko: (
        <>
          <strong>
            정렬은 <code>at</code>이 아니라 <code>seq</code>로 합니다.
          </strong>{" "}
          <code>at</code>은 여러 프로세스의 시계에서 오고, <code>seq</code>는 허브에 도착한 순서입니다.
        </>
      ),
    }),
  ];

  const composeNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>AKAN_LOG_TO_FILE: &quot;0&quot;</code> is already the image default.
          </strong>{" "}
          The writable layer is ephemeral, and files under ndjson drop the hub floor to trace, so every child forwards
          everything over IPC.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>AKAN_LOG_TO_FILE: &quot;0&quot;</code>은 이미지 기본값입니다.
          </strong>{" "}
          쓰기 레이어는 사라지는 공간이고, ndjson에서 파일을 켜면 허브 floor가 trace로 내려가 모든 child가 모든 레코드를
          IPC로 올립니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>AKAN_LOG_STDOUT_LEVEL: info</code>
          </strong>{" "}
          because kubelet rotates container logs by size, and trace volume can rotate lines away before the agent reads
          them.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>AKAN_LOG_STDOUT_LEVEL: info</code>로 둡니다.
          </strong>{" "}
          kubelet은 컨테이너 로그를 크기 기준으로 회전하므로, trace만큼 쏟아내면 에이전트가 읽기 전에 밀려납니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>json-file</code> never rotates unless told to.
          </strong>{" "}
          Set <code>max-size</code> and <code>max-file</code>, or switch the driver to a collector.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>json-file</code>은 설정하지 않으면 회전하지 않습니다.
          </strong>{" "}
          <code>max-size</code>와 <code>max-file</code>을 주거나, 드라이버를 수집기로 바꾸세요.
        </>
      ),
    }),
  ];

  const streamRows = [
    {
      name: "AKAN_LOG_STREAM_TOKEN",
      desc: l.trans({
        en: "Unset, the route does not exist at all. It is absent, not a 403.",
        ko: "설정하지 않으면 라우트가 아예 없습니다. 403을 답하는 것이 아니라 존재하지 않습니다.",
      }),
    },
    {
      name: "Authorization: Bearer",
      desc: l.trans({
        en: "A missing or wrong token is answered with 401.",
        ko: "토큰이 없거나 틀리면 401로 답합니다.",
      }),
    },
    {
      name: "?level=&endpoint=…",
      desc: l.trans({
        en: "The `akan logs` filters, plus `name`, `stream` and `limit`.",
        ko: "`akan logs`와 같은 필터에 `name`, `stream`, `limit`을 더 받습니다.",
      }),
    },
    {
      name: ["id", "Last-Event-ID"],
      desc: l.trans({
        en: "Each event's id is the hub seq, so a reconnect resumes where it left off.",
        ko: "이벤트 id는 허브 seq입니다. 다시 연결하면 끊긴 곳부터 이어 받습니다.",
      }),
    },
    {
      name: ": heartbeat",
      desc: l.trans({
        en: "A heartbeat comment every 15 seconds, and a 2-second reconnect hint.",
        ko: "15초마다 heartbeat 주석을 보내고, 재연결 간격 힌트는 2초입니다.",
      }),
    },
  ];

  const gapRows = [
    {
      name: "ring-buffer-evicted",
      desc: l.trans({
        en: "The ring already dropped part of the range. The event carries from, to and missed.",
        ko: "링이 그 구간 일부를 이미 밀어냈습니다. 이벤트에 from, to, missed가 실립니다.",
      }),
    },
    {
      name: "sequence-reset",
      desc: l.trans({
        en: "The id is past the current seq, so a restarted process is answering.",
        ko: "id가 현재 seq보다 큽니다. 재시작한 프로세스가 답하고 있다는 뜻입니다.",
      }),
    },
  ];

  const streamNotes = [
    l.trans({
      en: (
        <>
          <strong>Only the hub owner serves it:</strong> the gateway, or a solo replica. A child behind a gateway does
          not, so a token alone never reaches one.
        </>
      ),
      ko: (
        <>
          <strong>허브 소유 프로세스만 제공합니다.</strong> gateway 또는 단독 replica입니다. gateway 뒤의 child는
          제공하지 않으므로, 토큰만으로는 child에 닿을 수 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>It is not the collection path.</strong> A subscription loses a pod restart's whole gap and needs a
          route to every pod. Watch one process with it; ship what must be kept through stdout and the node agent.
        </>
      ),
      ko: (
        <>
          <strong>수집 경로가 아닙니다.</strong> 구독은 pod가 재시작하는 동안의 구간을 통째로 잃고, pod마다 따로 붙어야
          합니다. 지금 프로세스 하나를 볼 때 쓰고, 보관할 로그는 stdout과 노드 에이전트로 보내세요.
        </>
      ),
    }),
  ];

  const checklist = [
    l.trans({
      en: (
        <>
          <strong>Keep terminal logs readable.</strong> Use <code>AKAN_PUBLIC_LOG_LEVEL=info</code> or <code>warn</code>{" "}
          in production, and raise it only for a live debugging session.
        </>
      ),
      ko: (
        <>
          <strong>터미널 로그는 읽을 수 있게 유지합니다.</strong> 운영에서는 <code>AKAN_PUBLIC_LOG_LEVEL=info</code>나{" "}
          <code>warn</code>을 쓰고, 실시간 디버깅할 때만 잠깐 올립니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Give every sink a floor.</strong> Pass <code>minLevel</code> to <code>Logger.addSink</code>; a sink
          without one follows <code>AKAN_LOG_FILE_LEVEL</code>, which is trace.
        </>
      ),
      ko: (
        <>
          <strong>모든 sink에 floor를 줍니다.</strong> <code>Logger.addSink</code>에 <code>minLevel</code>을 넘기세요.
          없으면 <code>AKAN_LOG_FILE_LEVEL</code>, 즉 trace를 따릅니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Never log per delivered record.</strong> Anything that delivers records (a forwarder, a sink, the
          stream route) must not log per item, or it feeds on its own output.
        </>
      ),
      ko: (
        <>
          <strong>레코드를 전달할 때마다 로그를 남기지 않습니다.</strong> forwarder, sink, 스트림 라우트처럼 레코드를
          전달하는 코드가 항목마다 로그를 남기면 자기 출력을 다시 먹습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Plan disk usage.</strong> <code>AKAN_LOG_MAX_SIZE_MB</code> and <code>AKAN_LOG_MAX_FILES</code> apply
          per process key, so replicas multiply the maximum.
        </>
      ),
      ko: (
        <>
          <strong>디스크 사용량을 계획합니다.</strong> <code>AKAN_LOG_MAX_SIZE_MB</code>와{" "}
          <code>AKAN_LOG_MAX_FILES</code>는 process key마다 적용되므로 replica 수만큼 최대 사용량이 늘어납니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Keep secrets out of messages.</strong> Redaction covers only attrs keys that name a secret. A token
          interpolated into the text is not redacted, and file logs outlive the terminal.
        </>
      ),
      ko: (
        <>
          <strong>메시지에 비밀값을 넣지 않습니다.</strong> 가림 처리는 비밀값을 뜻하는 attrs 키에만 적용됩니다.
          문자열에 끼워 넣은 토큰은 가려지지 않고, 파일 로그는 터미널 출력보다 오래 남습니다.
        </>
      ),
    }),
  ];

  const relatedLinks = [
    {
      href: "/cheatsheet/observability/metrics",
      title: l.trans({ en: "Health And Metrics", ko: "상태와 메트릭" }),
      desc: l.trans({
        en: "Read process health and request metrics next to the logs.",
        ko: "로그와 함께 프로세스 상태와 요청 메트릭을 봅니다.",
      }),
    },
    {
      href: "/cheatsheet/dev/console",
      title: l.trans({ en: "Server Console", ko: "서버 콘솔" }),
      desc: l.trans({
        en: "Where .tail and .trace run against a live server.",
        ko: ".tail과 .trace를 실행 중인 서버에 거는 곳입니다.",
      }),
    },
    {
      href: "/cheatsheet/dev/docker",
      title: l.trans({ en: "Docker", ko: "Docker" }),
      desc: l.trans({
        en: "The container env the generated image sets, logging included.",
        ko: "생성된 이미지가 넣는 컨테이너 env입니다. 로깅 설정도 포함됩니다.",
      }),
    },
    {
      href: "/cheatsheet/dev/k8s",
      title: l.trans({ en: "Kubernetes", ko: "Kubernetes" }),
      desc: l.trans({
        en: "Deploying the app image to a Kubernetes cluster.",
        ko: "앱 이미지를 Kubernetes 클러스터에 배포합니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="logging-overview" title={l.trans({ en: "Runtime Logging", ko: "런타임 로깅" })}>
        <Docs.Title>{l.trans({ en: "Runtime Logging", ko: "런타임 로깅" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A customer says a refund failed around four o'clock. With only twelve replicas' worth of stdout, nothing tells you which lines belonged to that call.",
              ko: "고객이 네 시쯤 환불이 실패했다고 합니다. replica 열두 개가 쏟아낸 stdout만으로는 어느 줄이 그 호출의 것인지 알 수 없습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  Akan makes every log line a record first. Lines from one request share a <code>traceId</code>, so the
                  question above becomes one command: <code>{"akan logs myapp --trace <id>"}</code>.
                </span>
              ),
              ko: (
                <span>
                  Akan은 로그 한 줄을 먼저 레코드로 만듭니다. 한 요청의 줄은 같은 <code>traceId</code>를 가지므로, 위
                  질문은 <code>{"akan logs myapp --trace <id>"}</code> 명령 하나로 끝납니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "What a record carries", ko: "레코드에 실리는 것" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={recordRows} />
          <Docs.Flow
            title={l.trans({
              en: "One record, from the call to the collector",
              ko: "레코드 하나가 호출에서 수집기까지 가는 길",
            })}
            direction="TB"
            nodes={{
              call: { label: "this.logger.info(...)" },
              record: {
                label: "LogRecord",
                lines: ["level · name · role · replicaIdx", "traceId · endpoint · origin · attrs"],
              },
              sinks: {
                label: "Sink",
                lines: [
                  l.trans({
                    en: "floor: minLevel, else AKAN_LOG_FILE_LEVEL",
                    ko: "floor: minLevel, 없으면 AKAN_LOG_FILE_LEVEL",
                  }),
                ],
              },
              child: {
                label: l.trans({ en: "Child replica", ko: "child replica" }),
                lines: [l.trans({ en: "LogForwarder over IPC", ko: "LogForwarder가 IPC로 전송" })],
              },
              owner: {
                label: l.trans({ en: "Hub owner", ko: "허브 소유 프로세스" }),
                lines: [l.trans({ en: "gateway, or the solo replica", ko: "gateway 또는 단독 replica" })],
              },
              ring: {
                label: l.trans({ en: "Ring buffer", ko: "링 버퍼" }),
                lines: [l.trans({ en: "up to AKAN_LOG_BUFFER records", ko: "AKAN_LOG_BUFFER건까지 보관" })],
              },
              stdout: {
                label: l.trans({ en: "Container stdout", ko: "컨테이너 stdout" }),
                lines: [l.trans({ en: "text or ndjson", ko: "text 또는 ndjson" })],
              },
              file: {
                label: l.trans({ en: "Rotating file", ko: "회전 로그 파일" }),
                lines: ["AKAN_LOG_TO_FILE"],
              },
              socket: { label: "akan-control.sock", lines: ["akan logs · .tail"] },
              sse: { label: "GET /_akan/app/logs", lines: ["SSE"] },
            }}
            edges={[
              ["call", "record"],
              ["record", "sinks"],
              ["sinks", "child"],
              ["sinks", "owner"],
              ["child", "owner"],
              ["owner", "ring"],
              ["owner", "stdout"],
              ["owner", "file"],
              ["ring", "socket"],
              ["ring", "sse"],
            ]}
            emphasis={["owner"]}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Never call <code>logger.log()</code>.
                  </strong>{" "}
                  It reads like a level of its own but emits at <code>info</code>, so a line meant to stay quiet shows
                  up in production output. Write <code>.info()</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>logger.log()</code>는 호출하지 마세요.
                  </strong>{" "}
                  별도 레벨처럼 보이지만 실제로는 <code>info</code>로 나가서, 조용해야 할 줄이 운영 출력에 찍힙니다.{" "}
                  <code>.info()</code>를 쓰세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="using-logger" title={l.trans({ en: "Using Logger", ko: "Logger 사용법" })}>
        <Docs.Title>{l.trans({ en: "Using Logger", ko: "Logger 사용법" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Services and adapters already carry <code>this.logger</code>, named after the service or adapter. Pick
                  the method that matches the intent:
                </span>
              ),
              ko: (
                <span>
                  서비스와 어댑터에는 그 이름이 붙은 <code>this.logger</code>가 이미 있습니다. 의도에 맞는 메서드를 골라
                  씁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/invoice/invoice.service.ts"
            code={`import { BillingApi } from "@apps/myapp/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";

export class InvoiceService extends serve(db.invoice, ({ plug }) => ({
  billingApi: plug(BillingApi),
})) {
  async syncInvoice(invoiceId: string) {
    this.logger.debug(\`sync start invoiceId=\${invoiceId}\`, "invoice-sync");
    const pushed = await this.billingApi.pushInvoice(invoiceId);
    if (!pushed) {
      this.logger.warn(\`sync skipped invoiceId=\${invoiceId}\`, "invoice-sync");
      return false;
    }
    this.logger.info(\`sync complete invoiceId=\${invoiceId}\`, "invoice-sync");
    return true;
  }
}`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The second argument is a context string.</strong> It prints as <code>[invoice-sync]</code>{" "}
                    after the level; add it when one logger handles several jobs.
                  </>
                ),
                ko: (
                  <>
                    <strong>두 번째 인자는 context 문자열입니다.</strong> 레벨 뒤에 <code>[invoice-sync]</code>로
                    찍힙니다. 로거 하나가 여러 작업을 맡을 때 넣으세요.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>error</code> goes to stderr,
                    </strong>{" "}
                    every other level to stdout. An adapter catches, logs with <code>this.logger.error</code>, and
                    returns <code>null</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>error</code>는 stderr로,
                    </strong>{" "}
                    나머지 레벨은 stdout으로 나갑니다. 어댑터는 예외를 잡아 <code>this.logger.error</code>로 남기고{" "}
                    <code>null</code>을 돌려줍니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Outside a service or adapter,</strong> create one with{" "}
                    <code>{'new Logger("CsvImporter")'}</code>, or call the static{" "}
                    <code>Logger.info(msg, context, name)</code> for a one-off line.
                  </>
                ),
                ko: (
                  <>
                    <strong>서비스나 어댑터 밖에서는</strong> <code>{'new Logger("CsvImporter")'}</code>로 만들거나, 한
                    번만 쓸 줄이라면 정적 메서드 <code>Logger.info(msg, context, name)</code>를 부릅니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "Structured values go in attrs", ko: "구조화된 값은 attrs에 넣습니다" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A value you will filter or query on belongs in <code>attrs</code>, not in the message text:
                </span>
              ),
              ko: (
                <span>
                  나중에 거르거나 쿼리할 값은 메시지 문자열이 아니라 <code>attrs</code>에 넣습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/invoice/invoice.service.ts"
            code={`import { Logger } from "akanjs/common";

Logger.emit({
  level: "info",
  name: "InvoiceService",
  message: "invoice pushed",
  attrs: { invoiceId, vendor: "stripe", ms: elapsed },
});`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>One call, two readers.</strong> Text output prints attrs as <code>key=value</code> after the
                    message, and ndjson carries them as a JSON object, so a terminal can grep and a collector can query.
                  </>
                ),
                ko: (
                  <>
                    <strong>호출 한 번으로 두 곳에서 읽힙니다.</strong> 텍스트 출력에서는 메시지 뒤에{" "}
                    <code>key=value</code>로, ndjson에서는 JSON 객체로 실립니다. 터미널에서는 grep, 수집기에서는 쿼리가
                    됩니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Values are primitives:</strong> <code>string</code>, <code>number</code>,{" "}
                    <code>boolean</code> or <code>null</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>값은 원시값만 받습니다.</strong> <code>string</code>, <code>number</code>,{" "}
                    <code>boolean</code>, <code>null</code> 중 하나여야 합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Secret-looking keys are masked before the record exists.</strong> A key containing token,
                    password, passwd, jwt, authorization, cookie, secret, api_key or private_key, in any case, becomes{" "}
                    <code>&quot;[redacted]&quot;</code>, so no sink ever sees the value.
                  </>
                ),
                ko: (
                  <>
                    <strong>비밀값처럼 보이는 키는 레코드가 만들어질 때 가려집니다.</strong> token, password, passwd,
                    jwt, authorization, cookie, secret, api_key, private_key를 포함하는 키는 대소문자와 상관없이{" "}
                    <code>&quot;[redacted]&quot;</code>가 되므로, 어떤 sink도 원래 값을 보지 못합니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="log-levels" title={l.trans({ en: "Log Levels", ko: "로그 레벨" })}>
        <Docs.Title>{l.trans({ en: "Log Levels", ko: "로그 레벨" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "There are six levels. The number beside each is its OpenTelemetry severity, not an index from 0 to 5.",
              ko: "레벨은 여섯 개입니다. 옆의 숫자는 0~5 순번이 아니라 OpenTelemetry severity 값입니다.",
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "name", label: l.trans({ en: "Level", ko: "레벨" }), code: true },
              { key: "sev", label: l.trans({ en: "Severity", ko: "심각도" }), code: true },
              { key: "desc", label: l.trans({ en: "Description", ko: "설명" }) },
            ]}
            rows={levelRows}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  ndjson output, the SSE payload and a numeric <code>--level</code> filter all carry this number, so a
                  table that renumbers the levels disagrees with the wire.
                </span>
              ),
              ko: (
                <span>
                  ndjson 출력, SSE 페이로드, 숫자로 준 <code>--level</code> 필터가 모두 이 값을 씁니다. 번호를 새로
                  매기면 실제로 오가는 데이터와 어긋납니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Three level settings", ko: "레벨 설정 세 가지" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Each answers a different question: what a person at the terminal wants, what stdout ships to a collector, and how deep a sink with no floor goes.",
              ko: "세 설정은 서로 다른 질문에 답합니다. 터미널을 보는 사람이 원하는 범위, stdout이 수집기로 보낼 범위, floor 없는 sink가 내려갈 깊이입니다.",
            })}
          </div>
          <Docs.OptionTable
            items={[
              {
                key: "AKAN_PUBLIC_LOG_LEVEL",
                type: levelType,
                default: "info",
                desc: l.trans({
                  en: "The console level. `log` means info (deprecated); an unknown name silently becomes info.",
                  ko: "콘솔 레벨입니다. `log`는 info로 읽히고(폐기 예정), 모르는 이름은 조용히 info가 됩니다.",
                }),
              },
              {
                key: "AKAN_LOG_STDOUT_LEVEL",
                type: levelType,
                default: "AKAN_PUBLIC_LOG_LEVEL",
                desc: l.trans({
                  en: "What stdout carries. Overrides `AKAN_PUBLIC_LOG_LEVEL`; in ndjson, also a child's forwarding floor.",
                  ko: "stdout이 싣는 레벨입니다. 설정하면 `AKAN_PUBLIC_LOG_LEVEL`보다 우선하고, ndjson에서는 child가 올려 보내는 기준선도 됩니다.",
                }),
              },
              {
                key: "AKAN_LOG_FILE_LEVEL",
                type: levelType,
                default: "trace",
                desc: l.trans({
                  en: "The floor for every sink without `minLevel`, the rotating file and the hub included.",
                  ko: "`minLevel`이 없는 모든 sink의 기준선입니다. 회전 로그 파일과 허브도 여기에 해당합니다.",
                }),
              },
            ]}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  To change them at runtime, call <code>Logger.setLevel(level)</code> and{" "}
                  <code>Logger.setFileLevel(level)</code>.
                </span>
              ),
              ko: (
                <span>
                  실행 중에 바꾸려면 <code>Logger.setLevel(level)</code>과 <code>Logger.setFileLevel(level)</code>을
                  부릅니다.
                </span>
              ),
            })}
          </div>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Give every sink a floor: <code>{'Logger.addSink(sink, { minLevel: "info" })'}</code>.
                  </strong>{" "}
                  A sink without one follows <code>AKAN_LOG_FILE_LEVEL</code>, which defaults to <code>trace</code>. One
                  floorless sink makes every <code>trace</code> and <code>verbose</code> call in the process build a
                  record instead of being rejected at the level check.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    모든 sink에 floor를 주세요: <code>{'Logger.addSink(sink, { minLevel: "info" })'}</code>.
                  </strong>{" "}
                  floor가 없는 sink는 <code>AKAN_LOG_FILE_LEVEL</code>을 따르고, 그 기본값은 <code>trace</code>입니다.
                  이런 sink가 하나만 있어도 프로세스의 모든 <code>trace</code>·<code>verbose</code> 호출이 레벨 검사에서
                  걸러지지 않고 레코드를 만듭니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="file-logging" title={l.trans({ en: "File Logging & Rotation", ko: "파일 로그와 로테이션" })}>
        <Docs.Title>{l.trans({ en: "File Logging & Rotation", ko: "파일 로그와 로테이션" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A server writes rotating log files under <code>{"<runtimeDir>/logs"}</code>. Each process gets its own
                  file and rotates on its own, by local date and by size.
                </span>
              ),
              ko: (
                <span>
                  서버는 <code>{"<runtimeDir>/logs"}</code> 아래에 회전 로그 파일을 씁니다. 프로세스마다 파일이 따로
                  있고, 로컬 날짜와 파일 크기 기준으로 각자 회전합니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  Under <code>akan start</code>, the gateway and each child replica write their own file:
                </span>
              ),
              ko: (
                <span>
                  <code>akan start</code>로 띄우면 gateway와 child replica가 각자 파일을 씁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="local/apps/myapp/runtime/logs"
            language="markdown"
            showLineNumbers={false}
            code={`myapp-local-local-2026-05-25-gateway-0001.log
myapp-local-local-2026-05-25-0-all-0001.log
myapp-local-local-2026-05-25-1-federation-0001.log`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  Every name follows <code>appName-environment-operationMode-YYYY-MM-DD-processKey-sequence.log</code>:
                </span>
              ),
              ko: (
                <span>
                  파일 이름은 모두 <code>appName-environment-operationMode-YYYY-MM-DD-processKey-sequence.log</code>{" "}
                  형식입니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Name part", ko: "이름 부분" })}
            descLabel={l.trans({ en: "Meaning", ko: "뜻" })}
            items={fileNameRows}
          />
          <Docs.OptionTable
            items={[
              {
                key: "AKAN_LOG_TO_FILE",
                type: "0 | 1",
                default: l.trans({ en: "on (0 in the Docker image)", ko: "켜짐 (Docker 이미지는 0)" }),
                desc: l.trans({
                  en: "Only the exact string `0` turns file logging off; `false` does not.",
                  ko: "정확히 문자열 `0`일 때만 파일 로그가 꺼집니다. `false`로는 꺼지지 않습니다.",
                }),
              },
              {
                key: "AKAN_LOG_DIR",
                type: "string",
                default: "<runtimeDir>/logs",
                desc: l.trans({
                  en: "Log directory. A relative path resolves from the process's working directory.",
                  ko: "로그 디렉터리입니다. 상대 경로는 프로세스의 작업 디렉터리 기준으로 풉니다.",
                }),
              },
              {
                key: "AKAN_LOG_MAX_SIZE_MB",
                type: "number",
                default: "50",
                desc: l.trans({
                  en: "Past this size, writing moves on to the next sequence file.",
                  ko: "이 크기를 넘으면 다음 sequence 파일로 넘어갑니다.",
                }),
              },
              {
                key: "AKAN_LOG_MAX_FILES",
                type: "number",
                default: "100",
                desc: l.trans({
                  en: "Newest files kept per process key. Older ones are deleted.",
                  ko: "process key마다 남기는 최신 파일 수입니다. 더 오래된 파일은 지웁니다.",
                }),
              },
            ]}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      Where <code>{"<runtimeDir>"}</code> is:
                    </strong>{" "}
                    <code>runtime/</code> under <code>NODE_ENV=production</code>, otherwise{" "}
                    <code>{"local/apps/<app>/runtime"}</code>. <code>AKAN_RUNTIME_DIR</code> overrides both.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>{"<runtimeDir>"}</code>의 위치:
                    </strong>{" "}
                    <code>NODE_ENV=production</code>이면 <code>runtime/</code>, 아니면{" "}
                    <code>{"local/apps/<app>/runtime"}</code>입니다. <code>AKAN_RUNTIME_DIR</code>로 직접 정할 수도
                    있습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The Docker image turns files off.</strong> A container's writable layer is ephemeral, so
                    stdout is the collection path there; set <code>AKAN_LOG_TO_FILE=1</code> to get the files back.
                  </>
                ),
                ko: (
                  <>
                    <strong>Docker 이미지는 파일 로그를 끕니다.</strong> 컨테이너의 쓰기 레이어는 사라지는 공간이라
                    거기서는 stdout이 수집 경로입니다. 파일이 필요하면 <code>AKAN_LOG_TO_FILE=1</code>을 줍니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="reading-logs" title={l.trans({ en: "Reading Logs", ko: "로그 조회" })}>
        <Docs.Title>{l.trans({ en: "Reading Logs", ko: "로그 조회" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When the app accepts no traffic, start with the gateway log. Then read the child log that handled the request or background job.",
              ko: "앱이 트래픽을 받지 못하면 gateway 로그부터 봅니다. 그다음 요청이나 백그라운드 작업을 처리한 child 로그를 봅니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The files are plain text, so ordinary tools work:",
              ko: "파일은 평범한 텍스트라 익숙한 도구로 보면 됩니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`# ${l.trans({ en: "List current log files", ko: "현재 로그 파일 목록" })}
ls -lh local/apps/myapp/runtime/logs

# ${l.trans({ en: "Follow the gateway", ko: "gateway 로그 따라가기" })}
tail -f local/apps/myapp/runtime/logs/*-gateway-*.log

# ${l.trans({ en: "Follow one child replica", ko: "child replica 하나 따라가기" })}
tail -f local/apps/myapp/runtime/logs/*-0-all-*.log

# ${l.trans({ en: "Search for errors", ko: "에러 찾기" })}
rg "ERROR|Unhandled|Failed" local/apps/myapp/runtime/logs

# ${l.trans({ en: "On a server with AKAN_LOG_DIR=/var/log/akan", ko: "AKAN_LOG_DIR=/var/log/akan인 서버에서" })}
ls -lh /var/log/akan
rg "invoice-sync|ERROR" /var/log/akan`}
          />
          <ul className={bulletList}>
            {readingNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="live-tail" title={l.trans({ en: "Live Tail", ko: "실시간 조회" })}>
        <Docs.Title>{l.trans({ en: "Live Tail", ko: "실시간 조회" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A running gateway, or a replica running alone, keeps recent records in a ring buffer and serves them
                  on <code>akan-control.sock</code> in the runtime directory. <code>akan logs</code> and{" "}
                  <code>.tail</code> in <code>akan console</code> attach to it.
                </span>
              ),
              ko: (
                <span>
                  실행 중인 gateway(단독 replica라면 replica 자신)는 최근 레코드를 링 버퍼에 담고, runtime 디렉터리의{" "}
                  <code>akan-control.sock</code>으로 내보냅니다. <code>akan logs</code>와 <code>akan console</code>의{" "}
                  <code>.tail</code>이 여기에 붙습니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "The socket is chmod 0600 and opens no TCP port: filesystem permission is the whole authentication.",
              ko: "소켓은 chmod 0600이고 TCP 포트를 열지 않습니다. 파일시스템 권한이 인증의 전부입니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`# ${l.trans({
              en: "warn and above from any mutation, whose message mentions payment",
              ko: "mutation에서 나온 warn 이상 중 메시지에 payment가 든 줄",
            })}
akan logs myapp --level warn --grep payment --endpoint "mutation:*"

# ${l.trans({ en: "One request, start to finish", ko: "요청 하나를 처음부터 끝까지" })}
akan logs myapp --trace m8x1k2-a9f3c1

# ${l.trans({
              en: "What the RSC worker rendered, with the last 50 buffered records first",
              ko: "RSC worker가 렌더한 것, 버퍼의 최근 50건부터",
            })}
akan logs myapp --role rsc-worker --origin page --replay 50

# ${l.trans({ en: "History only, as NDJSON", ko: "지난 기록만 NDJSON으로" })}
akan logs myapp --since 5m --follow false --json

# ${l.trans({ en: "The same filters inside akan console", ko: "akan console 안에서도 같은 필터" })}
akan:myapp> .tail level=warn grep=payment endpoint=mutation:*
akan:myapp> .trace m8x1k2-a9f3c1
akan:myapp> .tail off`}
          />
          <Docs.OptionTable
            items={[
              {
                key: "--level",
                type: "string",
                desc: l.trans({
                  en: "Minimum level, by name or by severity number.",
                  ko: "최소 레벨입니다. 이름이나 severity 숫자로 줍니다.",
                }),
              },
              {
                key: "--grep",
                type: "string",
                desc: l.trans({
                  en: "Substring the message must contain.",
                  ko: "메시지에 들어 있어야 하는 부분 문자열입니다.",
                }),
              },
              {
                key: "--endpoint",
                type: "string",
                desc: l.trans({
                  en: "Endpoint globs, comma-separated: `mutation:*`, `query:userList`.",
                  ko: "endpoint 글롭 목록입니다. 쉼표로 구분합니다. 예: `mutation:*`, `query:userList`.",
                }),
              },
              {
                key: "--trace",
                type: "string",
                desc: l.trans({ en: "One request's traceId.", ko: "요청 하나의 traceId입니다." }),
              },
              {
                key: "--child",
                type: "string",
                desc: l.trans({
                  en: "Replica indexes, comma-separated.",
                  ko: "replica 번호 목록입니다. 쉼표로 구분합니다.",
                }),
              },
              {
                key: "--role, -R",
                type: "string",
                desc: l.trans({
                  en: "Process roles: `gateway`, `all`, `federation`, `batch`, `rsc-worker`.",
                  ko: "프로세스 역할 목록입니다. `gateway`, `all`, `federation`, `batch`, `rsc-worker`.",
                }),
              },
              {
                key: "--origin",
                type: "string",
                desc: l.trans({
                  en: "Call origins: `http`, `websocket`, `mcp`, `internal`, `page`.",
                  ko: "호출 출처 목록입니다. `http`, `websocket`, `mcp`, `internal`, `page`.",
                }),
              },
              {
                key: "--since",
                type: "string",
                desc: l.trans({
                  en: "Only records newer than this: `30s`, `5m`, `2h`, `1d`, or epoch ms.",
                  ko: "이보다 새로운 레코드만 봅니다. `30s`, `5m`, `2h`, `1d` 또는 epoch ms.",
                }),
              },
              {
                key: "--replay, -n",
                type: "number",
                default: "0",
                desc: l.trans({
                  en: "Records to replay from the buffer before following.",
                  ko: "따라가기 전에 버퍼에서 먼저 보여 줄 레코드 수입니다.",
                }),
              },
              {
                key: "--json",
                type: "boolean",
                default: "false",
                desc: l.trans({
                  en: "Print NDJSON records instead of rendered lines.",
                  ko: "렌더링한 줄 대신 NDJSON 레코드를 출력합니다.",
                }),
              },
              {
                key: "--follow",
                type: "boolean",
                default: "true",
                desc: l.trans({
                  en: "Keep streaming. Pass `--follow false` for history only.",
                  ko: "계속 스트리밍합니다. 지난 기록만 보려면 `--follow false`를 줍니다.",
                }),
              },
              {
                key: "--runtime-dir, -d",
                type: "string",
                default: "local/apps/<app>/runtime",
                desc: l.trans({
                  en: "Directory holding `akan-control.sock`. Pass it for a built app running elsewhere.",
                  ko: "`akan-control.sock`이 있는 디렉터리입니다. 다른 곳에서 도는 빌드된 앱에 줍니다.",
                }),
              },
            ]}
          />
          <div className={cardGrid}>
            {tailCards.map(({ title, desc }) => (
              <div key={title} className={card}>
                <div className="mb-1 font-semibold text-primary">{title}</div>
                <div className="text-foreground/70 text-sm">{desc}</div>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="request-line"
        title={l.trans({ en: "Request Line & Flight Recorder", ko: "요청 요약 줄과 flight recorder" })}
      >
        <Docs.Title>
          {l.trans({ en: "Request Line & Flight Recorder", ko: "요청 요약 줄과 flight recorder" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Two opt-ins cut noise instead of filtering it: one summary line per call, and trace-level detail only for the calls that went wrong.",
              ko: "두 옵트인은 노이즈를 걸러내는 대신 아예 줄입니다. 호출마다 요약 한 줄을 남기고, 잘못된 호출에만 trace 수준의 상세를 남깁니다.",
            })}
          </div>
          <div className={cardGrid}>
            {requestCards.map(({ title, desc, chip: chipText }) => (
              <div key={title} className={card}>
                <div className="mb-1 font-semibold text-primary">{title}</div>
                <div className="text-foreground/70 text-sm">{desc}</div>
                <code className={chip}>{chipText}</code>
              </div>
            ))}
          </div>
          <div>
            {l.trans({
              en: "With the process level left at info, you still get trace detail for exactly the request that failed.",
              ko: "프로세스 레벨은 info로 둔 채, 실패한 요청에 대해서만 trace 상세를 얻는 방식입니다.",
            })}
          </div>
          <Docs.SubSubTitle>
            {l.trans({ en: "What the request line carries", ko: "요약 줄에 실리는 값" })}
          </Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={canonicalRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Settings", ko: "설정" })}</Docs.SubSubTitle>
          <Docs.OptionTable
            items={[
              {
                key: "AKAN_LOG_CANONICAL",
                type: "1 | true | all | slow",
                default: off,
                desc: l.trans({
                  en: "One summary record per call. `slow` keeps only failures and calls over `AKAN_LOG_FLIGHT_MS`.",
                  ko: "호출마다 요약 레코드 하나를 씁니다. `slow`는 실패했거나 `AKAN_LOG_FLIGHT_MS`를 넘긴 호출만 씁니다.",
                }),
              },
              {
                key: "AKAN_LOG_FLIGHT",
                type: "1 | true",
                default: off,
                desc: l.trans({
                  en: "Keeps each call's last 64 sub-level records, promoted only if it failed or ran long.",
                  ko: "호출마다 레벨 아래 레코드를 최근 64건까지 들고 있다가, 실패했거나 오래 걸렸을 때만 올립니다.",
                }),
              },
              {
                key: "AKAN_LOG_FLIGHT_MS",
                type: "number",
                default: "1000",
                desc: l.trans({
                  en: "The slow threshold, shared by the flight recorder and `slow` mode.",
                  ko: "느림 기준(ms)입니다. flight recorder와 `slow` 모드가 함께 씁니다.",
                }),
              },
              {
                key: "AKAN_LOG_FLIGHT_MAX",
                type: "number",
                default: "65536",
                desc: l.trans({
                  en: "Records held at once across calls (1,024 calls at 64 each); past it a call runs unrecorded.",
                  ko: "모든 호출을 합쳐 동시에 보관하는 레코드 수입니다(호출당 64건, 1,024개 호출). 넘으면 기록 없이 실행됩니다.",
                }),
              },
              {
                key: "AKAN_LOG_DEBUG_HEADER",
                type: "string",
                default: l.trans({ en: "unset", ko: "없음" }),
                desc: l.trans({
                  en: "Secret for `x-akan-debug`, which lowers one request to trace. Unset, it works only in local.",
                  ko: "요청 하나를 trace로 낮추는 `x-akan-debug` 헤더의 비밀값입니다. 없으면 local에서만 받습니다.",
                }),
              },
              {
                key: "AKAN_TRACE",
                type: "1",
                default: off,
                desc: l.trans({
                  en: "Adds db and cache figures to the request line, and per-stage spans to metrics.",
                  ko: "요약 줄에 db·cache 수치를, 메트릭에 단계별 span을 더합니다.",
                }),
              },
            ]}
          />
          <Docs.SubSubTitle>
            {l.trans({ en: "One request at trace in production", ko: "운영 중 요청 하나만 trace로 보기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Send the secret in <code>x-akan-debug</code>, and that request alone is logged at trace:
                </span>
              ),
              ko: (
                <span>
                  <code>x-akan-debug</code> 헤더에 비밀값을 실어 보내면 그 요청 하나만 trace로 남습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`curl -X POST -H "x-akan-debug: <secret>" \\
     https://api.example.com/api/refundPayment/ord_1
# ${l.trans({
              en: "that request alone is logged at trace, its lines marked debug=true",
              ko: "그 요청만 trace로 찍히고, 그 줄에는 debug=true가 붙습니다",
            })}`}
          />
          <ul className={bulletList}>
            {requestNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="collection" title={l.trans({ en: "Collection: NDJSON stdout", ko: "수집: NDJSON stdout" })}>
        <Docs.Title>{l.trans({ en: "Collection: NDJSON stdout", ko: "수집: NDJSON stdout" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Collection and live viewing are different problems. Collection must lose nothing and survive restarts, so it goes through the container's stdout.",
              ko: "수집과 실시간 조회는 다른 문제입니다. 수집은 잃는 것이 없어야 하고 재시작에도 안전해야 하므로 컨테이너 stdout으로 합니다.",
            })}
          </div>
          <ul className={bulletList}>
            {collectionNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.OptionTable
            items={[
              {
                key: "AKAN_LOG_FORMAT",
                type: "text | ndjson | ndjson-only",
                default: "text",
                desc: l.trans({
                  en: "`ndjson`: one JSON record per stdout line. `ndjson-only` writes the rotating file as JSON too.",
                  ko: "`ndjson`은 stdout 한 줄에 JSON 하나를 쓰고, `ndjson-only`는 회전 로그 파일까지 JSON으로 씁니다.",
                }),
              },
              {
                key: "AKAN_LOG_STREAM",
                type: "1",
                default: off,
                desc: l.trans({
                  en: "Keeps a child's IPC forwarder on instead of following the hub's floor.",
                  ko: "child의 IPC forwarder를 허브 기준선에 맡기지 않고 항상 켜 둡니다.",
                }),
              },
              {
                key: "AKAN_LOG_BUFFER",
                type: "number",
                default: "2000",
                desc: l.trans({
                  en: "Records the hub owner's ring holds. Eviction starts at this or at the byte cap.",
                  ko: "허브 소유 프로세스의 링이 보관하는 레코드 수입니다. 이 값이나 바이트 상한에 닿으면 밀려납니다.",
                }),
              },
              {
                key: "AKAN_LOG_BUFFER_MB",
                type: "number",
                default: "4",
                desc: l.trans({
                  en: "Byte cap on the same ring. Ignored unless it is a positive number.",
                  ko: "같은 링의 바이트 상한입니다. 양수가 아니면 무시됩니다.",
                }),
              },
            ]}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    <code>AKAN_LOG_FORMAT</code> is one value for the whole deployment.
                  </strong>{" "}
                  Processes given different values corrupt the stream.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>AKAN_LOG_FORMAT</code>은 배포 전체가 같은 값을 써야 합니다.
                  </strong>{" "}
                  프로세스마다 다른 값을 주면 스트림이 깨집니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <div>
            {l.trans({
              en: "A docker-compose service that ships ndjson looks like this:",
              ko: "ndjson을 내보내는 docker-compose 서비스는 이렇게 씁니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="docker-compose.yml"
            language="yaml"
            code={`services:
  app:
    environment:
      AKAN_LOG_FORMAT: ndjson
      AKAN_LOG_TO_FILE: "0"
      AKAN_LOG_STDOUT_LEVEL: info
    logging:
      driver: json-file
      options: { max-size: "50m", max-file: "5" }`}
          />
          <ul className={bulletList}>
            {composeNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <div>
            {l.trans({
              en: "On Kubernetes, a node agent such as Fluent Bit strips the CRI wrapper and parses the JSON:",
              ko: "Kubernetes에서는 Fluent Bit 같은 노드 에이전트가 CRI 래퍼를 벗기고 JSON을 파싱합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="fluent-bit.conf"
            language="yaml"
            code={`[INPUT]
    name              tail
    path              /var/log/containers/*.log
    multiline.parser  cri
[FILTER]
    name          parser
    match         *
    key_name      log
    parser        json
    reserve_data  true`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Keep traceId and userId as JSON fields, not Loki labels.</strong> Labels must stay
                    low-cardinality (app, env, role, level); pick ids at query time with{" "}
                    <code>{'{app="myapp"} | json | traceId="m8x1k2-a9f3c1"'}</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>traceId와 userId는 Loki 라벨이 아니라 JSON 필드로 둡니다.</strong> 라벨은 app, env, role,
                    level처럼 값의 종류가 적어야 합니다. id는 쿼리할 때{" "}
                    <code>{'{app="myapp"} | json | traceId="m8x1k2-a9f3c1"'}</code>로 고릅니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="log-stream" title={l.trans({ en: "The SSE Stream", ko: "SSE 스트림" })}>
        <Docs.Title>{l.trans({ en: "The SSE Stream", ko: "SSE 스트림" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Live viewing is a session tool. <code>GET /_akan/app/logs</code> streams the hub as{" "}
                  <code>text/event-stream</code> to a bearer token, with the same filters as <code>akan logs</code>:
                </span>
              ),
              ko: (
                <span>
                  실시간 조회는 세션 도구입니다. <code>GET /_akan/app/logs</code>가 bearer 토큰을 가진 쪽에 허브를{" "}
                  <code>text/event-stream</code>으로 흘려보내고, <code>akan logs</code>와 같은 필터를 받습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`curl -N -H "Authorization: Bearer $AKAN_LOG_STREAM_TOKEN" \\
     "http://<pod>:8282/_akan/app/logs?level=warn&endpoint=mutation:*"

# ${l.trans({
              en: "Reconnect where you left off; an evicted range arrives as an explicit gap event",
              ko: "끊긴 곳부터 다시 받기. 밀려난 구간은 gap 이벤트로 알려 줍니다",
            })}
curl -N -H "Authorization: Bearer $AKAN_LOG_STREAM_TOKEN" \\
     -H "Last-Event-ID: 84213" \\
     "http://<pod>:8282/_akan/app/logs?level=warn"`}
          />
          <Docs.IntroTable type={l.trans({ en: "Piece", ko: "구성 요소" })} items={streamRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Gaps are explicit", ko: "빠진 구간은 명시합니다" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A resume never skips silently. When it cannot deliver everything after <code>Last-Event-ID</code>, it
                  sends a <code>gap</code> event first:
                </span>
              ),
              ko: (
                <span>
                  재개할 때 조용히 건너뛰는 일은 없습니다. <code>Last-Event-ID</code> 이후를 다 줄 수 없으면 먼저{" "}
                  <code>gap</code> 이벤트를 보냅니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "reason", ko: "reason 값" })} items={gapRows} />
          <ul className={bulletList}>
            {streamNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="operational-checklist" title={l.trans({ en: "Operational Checklist", ko: "운영 체크리스트" })}>
        <Docs.Title>{l.trans({ en: "Operational Checklist", ko: "운영 체크리스트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Five rules that keep production logs useful and affordable.",
              ko: "운영 로그를 쓸모 있고 감당할 만하게 유지하는 다섯 가지 규칙입니다.",
            })}
          </div>
          <ul className={bulletList}>
            {checklist.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Related pages", ko: "함께 볼 문서" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={relatedLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
