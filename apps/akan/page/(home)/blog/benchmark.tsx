import { usePage } from "@apps/akan/client";

const latestRun = "2026-05-30T17-11-35-780Z";

const akanResults = [
  {
    name: "Pure HTTP",
    scenario: "pure_http_no_db",
    rps: 119_571,
    p99: 0.812,
    rss: 179.39,
    minRps: 50_000,
    maxP99: 5,
    desc: {
      en: "A minimal Akan HTTP route. This shows the framework's low-level request handling speed before business API features are added.",
      ko: "최소 Akan HTTP route입니다. Business API 기능이 추가되기 전 framework의 low-level request handling 속도를 보여줍니다.",
    },
  },
  {
    name: "Signal API",
    scenario: "signal_no_db",
    rps: 33_845,
    p99: 2.958,
    rss: 199.23,
    minRps: 20_000,
    maxP99: 10,
    desc: {
      en: "A normal Akan Signal API request without DB access. This is closer to the API style users write in Akan applications.",
      ko: "DB 접근이 없는 일반 Akan Signal API 요청입니다. Akan application에서 사용자가 작성하는 API 스타일에 더 가까운 항목입니다.",
    },
  },
  {
    name: "DB Find",
    scenario: "db_find_one",
    rps: 16_274,
    p99: 5.324,
    rss: 202.44,
    minRps: 10_000,
    maxP99: 20,
    desc: {
      en: "A single indexed document read through Akan's document API. This represents a common read endpoint shape.",
      ko: "Akan document API를 통한 단일 indexed document read입니다. 흔한 read endpoint 형태를 대표합니다.",
    },
  },
  {
    name: "DB List",
    scenario: "db_list",
    rps: 5_268,
    p99: 14.957,
    rss: 202.73,
    minRps: 5_000,
    maxP99: 20,
    desc: {
      en: "A paginated document list with sorting and light projection. This is a practical list API workload rather than a raw storage benchmark.",
      ko: "정렬과 light projection이 포함된 paginated document list입니다. Raw storage benchmark가 아니라 실제 list API workload에 가까운 항목입니다.",
    },
  },
  {
    name: "DB Relation",
    scenario: "db_relation",
    rps: 16_149,
    p99: 5.228,
    rss: 202.77,
    minRps: 1_500,
    maxP99: 60,
    desc: {
      en: "A document relation lookup using Akan's relation path and batching behavior.",
      ko: "Akan relation path와 batching 동작을 사용하는 document relation lookup입니다.",
    },
  },
  {
    name: "WebSocket Fan-out",
    scenario: "websocket_fanout",
    rps: 50_000,
    p99: 11,
    rss: 189.48,
    minRps: 40_000,
    maxP99: 50,
    throughputLabel: "msg/s",
    desc: {
      en: "A realtime fan-out workload: one publisher sends timestamped messages to 1,000 subscribers through Akan's /api/ws pubsub path.",
      ko: "실시간 fan-out workload입니다. publisher 1개가 Akan /api/ws pubsub 경로를 통해 subscriber 1,000개에 timestamp message를 전송합니다.",
    },
  },
];

const peerBaselines = [
  { name: "ElysiaJS", runtime: "Bun", rps: 133_564, p99: 0.739, note: "minimal REST ping" },
  { name: "raw Bun.serve", runtime: "Bun", rps: 129_970, p99: 0.745, note: "minimal REST ping" },
  { name: "Hono", runtime: "Bun", rps: 111_259, p99: 0.843, note: "minimal REST ping" },
  { name: "Fastify", runtime: "Node", rps: 83_034, p99: 1.111, note: "minimal REST ping" },
  { name: "raw bun:sqlite", runtime: "Bun", rps: 27_775, p99: 3.42, note: "db list baseline" },
];

const httpComparison = [
  ...peerBaselines.slice(0, 4),
  { name: "Akan Pure HTTP", runtime: "Bun", rps: 119_571, p99: 0.812, note: "runtime fast path" },
  { name: "Akan Signal API", runtime: "Bun", rps: 33_845, p99: 2.958, note: "Signal lifecycle" },
];

const dbComparison = [
  { name: "raw bun:sqlite", runtime: "Bun", rps: 27_775, p99: 3.42, note: "storage ceiling" },
  { name: "Akan DB List", runtime: "Bun", rps: 5_268, p99: 14.957, note: "document + Signal path" },
];

const formatRps = (value: number) => value.toLocaleString("en-US");
const maxHttpComparisonRps = Math.max(...httpComparison.map((item) => item.rps));
const maxDbComparisonRps = Math.max(...dbComparison.map((item) => item.rps));

export default function Page() {
  const { l } = usePage();

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <article className="mx-auto max-w-3xl px-6 py-10 lg:px-8">
        <header>
          <div className="mb-12 flex items-center justify-between gap-4">
            <p className="font-semibold text-base-content/50 text-sm uppercase tracking-[0.2em]">Akan.js Benchmark</p>
          </div>

          <p className="mb-4 text-base-content/50 text-sm">
            {l.trans({ en: `Run: ${latestRun}`, ko: `Run: ${latestRun}` })}
          </p>
          <h1 className="font-black text-4xl leading-tight tracking-tight md:text-5xl">
            {l.trans({ en: "Akan.js benchmark results", ko: "Akan.js 벤치마크 결과" })}
          </h1>
          <p className="mt-6 text-base-content/70 text-lg leading-8">
            {l.trans({
              en: "Akan.js was measured on a MacBook M4 Pro to check the practical performance of its HTTP, Signal API, document DB, and realtime WebSocket paths. The goal is simple: show how fast it is, where it sits next to familiar baselines, and whether the results clear practical service-level targets.",
              ko: "Akan.js를 MacBook M4 Pro에서 측정해 HTTP, Signal API, document DB, realtime WebSocket 경로의 실사용 성능을 확인했습니다. 목적은 단순합니다. 어느 정도 빠른지, 익숙한 기준과 비교해 어디쯤 있는지, 그리고 실용적인 service-level target을 통과하는지 보여주는 것입니다.",
            })}
          </p>
        </header>

        <section className="mt-12">
          <h2 className="font-bold text-2xl">{l.trans({ en: "Summary", ko: "요약" })}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-base-content/75 leading-7">
            <li>
              {l.trans({
                en: "All measured Akan scenarios passed their throughput and p99 latency SLOs.",
                ko: "측정된 모든 Akan scenario는 throughput 및 p99 latency SLO를 통과했습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Pure HTTP reached 119,571 RPS, placing Akan in the same practical range as Bun-native minimal router baselines.",
                ko: "Pure HTTP는 119,571 RPS를 기록해 Bun 기반 minimal router 기준선과 같은 실용 범위에 있습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Signal API reached 33,845 RPS while still running Akan's API lifecycle, which is the more relevant number for application code.",
                ko: "Signal API는 Akan의 API lifecycle을 실행하면서도 33,845 RPS를 기록했습니다. Application code 관점에서는 이 수치가 더 의미 있습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Document DB APIs stayed within the target range, including list and relation-style reads.",
                ko: "Document DB API도 list와 relation read를 포함해 목표 범위 안에 들어왔습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "WebSocket fan-out delivered 50k messages/sec to 1,000 local subscribers with p99 delivery latency at 11ms and no dropped messages.",
                ko: "WebSocket fan-out은 local subscriber 1,000개에 50k messages/sec를 전달했고, delivery latency p99는 11ms, dropped message는 0개였습니다.",
              })}
            </li>
          </ul>
        </section>

        <section className="mt-12 border-base-content/10 border-y py-8">
          <h2 className="font-bold text-2xl">{l.trans({ en: "Performance at a glance", ko: "성능 한눈에 보기" })}</h2>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "The bars below summarize two questions readers usually ask first: how much room each Akan path has against its SLO, and how the raw HTTP path compares with familiar framework baselines.",
              ko: "아래 bar는 독자가 먼저 궁금해하는 두 가지를 요약합니다. 각 Akan 경로가 SLO 대비 얼마나 여유가 있는지, 그리고 raw HTTP 경로가 익숙한 framework baseline과 비교해 어느 정도인지입니다.",
            })}
          </p>

          <h3 className="mt-8 font-bold text-lg">{l.trans({ en: "SLO margin by scenario", ko: "항목별 SLO 여유" })}</h3>
          <div className="mt-4 space-y-5">
            {akanResults.map((item) => (
              <SloMargin key={item.scenario} item={item} />
            ))}
          </div>

          <h3 className="mt-10 font-bold text-lg">
            {l.trans({ en: "Minimal HTTP comparison", ko: "Minimal HTTP 비교" })}
          </h3>
          <div className="mt-4 space-y-3">
            {httpComparison.map((item) => (
              <ComparisonBar
                key={item.name}
                label={`${item.name} (${item.runtime})`}
                value={`${formatRps(item.rps)} RPS, p99 ${item.p99}ms`}
                ratio={item.rps / maxHttpComparisonRps}
              />
            ))}
          </div>

          <h3 className="mt-10 font-bold text-lg">
            {l.trans({ en: "Document list vs storage ceiling", ko: "Document list와 storage ceiling" })}
          </h3>
          <div className="mt-4 space-y-3">
            {dbComparison.map((item) => (
              <ComparisonBar
                key={item.name}
                label={`${item.name} (${item.note})`}
                value={`${formatRps(item.rps)} RPS, p99 ${item.p99}ms`}
                ratio={item.rps / maxDbComparisonRps}
              />
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-bold text-2xl">{l.trans({ en: "Test setup", ko: "테스트 환경" })}</h2>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "The benchmark was run locally on a MacBook M4 Pro with Akan.js 2.0.7. Local benchmark numbers naturally depend on machine state, but this setup is useful for checking whether the framework has enough practical headroom.",
              ko: "벤치마크는 MacBook M4 Pro에서 Akan.js 2.0.7로 로컬 실행했습니다. 로컬 벤치마크 수치는 machine state의 영향을 받지만, framework가 충분한 실용 성능 여유를 갖는지 확인하기에는 유용합니다.",
            })}
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-base-content/75 leading-7">
            <li>{l.trans({ en: "Machine: MacBook M4 Pro", ko: "Machine: MacBook M4 Pro" })}</li>
            <li>{l.trans({ en: "Akan.js version: 2.0.7", ko: "Akan.js version: 2.0.7" })}</li>
            <li>{l.trans({ en: "Akan runtime: Bun", ko: "Akan runtime: Bun" })}</li>
            <li>{l.trans({ en: "Akan mode: single-process local run", ko: "Akan mode: single-process local run" })}</li>
            <li>{l.trans({ en: "Document store: SQLite", ko: "Document store: SQLite" })}</li>
            <li>
              {l.trans({
                en: "Load profile: 50 virtual users, 10s warmup, 30s measurement",
                ko: "Load profile: 50 virtual users, 10초 warmup, 30초 측정",
              })}
            </li>
            <li>
              {l.trans({
                en: "WebSocket profile: 1,000 subscribers, 1 publisher, 50 publishes/sec, 60s measurement",
                ko: "WebSocket profile: subscriber 1,000개, publisher 1개, 초당 publish 50개, 60초 측정",
              })}
            </li>
            <li>
              {l.trans({
                en: "Latest focused seed size: 300 documents",
                ko: "Latest focused seed size: document 300개",
              })}
            </li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="font-bold text-2xl">{l.trans({ en: "Measured surfaces", ko: "측정 항목" })}</h2>
          <div className="mt-5 space-y-8">
            {akanResults.map((item) => (
              <section key={item.scenario}>
                <h3 className="font-bold text-xl">{item.name}</h3>
                <p className="mt-1 font-mono text-base-content/45 text-sm">{item.scenario}</p>
                <p className="mt-3 text-base-content/75 leading-7">{l.trans(item.desc)}</p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-base-content/75 leading-7">
                  <li>
                    {l.trans({
                      en: `${formatRps(item.rps)} ${item.throughputLabel ?? "RPS"} measured; target is at least ${formatRps(item.minRps)} ${item.throughputLabel ?? "RPS"}.`,
                      ko: `${formatRps(item.rps)} ${item.throughputLabel ?? "RPS"} 측정; 목표는 최소 ${formatRps(item.minRps)} ${item.throughputLabel ?? "RPS"}입니다.`,
                    })}
                  </li>
                  <li>
                    {l.trans({
                      en: `p99 latency was ${item.p99}ms; target is ${item.maxP99}ms or lower.`,
                      ko: `p99 latency는 ${item.p99}ms; 목표는 ${item.maxP99}ms 이하입니다.`,
                    })}
                  </li>
                  <li>
                    {l.trans({
                      en: `Peak RSS was ${item.rss}MB. Result: SLO PASS.`,
                      ko: `Peak RSS는 ${item.rss}MB입니다. 결과: SLO PASS.`,
                    })}
                  </li>
                </ul>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-bold text-2xl">
            {l.trans({ en: "Compared with familiar baselines", ko: "익숙한 기준과의 비교" })}
          </h2>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "For minimal HTTP routing, Akan's pure HTTP path sits close to Bun-native minimal frameworks such as ElysiaJS, raw Bun.serve, and Hono. That is the important baseline: Akan is not paying a large runtime penalty before its higher-level API features are used.",
              ko: "Minimal HTTP routing 기준에서 Akan Pure HTTP는 ElysiaJS, raw Bun.serve, Hono 같은 Bun 기반 minimal framework와 가까운 범위에 있습니다. 중요한 기준은 이것입니다. Akan은 higher-level API 기능을 사용하기 전 runtime 단계에서 큰 penalty를 치르지 않습니다.",
            })}
          </p>
          <div className="mt-5 space-y-3">
            {httpComparison.map((item) => (
              <ComparisonBar
                key={item.name}
                label={`${item.name} (${item.runtime}, ${item.note})`}
                value={`${formatRps(item.rps)} RPS, p99 ${item.p99}ms`}
                ratio={item.rps / maxHttpComparisonRps}
              />
            ))}
          </div>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "Akan Signal API is noticeably lower than router-only frameworks because it is not measuring the same amount of work. Minimal router benchmarks usually handle a request and return a response. Signal API includes Akan's API lifecycle, middleware and guard points, request argument handling, response shaping, and the gateway-to-worker path used for load balancing. If the same features are added as middleware or plugins to a minimal router, those frameworks also pay additional overhead.",
              ko: "Akan Signal API가 router-only framework보다 낮게 보이는 이유는 같은 양의 일을 측정하지 않기 때문입니다. Minimal router benchmark는 보통 요청을 받고 응답을 반환하는 경로만 측정합니다. 반면 Signal API는 Akan의 API lifecycle, middleware와 guard 지점, request argument 처리, response shaping, 그리고 load balancing에 쓰이는 gateway-to-worker 경로까지 포함합니다. 같은 기능을 minimal router에 middleware나 plugin으로 추가하면 그쪽도 추가 overhead를 지불하게 됩니다.",
            })}
          </p>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "That makes 33,845 RPS with p99 under 3ms a more useful application-facing number than a bare ping result. It tells us that Akan's higher-level API path still has enough room for typical no-DB endpoints.",
              ko: "그래서 33,845 RPS와 p99 3ms 미만이라는 결과는 단순 ping보다 application-facing 수치로 더 의미가 있습니다. Akan의 higher-level API 경로가 일반적인 no-DB endpoint에 충분한 여유를 가진다는 뜻입니다.",
            })}
          </p>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "For document list APIs, raw bun:sqlite is the storage ceiling: it only asks how fast SQLite can return rows. Akan DB List does more work on purpose. It applies the document API shape, sorting, pagination, light projection, document materialization, response serialization, and Signal response handling on top of SQLite.",
              ko: "Document list API에서 raw bun:sqlite는 storage ceiling입니다. SQLite가 row를 얼마나 빨리 반환할 수 있는지만 보는 수치입니다. Akan DB List는 의도적으로 더 많은 일을 합니다. SQLite 위에 document API 형태, 정렬, pagination, light projection, document materialization, response serialization, Signal response 처리를 추가합니다.",
            })}
          </p>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "That overhead is acceptable because the measured path is closer to what a real list endpoint needs. At 5,268 RPS and p99 14.957ms, it clears the current list API SLO, so the framework cost is visible but still within a practical range.",
              ko: "이 overhead가 문제가 되지 않는 이유는 측정 경로가 실제 list endpoint가 필요로 하는 동작에 더 가깝기 때문입니다. 5,268 RPS와 p99 14.957ms로 현재 list API SLO를 통과하므로 framework 비용은 보이지만 실용 범위 안에 있습니다.",
            })}
          </p>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "For WebSocket fan-out, the comparison is intentionally against raw Bun rather than a higher-level realtime framework. The goal is not to claim that Akan is faster than raw WebSocket code. The useful question is whether Akan's pubsub path stays within a practical overhead range while preserving the same application model used by Signal APIs.",
              ko: "WebSocket fan-out은 의도적으로 higher-level realtime framework가 아니라 raw Bun과 비교했습니다. 목표는 Akan이 raw WebSocket 코드보다 빠르다고 주장하는 것이 아닙니다. 의미 있는 질문은 Signal API와 같은 application model을 유지하면서 Akan pubsub 경로의 overhead가 실용 범위 안에 있는지입니다.",
            })}
          </p>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "In the 1,000-subscriber fan-out run, raw Bun delivered about 49,983 messages/sec with p99 around 8ms. Akan delivered 50,000 messages/sec through /api/ws pubsub with p99 at 11ms, zero dropped messages, and zero connection errors. That is a small latency premium for running through the framework pubsub path.",
              ko: "subscriber 1,000개 fan-out run에서 raw Bun은 약 49,983 messages/sec와 p99 약 8ms를 기록했습니다. Akan은 /api/ws pubsub 경로를 통해 50,000 messages/sec를 전달했고 p99는 11ms, dropped message와 connection error는 0개였습니다. Framework pubsub 경로를 통과한다는 점을 고려하면 작은 latency premium입니다.",
            })}
          </p>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "A 5,000-subscriber local stress run also delivered 49,917 messages/sec with 0% drop and p99 47ms, but it produced 3,362 connection errors and a child health-timeout during the run. I treat that as a local stress signal rather than a clean headline benchmark.",
              ko: "subscriber 5,000개 local stress run도 49,917 messages/sec, drop 0%, p99 47ms를 기록했습니다. 다만 실행 중 connection error 3,362개와 child health-timeout이 발생했습니다. 이 수치는 headline benchmark가 아니라 local stress signal로 보는 것이 맞습니다.",
            })}
          </p>
        </section>

        <section className="mt-12">
          <h2 className="font-bold text-2xl">
            {l.trans({ en: "Is this fast enough?", ko: "이 정도면 충분히 빠른가?" })}
          </h2>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "For a framework that includes full-stack conventions on top of routing, these results are practical. The pure HTTP path is competitive with minimal Bun routers, the Signal API path has clear headroom above its SLO, the document DB paths remain within their latency and throughput targets, and the WebSocket pubsub path handles the 1k local fan-out target without drops.",
              ko: "Routing 위에 full-stack convention을 포함하는 framework라는 점을 고려하면 이 결과는 실용적입니다. Pure HTTP 경로는 Bun minimal router와 경쟁 가능한 범위에 있고, Signal API는 SLO 대비 명확한 여유가 있으며, document DB 경로도 latency와 throughput 목표 안에 들어옵니다. WebSocket pubsub 경로도 1k local fan-out 목표를 drop 없이 처리했습니다.",
            })}
          </p>
          <p className="mt-4 text-base-content/75 leading-7">
            {l.trans({
              en: "In short, Akan is fast enough for typical API-heavy and realtime application paths on this local benchmark: router-level performance is close to the fast Bun ecosystem, higher-level Akan APIs clear practical service targets, and realtime fan-out stays in a usable overhead range.",
              ko: "요약하면, 이 로컬 벤치마크 기준에서 Akan은 일반적인 API 중심 및 realtime application 경로에 충분히 빠릅니다. Router-level 성능은 빠른 Bun 생태계에 가깝고, higher-level Akan API는 실용적인 service target을 통과하며, realtime fan-out도 사용 가능한 overhead 범위 안에 있습니다.",
            })}
          </p>
        </section>
      </article>
    </main>
  );
}

function SloMargin({ item }: { item: (typeof akanResults)[number] }) {
  const rpsRatio = item.rps / item.minRps;
  const latencyRatio = item.maxP99 / item.p99;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-semibold">{item.name}</p>
          <p className="font-mono text-base-content/45 text-sm">{item.scenario}</p>
        </div>
        <p className="text-base-content/60 text-sm">
          {rpsRatio.toFixed(1)}x {item.throughputLabel ?? "RPS"} target, {latencyRatio.toFixed(1)}x p99 headroom
        </p>
      </div>
      <div className="mt-2 space-y-2">
        <MiniBar
          label={item.throughputLabel ?? "RPS"}
          value={`${formatRps(item.rps)} / ${formatRps(item.minRps)}`}
          ratio={rpsRatio}
        />
        <MiniBar label="p99" value={`${item.p99}ms / ${item.maxP99}ms`} ratio={latencyRatio} />
      </div>
    </div>
  );
}

function MiniBar({ label, value, ratio }: { label: string; value: string; ratio: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span className="text-base-content/55">{label}</span>
        <span className="font-mono text-base-content/55">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-base-content/10">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, ratio * 35)}%` }} />
      </div>
    </div>
  );
}

function ComparisonBar({ label, value, ratio }: { label: string; value: string; ratio: number }) {
  const isAkan = label.startsWith("Akan");

  return (
    <div>
      <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-base-content/55">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-base-content/10">
        <div
          className={`h-full rounded-full ${isAkan ? "bg-primary" : "bg-base-content/50"}`}
          style={{ width: `${Math.max(4, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}
