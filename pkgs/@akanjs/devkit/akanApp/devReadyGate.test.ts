import { describe, expect, test } from "bun:test";
import type { DevHostState } from "./devHostPolicy";
import { DevReadyGate } from "./devReadyGate";

const gate = (waitMs = 60_000) => {
  const forwarded: [DevHostState, string | undefined][] = [];
  return { forwarded, gate: new DevReadyGate((state, detail) => forwarded.push([state, detail]), { waitMs }) };
};

describe("DevReadyGate", () => {
  test("holds a ready that comes before the SSR registry's boot build settles, and lets it out then", () => {
    const { forwarded, gate: ready } = gate();
    ready.report("starting");
    ready.report("ready", "pid=12");
    expect(forwarded).toEqual([["starting", undefined]]);
    ready.armed();
    expect(forwarded).toEqual([
      ["starting", undefined],
      ["ready", "pid=12"],
    ]);
  });

  test("passes every state straight through once the build has settled", () => {
    const { forwarded, gate: ready } = gate();
    ready.armed();
    ready.report("ready", "pid=12");
    ready.report("restarting");
    ready.report("ready", "pid=13");
    ready.armed();
    expect(forwarded.map(([state]) => state)).toEqual(["ready", "restarting", "ready"]);
  });

  test("drops a held ready the app moved on from", () => {
    const { forwarded, gate: ready } = gate();
    ready.report("ready", "pid=12");
    ready.report("recovering", "backend-exit");
    ready.armed();
    expect(forwarded).toEqual([["recovering", "backend-exit"]]);
  });

  test("lets a held ready out after its wait when the builder never arms", async () => {
    const { forwarded, gate: ready } = gate(20);
    ready.report("ready", "pid=12");
    await Bun.sleep(60);
    expect(forwarded).toEqual([["ready", "pid=12"]]);
  });
});
