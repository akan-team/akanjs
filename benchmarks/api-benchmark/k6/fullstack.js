import http from "k6/http";
import { check, group } from "k6";
import { Trend } from "k6/metrics";

/**
 * Full-stack end-to-end scenario: login -> list -> create -> read-back. Measures the
 * whole-iteration latency that a real client would feel. Used to compare akanjs
 * (single & cluster) against e.g. Next.js + Prisma running the equivalent flow.
 *
 * Env: BASE_URL, VUS, DURATION, WARMUP, and PATH_* templates (see rest.js). Plus
 * PATH_LOGIN (default /login). RESULT_FILE for JSON output.
 */

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:4001";
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || "30s";
const WARMUP = __ENV.WARMUP || "10s";
const ID_MIN = Number(__ENV.ID_MIN || 0);
const ID_MAX = Number(__ENV.ID_MAX || 9999);

const PATHS = {
  login: __ENV.PATH_LOGIN || "/login",
  list: __ENV.PATH_LIST || "/users?limit=20&skip=0",
  create: __ENV.PATH_CREATE || "/users",
  find: __ENV.PATH_FIND || "/users/{id}",
};

const iterationDuration = new Trend("e2e_iteration_ms", true);

export const options = {
  scenarios: {
    main: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: WARMUP, target: VUS },
        { duration: DURATION, target: VUS },
      ],
    },
  },
  thresholds: __ENV.MAX_P99_MS ? { e2e_iteration_ms: [`p(99)<${Number(__ENV.MAX_P99_MS)}`] } : {},
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const randId = () => `usr_${String(ID_MIN + Math.floor(Math.random() * (ID_MAX - ID_MIN + 1))).padStart(7, "0")}`;

export default function () {
  const start = Date.now();
  let token = "";
  group("login", () => {
    const res = http.post(`${BASE_URL}${PATHS.login}`, JSON.stringify({}), {
      headers: { "Content-Type": "application/json" },
    });
    check(res, { "login ok": (r) => r.status >= 200 && r.status < 300 });
    try {
      token = res.json("token") || "";
    } catch (_e) {
      token = "";
    }
  });
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  group("list", () => {
    const res = http.get(`${BASE_URL}${PATHS.list}`, { headers });
    check(res, { "list ok": (r) => r.status >= 200 && r.status < 300 });
  });
  group("create", () => {
    const res = http.post(`${BASE_URL}${PATHS.create}`, JSON.stringify({}), { headers });
    check(res, { "create ok": (r) => r.status >= 200 && r.status < 300 });
  });
  group("read", () => {
    const res = http.get(`${BASE_URL}${PATHS.find.replace("{id}", randId())}`, { headers });
    check(res, { "read ok": (r) => r.status >= 200 && r.status < 300 });
  });
  iterationDuration.add(Date.now() - start);
}

export function handleSummary(data) {
  const m = data.metrics.e2e_iteration_ms ? data.metrics.e2e_iteration_ms.values : {};
  const iters = data.metrics.iterations ? data.metrics.iterations.values : {};
  const failed = data.metrics.http_req_failed ? data.metrics.http_req_failed.values : {};
  const summary = {
    surface: "fullstack_e2e",
    baseUrl: BASE_URL,
    iterationsPerSec: iters.rate ?? null,
    errorRate: failed.rate ?? 0,
    iterationMs: {
      avg: round(m.avg),
      p90: round(m["p(90)"]),
      p95: round(m["p(95)"]),
      p99: round(m["p(99)"]),
      max: round(m.max),
    },
  };
  const out = {
    stdout: `\n[fullstack] iter/s=${fmt(summary.iterationsPerSec)} p99=${fmt(summary.iterationMs.p99)}ms err=${fmt(summary.errorRate * 100)}%\n`,
  };
  if (__ENV.RESULT_FILE) out[__ENV.RESULT_FILE] = JSON.stringify(summary, null, 2);
  return out;
}

function round(v) {
  return typeof v === "number" ? Math.round(v * 1000) / 1000 : null;
}
function fmt(v) {
  return typeof v === "number" ? v.toFixed(1) : "n/a";
}
