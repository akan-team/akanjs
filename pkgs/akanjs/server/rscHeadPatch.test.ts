import { afterEach, describe, expect, test } from "bun:test";
import { readRscRoutePatch, subscribeRscRoutePatch, writeRscRoutePatch } from "../client/rscRoutePatch";
import type { AkanHeadSnapshotV1 } from "./routeState";
import {
  applyAkanHeadSnapshotPatch,
  canApplyAkanHeadSnapshotPatch,
  commitPreparedAkanHeadSnapshotPatch,
  getAkanHeadSnapshotPatchFailureReason,
  prepareAkanHeadSnapshotPatch,
  rollbackPreparedAkanHeadSnapshotPatch,
} from "./rscHeadPatch";

const api: AkanHeadSnapshotV1 = {
  version: 1,
  nodes: [
    { tag: "title", text: "API" },
    { tag: "meta", attrs: { name: "description", content: "Docs API" } },
  ],
};

const mountHead = () => subscribeRscRoutePatch(() => undefined, { head: true });

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__AKAN_RSC_ROUTE_PATCH__");
});

describe("RSC head snapshot patch", () => {
  test("hands the snapshot and its href to the mounted route head and every route listener", () => {
    const unmount = mountHead();
    const heard: string[] = [];
    subscribeRscRoutePatch(() => heard.push(readRscRoutePatch()?.href ?? "none"));

    expect(getAkanHeadSnapshotPatchFailureReason(api)).toBeNull();
    expect(canApplyAkanHeadSnapshotPatch(api)).toBe(true);
    expect(applyAkanHeadSnapshotPatch(api, "/en/docs/api")).toBe(true);
    expect(readRscRoutePatch()).toEqual({ href: "/en/docs/api", head: api });
    expect(heard).toEqual(["/en/docs/api"]);
    unmount();
  });

  test("refuses a patch while no route head is mounted to render it", () => {
    expect(getAkanHeadSnapshotPatchFailureReason(api)).toBe("head-missing");
    expect(prepareAkanHeadSnapshotPatch(api, "/en/docs/api")).toBeNull();
    expect(applyAkanHeadSnapshotPatch(api, "/en/docs/api")).toBe(false);

    const unmount = mountHead();
    unmount();
    expect(canApplyAkanHeadSnapshotPatch(api)).toBe(false);
    expect(readRscRoutePatch()).toBeNull();
  });

  test("refuses a snapshot without a node list", () => {
    mountHead();
    expect(getAkanHeadSnapshotPatchFailureReason({ version: 1 } as unknown as AkanHeadSnapshotV1)).toBe("head-invalid");
  });

  test("a rollback puts back the patch that was showing when the navigation was prepared", () => {
    mountHead();
    const intro: AkanHeadSnapshotV1 = { version: 1, nodes: [{ tag: "title", text: "Intro" }] };
    writeRscRoutePatch({ href: "/en/docs/intro", head: intro });
    const prepared = prepareAkanHeadSnapshotPatch(api, "/en/docs/api");
    if (!prepared) throw new Error("head patch was not prepared");

    expect(commitPreparedAkanHeadSnapshotPatch(prepared)).toBe(true);
    expect(readRscRoutePatch()?.href).toBe("/en/docs/api");
    rollbackPreparedAkanHeadSnapshotPatch(prepared);
    expect(readRscRoutePatch()).toEqual({ href: "/en/docs/intro", head: intro });
  });

  test("a commit after the route head unmounted writes nothing", () => {
    const unmount = mountHead();
    const prepared = prepareAkanHeadSnapshotPatch(api, "/en/docs/api");
    if (!prepared) throw new Error("head patch was not prepared");
    unmount();

    expect(commitPreparedAkanHeadSnapshotPatch(prepared)).toBe(false);
    expect(readRscRoutePatch()).toBeNull();
  });
});
