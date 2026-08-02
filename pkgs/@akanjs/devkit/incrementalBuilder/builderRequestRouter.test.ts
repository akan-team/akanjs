import { describe, expect, test } from "bun:test";
import type { BuilderReq, BuilderRes } from "akanjs/server";
import { BuilderRequestRouter } from "./builderRequestRouter";

const routeReq = (id: number, routeId: string): BuilderReq => ({
  type: "build-route",
  id,
  routeId,
  seeds: [],
  knownEntries: [],
});

/** `routeId` is what tells one generation's answer from the other's; the rest is an empty delta. */
const routeRes = (id: number, routeId: string): Extract<BuilderRes, { ok: true }> => ({
  type: "build-route-res",
  id,
  ok: true,
  data: { manifestDelta: {}, ssrManifestDelta: {}, newEntries: [], clientDeps: [], routeId },
});

describe("BuilderRequestRouter", () => {
  test("renumbers a request on the way out and restores the backend's id on the answer", () => {
    const router = new BuilderRequestRouter();
    router.startGeneration();

    // Everything but the id travels untouched; the builder never learns it was renumbered.
    const first = router.issue(routeReq(1, "/home"));
    const second = router.issue(routeReq(2, "/about"));
    expect(first.routeId).toBe("/home");
    expect(first.id).not.toBe(second.id);
    expect(router.inFlightCount).toBe(2);

    expect(router.settle(routeRes(first.id, "/home"))?.id).toBe(1);
    expect(router.settle(routeRes(second.id, "/about"))?.id).toBe(2);
    expect(router.inFlightCount).toBe(0);
  });

  /**
   * The defect this class exists for. `BuilderRpc` numbers from 1 in every backend process, so without
   * renumbering the second generation's `id: 1` request is settled by the first generation's answer —
   * a page rendered against another route's client manifest — and its own answer is then dropped.
   */
  test("does not deliver a dead generation's answer to the backend that replaced it", () => {
    const router = new BuilderRequestRouter();
    router.startGeneration();
    const stale = router.issue(routeReq(1, "/old"));

    router.startGeneration();
    const fresh = router.issue(routeReq(1, "/new"));
    expect(fresh.id).not.toBe(stale.id);

    expect(router.settle(routeRes(stale.id, "/old"))).toBeNull();
    const answer = router.settle(routeRes(fresh.id, "/new"));
    expect(answer?.id).toBe(1);
    expect(answer?.data.routeId).toBe("/new");
  });

  test("drops an answer that arrives twice, and one nobody asked for", () => {
    const router = new BuilderRequestRouter();
    router.startGeneration();
    const outgoing = router.issue(routeReq(7, "/home"));

    expect(router.settle(routeRes(outgoing.id, "/home"))?.id).toBe(7);
    expect(router.settle(routeRes(outgoing.id, "/home"))).toBeNull();
    expect(router.settle(routeRes(9999, "/home"))).toBeNull();
  });

  test("withdraw releases an id whose send failed", () => {
    const router = new BuilderRequestRouter();
    router.startGeneration();
    const outgoing = router.issue(routeReq(4, "/home"));

    // The caller answers the backend itself in this case, so a late builder answer must not answer it again.
    router.withdraw(outgoing.id);
    expect(router.inFlightCount).toBe(0);
    expect(router.settle(routeRes(outgoing.id, "/home"))).toBeNull();
  });

  test("abandons the previous generation's requests rather than carrying them forward", () => {
    const router = new BuilderRequestRouter();
    router.startGeneration();
    router.issue(routeReq(1, "/a"));
    router.issue(routeReq(2, "/b"));
    expect(router.inFlightCount).toBe(2);

    expect(router.startGeneration()).toBe(2);
    expect(router.inFlightCount).toBe(0);
  });
});
