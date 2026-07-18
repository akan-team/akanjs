import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";

/**
 * Generic REST / DB load script. One script drives every target and scenario; the
 * harness parameterizes it entirely through environment variables so paths can be
 * remapped per framework (canonical for competitors, Signal paths for akanjs).
 *
 * Env:
 *   BASE_URL      target origin, e.g. http://127.0.0.1:4001
 *   SCENARIO      purePing | signalPing | ping | find | list | relation | create
 *   AXIS          minimal | realistic   (informational; tagged on metrics)
 *   TOKEN         bearer token for authenticated scenarios
 *   RPS           target open-model arrival rate (constant-arrival-rate). If unset, uses ramping VUs.
 *   VUS           max VUs (preallocated for arrival rate, or ramp ceiling)
 *   DURATION      steady-state duration, e.g. "60s"
 *   WARMUP        warmup duration, e.g. "10s"
 *   ID_MIN/ID_MAX numeric id range to randomize over (for find/relation)
 *   PATH_PURE_HTTP/PATH_SIGNAL_NO_DB/PATH_PING/PATH_FIND/PATH_LIST/PATH_RELATION/PATH_CREATE  path templates ({id} placeholder)
 *   MAX_P99_MS / MIN_RPS / MAX_ERROR_RATE  SLO thresholds (optional)
 *   RESULT_FILE   where handleSummary writes JSON
 */

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:4001";
const SCENARIO = __ENV.SCENARIO || "ping";
const AXIS = __ENV.AXIS || "minimal";
const TOKEN = __ENV.TOKEN || "";
const DURATION = __ENV.DURATION || "30s";
const WARMUP = __ENV.WARMUP || "10s";
const VUS = Number(__ENV.VUS || 50);
const RPS = Number(__ENV.RPS || 0);
const ID_MIN = Number(__ENV.ID_MIN || 0);
const ID_MAX = Number(__ENV.ID_MAX || 9999);
// Real document ids to sample for find/relation (akanjs string ids). When unset,
// fall back to the synthetic integer scheme used by the competitor servers.
const ID_POOL = __ENV.ID_POOL_FILE ? JSON.parse(open(__ENV.ID_POOL_FILE)) : null;
const CREATE_BODY = __ENV.CREATE_BODY || "{}";

const PATHS = {
  purePing: __ENV.PATH_PURE_HTTP || "/ping",
  signalPing: __ENV.PATH_SIGNAL_NO_DB || "/ping",
  ping: __ENV.PATH_PING || "/ping",
  find: __ENV.PATH_FIND || "/users/{id}",
  list: __ENV.PATH_LIST || "/users?limit=20&skip=0",
  relation: __ENV.PATH_RELATION || "/users/{id}/with-org",
  create: __ENV.PATH_CREATE || "/users",
};

const reqDuration = new Trend("scenario_req_duration", true);

const buildExecutor = () => {
  if (RPS > 0) {
    return {
      executor: "constant-arrival-rate",
      rate: RPS,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: VUS,
      maxVUs: VUS * 4,
      startTime: WARMUP,
    };
  }
  return {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: WARMUP, target: VUS },
      { duration: DURATION, target: VUS },
    ],
  };
};

const thresholds = {};
if (__ENV.MAX_P99_MS) thresholds["scenario_req_duration"] = [`p(99)<${Number(__ENV.MAX_P99_MS)}`];
if (__ENV.MAX_ERROR_RATE) thresholds["http_req_failed"] = [`rate<${Number(__ENV.MAX_ERROR_RATE)}`];

export const options = {
  discardResponseBodies: false,
  scenarios: { main: buildExecutor() },
  thresholds,
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const randId = () => {
  if (ID_POOL && ID_POOL.length > 0) return ID_POOL[Math.floor(Math.random() * ID_POOL.length)];
  const n = ID_MIN + Math.floor(Math.random() * (ID_MAX - ID_MIN + 1));
  return `usr_${String(n).padStart(7, "0")}`;
};

const authHeaders = TOKEN ? { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };

export default function () {
  let res;
  if (SCENARIO === "purePing") {
    res = http.get(`${BASE_URL}${PATHS.purePing}`, { headers: authHeaders });
  } else if (SCENARIO === "signalPing") {
    res = http.get(`${BASE_URL}${PATHS.signalPing}`, { headers: authHeaders });
  } else if (SCENARIO === "ping") {
    res = http.get(`${BASE_URL}${PATHS.ping.replace("{id}", randId())}`, { headers: authHeaders });
  } else if (SCENARIO === "find") {
    res = http.get(`${BASE_URL}${PATHS.find.replace("{id}", randId())}`, { headers: authHeaders });
  } else if (SCENARIO === "list") {
    res = http.get(`${BASE_URL}${PATHS.list}`, { headers: authHeaders });
  } else if (SCENARIO === "relation") {
    res = http.get(`${BASE_URL}${PATHS.relation.replace("{id}", randId())}`, { headers: authHeaders });
  } else if (SCENARIO === "create") {
    res = http.post(`${BASE_URL}${PATHS.create}`, CREATE_BODY, { headers: authHeaders });
  }
  reqDuration.add(res.timings.duration);
  check(res, { "status ok": (r) => r.status >= 200 && r.status < 300 });
}

export function handleSummary(data) {
  const m = data.metrics.scenario_req_duration ? data.metrics.scenario_req_duration.values : {};
  const httpReqs = data.metrics.http_reqs ? data.metrics.http_reqs.values : {};
  const failed = data.metrics.http_req_failed ? data.metrics.http_req_failed.values : {};
  const summary = {
    scenario: SCENARIO,
    axis: AXIS,
    baseUrl: BASE_URL,
    rps: httpReqs.rate ?? null,
    iterations: httpReqs.count ?? null,
    errorRate: failed.rate ?? 0,
    latencyMs: {
      avg: round(m.avg),
      med: round(m.med),
      p90: round(m["p(90)"]),
      p95: round(m["p(95)"]),
      p99: round(m["p(99)"]),
      max: round(m.max),
    },
  };
  const out = {};
  out.stdout = `\n[${SCENARIO}/${AXIS}] rps=${fmt(summary.rps)} p99=${fmt(summary.latencyMs.p99)}ms err=${fmt(summary.errorRate * 100)}%\n`;
  if (__ENV.RESULT_FILE) out[__ENV.RESULT_FILE] = JSON.stringify(summary, null, 2);
  return out;
}

function round(v) {
  return typeof v === "number" ? Math.round(v * 1000) / 1000 : null;
}
function fmt(v) {
  return typeof v === "number" ? v.toFixed(1) : "n/a";
}
