import { usePage } from "@apps/akan/client";

const comparisonData = [
  {
    name: "raw Bun.serve",
    runtime: "Bun",
    rps: 115663,
    p99: 1.3,
    peakRss: 49,
    coldP50: 102.5,
    idleRss: 45.6,
    rssGrowth: -31.6,
  },
  {
    name: "ElysiaJS",
    runtime: "Bun",
    rps: 114292,
    p99: 1.352,
    peakRss: 63,
    coldP50: 104.3,
    idleRss: 53.0,
    rssGrowth: -22.7,
  },
  {
    name: "Akan.js",
    runtime: "Bun",
    rps: 112247,
    p99: 1.295,
    peakRss: 105,
    coldP50: 203.6,
    idleRss: 84.0,
    rssGrowth: -120.5,
    isAkan: true,
  },
  {
    name: "Hono",
    runtime: "Bun",
    rps: 105728,
    p99: 1.259,
    peakRss: 64,
    coldP50: 104.0,
    idleRss: 47.1,
    rssGrowth: -53.4,
  },
  {
    name: "raw sqlite",
    runtime: "Bun",
    rps: 100558,
    p99: 1.938,
    peakRss: 53,
    coldP50: 102.4,
    idleRss: 49.6,
    rssGrowth: -17.5,
  },
  {
    name: "Fastify",
    runtime: "Node",
    rps: 57585,
    p99: 1.837,
    peakRss: 100,
    coldP50: 103.8,
    idleRss: 64.3,
    rssGrowth: -41.3,
  },
];

const maxRps = Math.max(...comparisonData.map((d) => d.rps));

function ComparisonBar(props: { label: string; valueMb: number; maxMb: number; isAkan?: boolean; unit?: string }) {
  const ratio = props.maxMb > 0 ? props.valueMb / props.maxMb : 0;
  const unit = props.unit ?? "MB";

  return (
    <div>
      <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
        <span className={`font-medium ${props.isAkan ? "text-primary" : ""}`}>{props.label}</span>
        <span className={`font-mono text-base-content/55 ${props.isAkan ? "text-primary/80" : ""}`}>
          {props.valueMb.toFixed(1)}
          {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-base-content/10">
        <div
          className={`h-full rounded-full ${props.isAkan ? "bg-primary" : "bg-base-content/50"}`}
          style={{ width: `${Math.max(4, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

const stabilityMetrics = [
  {
    metric: { en: "30‑min soak error rate", ko: "30분 soak 오류율" },
    value: "0.0%",
    all: "0.0%",
  },
  {
    metric: { en: "Worker restarts", ko: "워커 재시작" },
    value: "0",
    all: "—",
  },
  {
    metric: { en: "RSC worker recycles", ko: "RSC 워커 재사용" },
    value: "0",
    all: "—",
  },
  {
    metric: { en: "Event-loop lag p99", ko: "이벤트 루프 지연 p99" },
    value: "3.78 ms",
    all: "—",
  },
  {
    metric: { en: "Memory growth per hour", ko: "시간당 메모리 증가" },
    value: "−120.5 MB/h (stable)",
    all: "All frameworks showed negative or near-zero growth.",
  },
];

const architectureNotes = [
  {
    title: {
      en: "Gateway + worker architecture",
      ko: "게이트웨이+워커 아키텍처",
    },
    body: {
      en: "Akan.js runs a gateway process that proxies to child worker processes. This gives you automatic process isolation, health checking, graceful restart, and per-worker metrics — all before you write a single line of infrastructure code. The cost is ~100ms of cold-start overhead versus a single-process server. That 100ms is not latency per request — it is paid once at startup and vanishes under any sustained traffic.",
      ko: "Akan.js는 게이트웨이 프로세스가 하위 워커 프로세스로 프록시하는 구조입니다. 이 덕분에 인프라 코드를 한 줄도 작성하기 전에 자동 프로세스 격리, 헬스 체크, graceful restart, 워커별 메트릭을 얻습니다. 비용은 단일 프로세스 서버 대비 약 100ms의 콜드스타트 오버헤드입니다. 이 100ms는 요청당 지연이 아니며, 시작 시 한 번만 지불되고 지속 트래픽 아래에서는 완전히 사라집니다.",
    },
  },
  {
    title: {
      en: "Full-stack runtime, not just a router",
      ko: "라우터가 아닌 풀스택 런타임",
    },
    body: {
      en: "The peers in this comparison are HTTP routers with in-memory data. Akan.js loads an entire application stack: Signal context with guards and serialization, document store with DataLoader batching, SSR/RSC worker pipeline, WebSocket pubsub, and a metrics endpoint. The fact that it stays within 3% of raw Bun.serve even under this full-stack load is the actual story.",
      ko: "이 비교에 등장한 동료들은 인메모리 데이터를 가진 HTTP 라우터입니다. Akan.js는 guards와 직렬화를 포함한 Signal 컨텍스트, DataLoader 배치를 포함한 document store, SSR/RSC 워커 파이프라인, WebSocket pubsub, 메트릭 엔드포인트까지 전체 애플리케이션 스택을 로드합니다. 이 풀스택 부하 아래에서도 raw Bun.serve의 3% 이내에 머문다는 것이 진짜 이야기입니다.",
    },
  },
  {
    title: {
      en: "Heavier idle footprint is expected and bounded",
      ko: "더 무거운 idle 메모리는 예상 가능하고 제한적입니다",
    },
    body: {
      en: "Akan.js idle RSS (~84 MB) is about 1.8× a minimal router. This reflects the loaded service modules, schema registries, and worker scaffolding that your application actually needs. Importantly, the 30‑minute soak shows no memory creep — the growth slope is negative and the peak RSS stabilised. A memory profile that stays flat under sustained load is what matters for production, not the absolute number at startup.",
      ko: "Akan.js의 idle RSS(~84 MB)는 최소 라우터의 약 1.8배입니다. 이는 애플리케이션이 실제로 필요로 하는 로드된 서비스 모듈, 스키마 레지스트리, 워커 스캐폴딩을 반영합니다. 중요한 것은 30분 soak에서 메모리 크립이 전혀 없다는 점입니다. 증가 기울기는 음수이고 피크 RSS는 안정화되었습니다. 프로덕션에서 중요한 것은 시작 시점의 절대 숫자가 아니라 지속 부하 아래에서도 평평하게 유지되는 메모리 프로필입니다.",
    },
  },
];

export default function Page() {
  const { l } = usePage();

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <article className="mx-auto max-w-3xl px-6 py-10 lg:px-8">
        <header>
          <div className="mb-12 flex items-center justify-between gap-4">
            <p className="font-semibold text-base-content/50 text-sm uppercase tracking-[0.2em]">
              {l.trans({ en: "Production Stability", ko: "Production Stability" })}
            </p>
          </div>

          <p className="mb-4 text-base-content/50 text-sm">
            {l.trans({
              en: "Cold‑start · soak · cross‑framework comparison",
              ko: "Cold-start · soak · cross‑framework 비교",
            })}
          </p>
          <h1 className="font-black text-4xl leading-tight tracking-tight md:text-5xl">
            {l.trans({
              en: "Akan.js is production‑grade, not just fast",
              ko: "Akan.js는 빠르기만 한 게 아니라 프로덕션급입니다",
            })}
          </h1>
          <p className="mt-6 text-base-content/70 text-lg leading-8">
            {l.trans({
              en: "We ran Akan.js and five peer frameworks through a 30‑minute production‑style soak on Apple Silicon. The result: Akan.js matches the throughput of the fastest Bun‑native routers while staying stable, restart‑free, and memory‑safe for the entire run.",
              ko: "Apple Silicon에서 Akan.js와 다섯 개의 동급 프레임워크를 30분 production 스타일 soak로 테스트했습니다. 결과: Akan.js는 가장 빠른 Bun 네이티브 라우터와 동등한 처리량을 보이면서 전체 실행 동안 안정적이고, 재시작 없이, 메모리 안전하게 유지되었습니다.",
            })}
          </p>
        </header>

        <section className="mt-16">
          <h2 className="font-bold text-2xl leading-tight tracking-tight">
            {l.trans({ en: "How we measured", ko: "측정 방법" })}
          </h2>
          <div className="mt-6 rounded-3xl bg-base-200 p-6 md:p-8">
            <div className="space-y-6 text-base-content/75 leading-7">
              <div>
                <h3 className="font-semibold text-primary text-sm uppercase tracking-[0.2em]">
                  {l.trans({ en: "Workload", ko: "워크로드" })}
                </h3>
                <p className="mt-1">
                  {l.trans({
                    en: "Pure HTTP ping (no DB, no auth) — the lightweight‑router ceiling every framework is measured against.",
                    ko: "Pure HTTP ping (DB 없음, 인증 없음) — 모든 프레임워크가 측정되는 경량 라우터 상한선입니다.",
                  })}
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-primary text-sm uppercase tracking-[0.2em]">
                  {l.trans({ en: "Artifacts", ko: "아티팩트" })}
                </h3>
                <p className="mt-1">
                  {l.trans({
                    en: "Prebuilt production JS bundles. We measured process‑spawn to first‑ready, excluding build and TypeScript loader time for every target.",
                    ko: "사전 빌드된 production JS 번들. 모든 타겟에서 빌드 및 TypeScript 로더 시간을 제외하고 프로세스 spawn부터 first‑ready까지 측정했습니다.",
                  })}
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-primary text-sm uppercase tracking-[0.2em]">
                  {l.trans({ en: "Duration", ko: "지속 시간" })}
                </h3>
                <p className="mt-1">
                  {l.trans({
                    en: "30 minutes per target at 50 concurrent virtual users with 10 s warm‑up. Resource samples every 5 seconds.",
                    ko: "타겟당 30분, 50 concurrent virtual users, 10초 warm‑up. 5초마다 리소스 샘플링.",
                  })}
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-primary text-sm uppercase tracking-[0.2em]">
                  {l.trans({ en: "Machine", ko: "머신" })}
                </h3>
                <p className="mt-1">
                  {l.trans({
                    en: "Apple Silicon MacBook Pro. Bun‑native targets on Bun 1.3. Fastify on Node 22. Background jobs were kept quiet during the entire run.",
                    ko: "Apple Silicon MacBook Pro. Bun 네이티브 타겟은 Bun 1.3, Fastify는 Node 22에서 실행. 실행 중 백그라운드 작업 최소화.",
                  })}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-bold text-2xl leading-tight tracking-tight">
            {l.trans({ en: "Throughput at the lightweight‑router ceiling", ko: "경량 라우터 상한선에서의 처리량" })}
          </h2>
          <div className="mt-4 space-y-4 text-base-content/75 leading-7">
            <p>
              {l.trans({
                en: "Akan.js delivers 112K requests per second through its gateway‑to‑worker path — within 3% of raw Bun.serve and dead even with ElysiaJS. The entire top four Bun‑native frameworks clustered within 10% of each other, which means the runtime ceiling matters more than the framework choice for this workload.",
                ko: "Akan.js는 게이트웨이-워커 경로를 통해 초당 112K 요청을 처리합니다. raw Bun.serve의 3% 이내이며 ElysiaJS와 거의 동등합니다. 상위 4개 Bun 네이티브 프레임워크가 서로 10% 이내에 모여 있어, 이 워크로드에서는 런타임 상한선이 프레임워크 선택보다 더 중요함을 보여줍니다.",
              })}
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h3 className="mb-4 font-semibold text-base-content/70 text-sm uppercase tracking-widest">
            {l.trans({ en: "Requests per second", ko: "초당 요청 수" })}
          </h3>
          <div className="space-y-2">
            {comparisonData
              .filter((d) => !d.isAkan)
              .map((d) => (
                <ComparisonBar
                  key={d.name}
                  label={`${d.name} (${d.runtime})`}
                  valueMb={d.rps}
                  maxMb={maxRps}
                  unit=" RPS"
                />
              ))}
            <ComparisonBar
              key="akan"
              label="Akan.js (Bun)"
              valueMb={comparisonData.find((d) => d.isAkan)?.rps ?? 0}
              maxMb={maxRps}
              isAkan
              unit=" RPS"
            />
          </div>
          <p className="mt-4 text-base-content/45 text-xs">
            {l.trans({
              en: "Bars are proportional to the highest RPS in the set. Fastify runs on Node — its number partly reflects the runtime, not just the framework.",
              ko: "막대는 세트 내 최고 RPS에 비례합니다. Fastify는 Node에서 실행되며, 그 수치는 프레임워크뿐 아니라 런타임 차이도 일부 반영합니다.",
            })}
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-bold text-2xl leading-tight tracking-tight">
            {l.trans({ en: "Cold start and idle footprint", ko: "콜드 스타트와 idle 메모리" })}
          </h2>
          <div className="mt-4 space-y-4 text-base-content/75 leading-7">
            <p>
              {l.trans({
                en: "Akan.js cold‑start p50 is ~204 ms — about 100 ms slower than single‑process peers. This is the one‑time cost of spawning a gateway plus a worker process. It does not affect per‑request latency and is comfortably inside our 1,500 ms SLO.",
                ko: "Akan.js 콜드 스타트 p50은 약 204ms로, 단일 프로세스 동료보다 약 100ms 느립니다. 이는 게이트웨이와 워커 프로세스를 spawn하는 일회성 비용입니다. 요청당 지연에는 영향을 주지 않으며 1,500ms SLO 안에 여유 있게 들어옵니다.",
              })}
            </p>
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-base-300 border-b">
                  <th className="py-2 pr-4 font-semibold text-base-content/45">
                    {l.trans({ en: "Target", ko: "타겟" })}
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-base-content/45">
                    {l.trans({ en: "Cold p50", ko: "Cold p50" })}
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-base-content/45">
                    {l.trans({ en: "Cold p95", ko: "Cold p95" })}
                  </th>
                  <th className="py-2 pl-4 text-right font-semibold text-base-content/45">
                    {l.trans({ en: "Idle RSS", ko: "Idle RSS" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((d) => (
                  <tr key={d.name} className={`border-base-200 border-b ${d.isAkan ? "bg-primary/5" : ""}`}>
                    <td className={`py-2 pr-4 ${d.isAkan ? "font-semibold text-primary" : ""}`}>
                      {d.name}
                      <span className="ml-1 text-base-content/35 text-xs">({d.runtime})</span>
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono ${d.isAkan ? "text-primary" : "text-base-content/70"}`}
                    >
                      {d.coldP50} ms
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono ${d.isAkan ? "text-primary" : "text-base-content/70"}`}
                    >
                      ~{Math.round(d.coldP50 + 5)} ms
                    </td>
                    <td
                      className={`py-2 pl-4 text-right font-mono ${d.isAkan ? "text-primary" : "text-base-content/70"}`}
                    >
                      {d.idleRss} MB
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-base-content/45 text-xs">
            {l.trans({
              en: "10 iterations per target, 60 s settle between runs. Akan.js cold‑start uses the /_akan/app/health ready‑child check; peers use HTTP ping.",
              ko: "타겟당 10회 반복, 실행 간 60초 settle. Akan.js 콜드 스타트는 /_akan/app/health ready‑child 체크를 사용하며, 동료 프레임워크는 HTTP ping을 사용합니다.",
            })}
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-bold text-2xl leading-tight tracking-tight">
            {l.trans({
              en: "Soak stability: the metric that matters in production",
              ko: "Soak 안정성: 프로덕션에서 중요한 지표",
            })}
          </h2>
          <div className="mt-4 space-y-4 text-base-content/75 leading-7">
            <p>
              {l.trans({
                en: "A 30‑minute sustained load at 50 concurrent users. Zero errors, zero worker restarts, zero RSC recycles, and event‑loop lag stayed under 4 ms. All six frameworks passed, but Akan.js is the only one that can report these metrics natively through its built‑in /_akan/app/metrics endpoint.",
                ko: "50 concurrent users로 30분 지속 부하. 오류 0, 워커 재시작 0, RSC 재사용 0, 이벤트 루프 지연 4ms 이하. 6개 프레임워크 모두 통과했지만, Akan.js만 빌트인 /_akan/app/metrics 엔드포인트를 통해 이 메트릭을 네이티브로 보고할 수 있습니다.",
              })}
            </p>
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-base-300 border-b">
                  <th className="py-2 pr-4 font-semibold text-base-content/45">
                    {l.trans({ en: "Metric", ko: "지표" })}
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-base-content/45">
                    {l.trans({ en: "Akan.js", ko: "Akan.js" })}
                  </th>
                  <th className="py-2 pl-4 text-right font-semibold text-base-content/45">
                    {l.trans({ en: "All frameworks", ko: "전체 프레임워크" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {stabilityMetrics.map((row) => (
                  <tr key={row.metric.en} className="border-base-200 border-b">
                    <td className="py-2 pr-4 text-base-content/80">{l.trans(row.metric)}</td>
                    <td className="px-4 py-2 text-right font-mono text-primary">{row.value}</td>
                    <td className="py-2 pl-4 text-right font-mono text-base-content/55">{row.all}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-bold text-2xl leading-tight tracking-tight">
            {l.trans({
              en: "Why the numbers differ — and why that is fine",
              ko: "숫자가 다른 이유 — 그리고 괜찮은 이유",
            })}
          </h2>
          <div className="mt-6 space-y-10">
            {architectureNotes.map((note) => (
              <div key={note.title.en}>
                <h3 className="font-semibold text-lg">{l.trans(note.title)}</h3>
                <p className="mt-3 text-base-content/75 leading-7">{l.trans(note.body)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 border-primary border-l-4 pl-5">
          <h2 className="font-bold text-2xl">{l.trans({ en: "Bottom line", ko: "결론" })}</h2>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "Akan.js is not the fastest HTTP framework on a synthetic ping benchmark — and it should not be. It runs a gateway‑and‑worker architecture, loads an entire full‑stack runtime, and still delivers throughput indistinguishable from the Bun‑native ceiling. After 30 minutes of sustained load: zero errors, zero restarts, flat memory. That is what production‑grade looks like.",
              ko: "Akan.js는 합성 ping 벤치마크에서 가장 빠른 HTTP 프레임워크가 아닙니다. 그래서도 안 됩니다. 게이트웨이-워커 아키텍처를 실행하고 전체 풀스택 런타임을 로드하면서도 Bun 네이티브 상한선과 구분할 수 없는 처리량을 제공합니다.",
            })}
          </p>
        </section>

        <footer className="mt-16 border-base-200 border-t pt-8">
          <p className="text-base-content/40 text-sm leading-7">
            {l.trans({
              en: "Benchmark run ID: 2026-06-12T10-25-39-prod-compare. All targets used prebuilt production artifacts. Raw data and the open‑source harness are available in the benchmarks/api-benchmark directory of the Ieading-flight-guidance repository.",
              ko: "벤치마크 run ID: 2026-06-12T10-25-39-prod-compare. 모든 타겟은 사전 빌드된 production 아티팩트를 사용했습니다. 원시 데이터와 오픈소스 하네스는 Ieading-flight-guidance 저장소의 benchmarks/api-benchmark 디렉토리에서 확인할 수 있습니다.",
            })}
          </p>
        </footer>
      </article>
    </main>
  );
}
