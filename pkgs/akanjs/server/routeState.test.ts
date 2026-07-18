import { describe, expect, test } from "bun:test";
import type { PathRoute } from "akanjs/client";
import {
  AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER,
  type AkanHeadSnapshotV1,
  appendAkanRouterStateRequestHeaders,
  createAkanRouterState,
  decodeAkanHeadSnapshot,
  decodeAkanRouterState,
  decodeAkanRscPatchSegmentPath,
  encodeAkanHeadSnapshot,
  encodeAkanRouterState,
  encodeAkanRscPatchSegmentPath,
  readAkanRouterStateRequest,
  readAkanRscPatchMetadataResponseHeaders,
  resolveAkanRscPartialDecision,
  resolveAkanRscPatchDecision,
} from "./routeState";
import { resolveAkanRscHeadSafePatchDecision } from "./rscPatchSafety";

function makeRoute(path: string, pathSegments: string[], rootLayouts = 1, layouts = 0): PathRoute {
  return {
    path,
    pathSegments,
    renderPage: (() => null) as never,
    pageState: {} as never,
    renderRootLayouts: Array.from({ length: rootLayouts }, () => ({ render: () => null })),
    renderLayouts: Array.from({ length: layouts }, () => ({ render: () => null })),
  };
}

describe("RSC route state helpers", () => {
  test("creates stable segment keys from the route render stack", () => {
    const state = createAkanRouterState({
      pathRoute: makeRoute("/:lang/docs/:slug", ["/", "/:lang", "/docs", "/:slug"], 2, 1),
      href: "https://example.test/en/docs/intro",
      buildId: 7,
    });

    expect(state).toMatchObject({
      version: 1,
      buildId: 7,
      href: "https://example.test/en/docs/intro",
      routeId: "/:lang/docs/:slug",
    });
    expect(state.segments).toEqual([
      { kind: "root-layout", path: "/", key: "root:/:0" },
      { kind: "root-layout", path: "/:lang", key: "root:/:lang:1" },
      { kind: "layout", path: "/docs", key: "layout:/docs:2" },
      { kind: "page", path: "/:lang/docs/:slug", key: "page:/:lang/docs/:slug:3" },
    ]);
  });

  test("round-trips route state through base64url headers", () => {
    const state = createAkanRouterState({
      pathRoute: makeRoute("/docs", ["/", "/docs"]),
      href: "https://example.test/docs",
    });
    const encoded = encodeAkanRouterState(state);

    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(decodeAkanRouterState(encoded)).toEqual(state);

    const headers = new Headers();
    appendAkanRouterStateRequestHeaders(headers, state);
    expect(readAkanRouterStateRequest(headers)).toEqual({ state, currentRoute: "/docs" });
  });

  test("falls back quietly for malformed request state headers", () => {
    expect(readAkanRouterStateRequest(new Headers()).reason).toBe("missing-state");

    const wrongVersion = new Headers({
      "X-Akan-Rsc-State-Version": "2",
      "X-Akan-Rsc-Current-State": "bad",
    });
    expect(readAkanRouterStateRequest(wrongVersion)).toEqual({ state: null, reason: "version-mismatch" });

    const malformed = new Headers({
      "X-Akan-Rsc-State-Version": "1",
      "X-Akan-Rsc-Current-State": "bad",
    });
    expect(readAkanRouterStateRequest(malformed)).toEqual({ state: null, reason: "invalid-state" });
  });

  test("treats searchParams-only changes as partial candidates", () => {
    const pathRoute = makeRoute("/docs", ["/", "/docs"], 1, 1);
    const current = createAkanRouterState({
      pathRoute,
      href: "https://example.test/docs?page=1",
      buildId: 3,
    });
    const target = createAkanRouterState({
      pathRoute,
      href: "https://example.test/docs?page=2",
      buildId: 3,
    });

    expect(
      resolveAkanRscPartialDecision({ currentState: current, currentRoute: "/docs", targetState: target }),
    ).toEqual({
      status: "candidate",
      reason: "common-prefix",
      commonPrefixLength: 3,
    });
  });

  test("treats sibling pages under the same layout chain as partial candidates", () => {
    const current = createAkanRouterState({
      pathRoute: makeRoute("/docs/intro", ["/", "/docs", "/intro"], 1, 1),
      href: "https://example.test/docs/intro",
      buildId: 3,
    });
    const target = createAkanRouterState({
      pathRoute: makeRoute("/docs/api", ["/", "/docs", "/api"], 1, 1),
      href: "https://example.test/docs/api",
      buildId: 3,
    });

    expect(
      resolveAkanRscPartialDecision({ currentState: current, currentRoute: "/docs/intro", targetState: target }),
    ).toMatchObject({
      status: "candidate",
      reason: "common-prefix",
      commonPrefixLength: 2,
    });
  });

  test("promotes sibling page candidates to patch metadata", () => {
    const current = createAkanRouterState({
      pathRoute: makeRoute("/docs/intro", ["/", "/docs", "/intro"], 1, 1),
      href: "https://example.test/docs/intro",
      buildId: 3,
    });
    const target = createAkanRouterState({
      pathRoute: makeRoute("/docs/api", ["/", "/docs", "/api"], 1, 1),
      href: "https://example.test/docs/api",
      buildId: 3,
    });
    const partialDecision = resolveAkanRscPartialDecision({
      currentState: current,
      currentRoute: "/docs/intro",
      targetState: target,
    });

    expect(resolveAkanRscPatchDecision({ currentState: current, targetState: target, partialDecision })).toEqual({
      status: "patch",
      reason: "sibling-page",
      commonPrefixLength: 2,
      patch: {
        patchStartIndex: 2,
        patchStartSegmentKey: "page:/docs/api:2",
        segmentPath: ["root:/:0", "layout:/docs:1", "page:/docs/api:2"],
      },
    });
  });

  test("marks guarded sibling page patches head-safe only with explicit page opt-in", () => {
    const headSnapshot: AkanHeadSnapshotV1 = {
      version: 1,
      nodes: [{ tag: "title", text: "API" }],
    };
    const patchDecision = {
      status: "patch" as const,
      reason: "sibling-page",
      commonPrefixLength: 2,
      patch: {
        patchStartIndex: 2,
        patchStartSegmentKey: "page:/docs/api:2",
        segmentPath: ["root:/:0", "layout:/docs:1", "page:/docs/api:2"],
      },
    };

    expect(
      resolveAkanRscHeadSafePatchDecision({
        partialCommitEnabled: true,
        patchDecision,
        pageConfig: {},
      }),
    ).toEqual({ status: "full", reason: "head-unsafe", commonPrefixLength: 2 });
    expect(
      resolveAkanRscHeadSafePatchDecision({
        partialCommitEnabled: true,
        patchDecision,
        pageConfig: { rscPatchHeadSafe: true },
        headSnapshot,
      }),
    ).toEqual({
      ...patchDecision,
      patch: { ...patchDecision.patch, headSafe: true, headSnapshot },
    });
    expect(
      resolveAkanRscHeadSafePatchDecision({
        partialCommitEnabled: true,
        patchDecision,
        pageConfig: { rscPatchHeadSafe: true },
      }),
    ).toEqual({ status: "full", reason: "head-missing", commonPrefixLength: 2 });
    expect(
      resolveAkanRscHeadSafePatchDecision({
        partialCommitEnabled: true,
        patchDecision,
        pageConfig: { rscPatchHeadSafe: true },
        headSnapshot: {
          version: 1,
          nodes: Array.from({ length: 65 }, () => ({ tag: "title" as const, text: "Too many" })),
        },
      }),
    ).toEqual({ status: "full", reason: "head-invalid", commonPrefixLength: 2 });
  });

  test("promotes searchParams-only candidates to leaf page refresh patch metadata", () => {
    const pathRoute = makeRoute("/docs", ["/", "/docs"], 1, 1);
    const current = createAkanRouterState({
      pathRoute,
      href: "https://example.test/docs?page=1",
      buildId: 3,
    });
    const target = createAkanRouterState({
      pathRoute,
      href: "https://example.test/docs?page=2",
      buildId: 3,
    });
    const partialDecision = resolveAkanRscPartialDecision({
      currentState: current,
      currentRoute: "/docs",
      targetState: target,
    });

    expect(resolveAkanRscPatchDecision({ currentState: current, targetState: target, partialDecision })).toEqual({
      status: "patch",
      reason: "same-route-search-params",
      commonPrefixLength: 3,
      patch: {
        patchStartIndex: 2,
        patchStartSegmentKey: "page:/docs:2",
        segmentPath: ["root:/:0", "layout:/docs:1", "page:/docs:2"],
      },
    });
  });

  test("marks guarded searchParams-only patches head-safe with target route snapshot", () => {
    const pathRoute = makeRoute("/docs", ["/", "/docs"], 1, 1);
    const current = createAkanRouterState({
      pathRoute,
      href: "https://example.test/docs?page=1",
      buildId: 3,
    });
    const target = createAkanRouterState({
      pathRoute,
      href: "https://example.test/docs?page=2",
      buildId: 3,
    });
    const partialDecision = resolveAkanRscPartialDecision({
      currentState: current,
      currentRoute: "/docs",
      targetState: target,
    });
    const patchDecision = resolveAkanRscPatchDecision({ currentState: current, targetState: target, partialDecision });
    const headSnapshot: AkanHeadSnapshotV1 = {
      version: 1,
      nodes: [{ tag: "title", text: "Docs page 2" }],
    };

    expect(
      resolveAkanRscHeadSafePatchDecision({
        partialCommitEnabled: true,
        patchDecision,
        pageConfig: { rscPatchHeadSafe: true },
        headSnapshot,
      }),
    ).toEqual({
      ...patchDecision,
      patch: {
        patchStartIndex: 2,
        patchStartSegmentKey: "page:/docs:2",
        segmentPath: ["root:/:0", "layout:/docs:1", "page:/docs:2"],
        headSafe: true,
        headSnapshot,
      },
    });
  });

  test("round-trips patch segment path metadata through headers", () => {
    const segmentPath = ["root:/:0", "layout:/docs:1", "page:/docs/api:2"];
    const encoded = encodeAkanRscPatchSegmentPath(segmentPath);
    const headSnapshot: AkanHeadSnapshotV1 = { version: 1, nodes: [{ tag: "title", text: "API" }] };
    const encodedHeadSnapshot = encodeAkanHeadSnapshot(headSnapshot);
    if (!encodedHeadSnapshot) throw new Error("head snapshot did not encode");
    const headers = new Headers({
      "X-Akan-Rsc-Patch-Start-Index": "2",
      "X-Akan-Rsc-Patch-Segment-Path": encoded,
      "X-Akan-Rsc-Patch-Start-Segment": "page:/docs/api:2",
      "X-Akan-Rsc-Patch-Head-Safe": "1",
      [AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER]: encodedHeadSnapshot,
    });

    expect(encoded).not.toContain("/");
    expect(decodeAkanRscPatchSegmentPath(encoded)).toEqual(segmentPath);
    expect(decodeAkanHeadSnapshot(encodedHeadSnapshot)).toEqual({ status: "ok", snapshot: headSnapshot });
    expect(readAkanRscPatchMetadataResponseHeaders(headers)).toEqual({
      patchStartIndex: 2,
      patchStartSegmentKey: "page:/docs/api:2",
      segmentPath,
      headSafe: true,
      headSnapshot,
    });
  });

  test("rejects invalid and oversized head snapshot headers", () => {
    const largeSnapshot: AkanHeadSnapshotV1 = {
      version: 1,
      nodes: [{ tag: "meta", attrs: { name: "description", content: "x".repeat(20_000) } }],
    };
    const encoded = encodeAkanHeadSnapshot(largeSnapshot);
    const segmentPath = ["root:/:0", "layout:/docs:1", "page:/docs/api:2"];

    expect(encoded).toBeNull();
    expect(decodeAkanHeadSnapshot("not-json")).toEqual({ status: "invalid" });
    expect(
      readAkanRscPatchMetadataResponseHeaders(
        new Headers({
          "X-Akan-Rsc-Patch-Start-Index": "2",
          "X-Akan-Rsc-Patch-Segment-Path": encodeAkanRscPatchSegmentPath(segmentPath),
          "X-Akan-Rsc-Patch-Start-Segment": "page:/docs/api:2",
          [AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER]: "x".repeat(13 * 1024),
        }),
      ),
    ).toMatchObject({ headSnapshotFailure: "head-too-large" });
  });

  test("rejects patch metadata when start index header is missing", () => {
    const segmentPath = ["root:/:0", "layout:/docs:1", "page:/docs/api:2"];
    const headers = new Headers({
      "X-Akan-Rsc-Patch-Segment-Path": encodeAkanRscPatchSegmentPath(segmentPath),
      "X-Akan-Rsc-Patch-Start-Segment": "root:/:0",
    });

    expect(readAkanRscPatchMetadataResponseHeaders(headers)).toBeNull();
  });

  test("keeps invalid or incompatible states on the full fallback path", () => {
    const current = createAkanRouterState({
      pathRoute: makeRoute("/docs", ["/", "/docs"]),
      href: "https://example.test/docs",
      buildId: 1,
    });
    const target = createAkanRouterState({
      pathRoute: makeRoute("/blog", ["/blog"]),
      href: "https://example.test/blog",
      buildId: 1,
    });

    expect(resolveAkanRscPartialDecision({ currentState: null, targetState: target })).toMatchObject({
      status: "full",
      reason: "missing-state",
    });
    expect(
      resolveAkanRscPartialDecision({ currentState: current, currentRoute: "/other", targetState: target }),
    ).toMatchObject({
      status: "fallback",
      reason: "current-route-mismatch",
    });
    expect(
      resolveAkanRscPartialDecision({
        currentState: { ...current, buildId: 1 },
        targetState: { ...target, buildId: 2 },
      }),
    ).toMatchObject({ status: "fallback", reason: "build-mismatch" });
    expect(resolveAkanRscPartialDecision({ currentState: current, targetState: target })).toMatchObject({
      status: "full",
      reason: "root-mismatch",
    });
  });
});
