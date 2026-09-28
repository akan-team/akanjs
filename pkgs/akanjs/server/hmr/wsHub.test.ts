import { describe, expect, test } from "bun:test";
import { HMR_CSR_WS_TOPIC, HMR_WS_TOPIC, type HmrMessage, HmrWsHub } from "./wsHub";

const topicsOf = (msg: HmrMessage) => {
  const hub = new HmrWsHub();
  const topics: string[] = [];
  hub.setPublisher((topic) => topics.push(topic));
  hub.broadcast(msg);
  return topics;
};

describe("HmrWsHub", () => {
  test("a CSR update reaches CSR tabs only", () => {
    expect(topicsOf({ type: "csr-update", generation: 2, url: "/_akan/csr-dev/patch-2.js" })).toEqual([
      HMR_CSR_WS_TOPIC,
    ]);
  });

  test("RSC and SSR client refreshes stay with SSR tabs", () => {
    expect(topicsOf({ type: "reload", buildId: 1 })).toEqual([HMR_WS_TOPIC]);
    expect(topicsOf({ type: "rsc-refresh", buildId: 1 })).toEqual([HMR_WS_TOPIC]);
    expect(topicsOf({ type: "ssr-update", generation: 2, url: "/_akan/ssr-dev/patch-2.js" })).toEqual([HMR_WS_TOPIC]);
  });

  test("styles and build status reach every tab", () => {
    expect(topicsOf({ type: "css-update", cssAssets: {} })).toEqual([HMR_WS_TOPIC, HMR_CSR_WS_TOPIC]);
    expect(topicsOf({ type: "build-status", status: "error", generation: 1, phase: "csr" })).toEqual([
      HMR_WS_TOPIC,
      HMR_CSR_WS_TOPIC,
    ]);
  });
});
