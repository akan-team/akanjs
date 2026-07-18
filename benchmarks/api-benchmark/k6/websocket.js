import ws from "k6/ws";
import { check } from "k6";
import { Trend, Counter } from "k6/metrics";

/**
 * WebSocket fan-out load: N subscribers hold a room subscription while one publisher
 * emits timestamped messages. The script uses the akanjs `/api/ws` frame shape, and
 * raw Bun implements the same protocol for a fair baseline.
 *
 * Env:
 *   WS_URL          ws://127.0.0.1:PORT/path
 *   VUS             subscriber connections; one publisher connection is added
 *   DURATION        publish duration
 *   WARMUP          subscriber warmup before publishing starts
 *   MSG_PER_SEC     publisher message rate
 *   ROOM_ID         fan-out room id
 *   RESULT_FILE     where handleSummary writes JSON
 */

const WS_URL = __ENV.WS_URL || "ws://127.0.0.1:4001/ws";
const VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || "30s";
const WARMUP = __ENV.WARMUP || "10s";
const MSG_PER_SEC = Number(__ENV.MSG_PER_SEC || 10);
const ROOM_ID = __ENV.ROOM_ID || "bench-room";
const SUBSCRIBERS = Math.max(1, VUS);
const PUBLISH_INTERVAL_MS = Math.max(1, Math.round(1000 / Math.max(1, MSG_PER_SEC)));
const MEASURE_MS = durationToMs(DURATION);
const WARMUP_MS = durationToMs(WARMUP);

const deliveryLatency = new Trend("ws_delivery_latency_ms", true);
const received = new Counter("ws_messages_received");
const published = new Counter("ws_messages_published");
const connErrors = new Counter("ws_connect_errors");
const reconnects = new Counter("ws_reconnects");

export const options = {
  scenarios: {
    subscribers: {
      executor: "constant-vus",
      exec: "subscriber",
      vus: SUBSCRIBERS,
      duration: `${Math.ceil((WARMUP_MS + MEASURE_MS + 2000) / 1000)}s`,
    },
    publisher: {
      executor: "constant-vus",
      exec: "publisher",
      vus: 1,
      duration: DURATION,
      startTime: WARMUP,
    },
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export function subscriber() {
  const res = ws.connect(WS_URL, {}, (socket) => {
    socket.on("open", () => {
      socket.send(JSON.stringify({ key: "benchFanout", data: [ROOM_ID], subscribe: true }));
    });
    socket.on("message", (msg) => {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type !== "pub") return;
        const data = parsed.data || {};
        received.add(1);
        if (typeof data.sentAt === "number") deliveryLatency.add(Date.now() - data.sentAt);
      } catch (_e) {
        // Non-JSON frames are ignored; protocol errors surface through dropped messages.
      }
    });
    socket.on("error", () => connErrors.add(1));
    socket.setTimeout(() => socket.close(), WARMUP_MS + MEASURE_MS + 1500);
  });
  check(res, { "ws connected (101)": (r) => r && r.status === 101 });
}

export function publisher() {
  const res = ws.connect(WS_URL, {}, (socket) => {
    let seq = 0;
    let timer = null;
    socket.on("open", () => {
      timer = socket.setInterval(() => {
        seq++;
        socket.send(JSON.stringify({ key: "benchPublish", data: [ROOM_ID, seq, Date.now()] }));
        published.add(1);
      }, PUBLISH_INTERVAL_MS);
      socket.setTimeout(() => {
        if (timer) socket.clearInterval(timer);
        socket.close();
      }, MEASURE_MS);
    });
    socket.on("error", () => connErrors.add(1));
  });
  check(res, { "publisher connected (101)": (r) => r && r.status === 101 });
}

export function handleSummary(data) {
  const latency = data.metrics.ws_delivery_latency_ms ? data.metrics.ws_delivery_latency_ms.values : {};
  const recv = data.metrics.ws_messages_received ? data.metrics.ws_messages_received.values : {};
  const pub = data.metrics.ws_messages_published ? data.metrics.ws_messages_published.values : {};
  const errs = data.metrics.ws_connect_errors ? data.metrics.ws_connect_errors.values : {};
  const reconn = data.metrics.ws_reconnects ? data.metrics.ws_reconnects.values : {};
  const measureSeconds = MEASURE_MS / 1000;
  const expected = (pub.count ?? 0) * SUBSCRIBERS;
  const dropped = Math.max(0, expected - (recv.count ?? 0));
  const summary = {
    surface: "websocket",
    scenario: "websocket_fanout",
    wsUrl: WS_URL,
    roomId: ROOM_ID,
    connections: SUBSCRIBERS,
    publisherConnections: 1,
    publishRatePerSec: MSG_PER_SEC,
    messagesPublished: pub.count ?? 0,
    expectedMessages: expected,
    messagesReceived: recv.count ?? 0,
    messagesPerSec: measureSeconds > 0 ? (recv.count ?? 0) / measureSeconds : (recv.rate ?? 0),
    k6MessagesPerSec: recv.rate ?? 0,
    droppedMessages: dropped,
    dropRate: expected > 0 ? dropped / expected : 0,
    connectErrors: errs.count ?? 0,
    reconnects: reconn.count ?? 0,
    deliveryLatencyMs: {
      avg: round(latency.avg),
      p50: round(latency.med),
      p90: round(latency["p(90)"]),
      p95: round(latency["p(95)"]),
      p99: round(latency["p(99)"]),
      max: round(latency.max),
    },
  };
  const out = {
    stdout: `\n[websocket_fanout] conns=${SUBSCRIBERS} msg/s=${fmt(summary.messagesPerSec)} p99=${fmt(summary.deliveryLatencyMs.p99)}ms drop=${fmt(summary.dropRate * 100)}% errs=${summary.connectErrors}\n`,
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

function durationToMs(value) {
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/);
  if (!match) return 30_000;
  const amount = Number(match[1]);
  const unit = match[2] || "s";
  if (unit === "ms") return amount;
  if (unit === "m") return amount * 60_000;
  return amount * 1000;
}
