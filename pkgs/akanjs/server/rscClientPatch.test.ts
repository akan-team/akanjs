import { describe, expect, test } from "bun:test";
import {
  AKAN_RSC_RESPONSE_STATE_HEADER,
  type AkanHeadSnapshotV1,
  type AkanRouterStateV1,
  type AkanRscPatchMetadata,
  encodeAkanRouterState,
} from "./routeState";
import { validateRscPatchAndRequestFullFallback, validateRscPatchForGuardedCommit } from "./rscClientPatch";
import { RSC_CONTENT_TYPE } from "./rscHttp";
import { createAkanSegmentCacheTree, createRscNavigationCacheNode } from "./rscNavigationState";

function makeRouterState(href: string, routeId: string): AkanRouterStateV1 {
  return {
    version: 1,
    buildId: 3,
    href,
    routeId,
    segments: [
      { kind: "root-layout", path: "/", key: "root:/:0" },
      { kind: "layout", path: "/docs", key: "layout:/docs:1" },
      { kind: "page", path: routeId, key: `page:${routeId}:2` },
    ],
  };
}

function makePatch(routeId = "/docs/api"): AkanRscPatchMetadata {
  return {
    patchStartIndex: 2,
    patchStartSegmentKey: `page:${routeId}:2`,
    segmentPath: ["root:/:0", "layout:/docs:1", `page:${routeId}:2`],
  };
}

function makeHeadSnapshot(title = "API"): AkanHeadSnapshotV1 {
  return { version: 1, nodes: [{ tag: "title", text: title }] };
}

function textStream(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

describe("rscClient patch fallback flow", () => {
  test("decodes a patch response, validates the segment patch, and requests full fallback", async () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );
    const response = new Response(textStream("patch flight"), {
      headers: {
        "Content-Type": RSC_CONTENT_TYPE,
        [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(targetState),
      },
    });
    let decodedPatchPayload = "";

    const result = await validateRscPatchAndRequestFullFallback({
      href: targetState.href,
      response,
      patch: makePatch("/docs/api"),
      currentTree,
      navId: 7,
      getCurrentNavId: () => 7,
      createThenable: (stream) =>
        new Response(stream).text().then((text) => {
          decodedPatchPayload = text;
          return "api";
        }),
    });

    expect(decodedPatchPayload).toBe("patch flight");
    expect(result.sendRouterState).toBe(false);
    expect(result.patchResult.status).toBe("patched");
    if (result.patchResult.status !== "patched") return;
    expect(result.patchResult.patchedNode.segment.key).toBe("page:/docs/api:2");
    expect(result.patchResult.outletKey).toBe("slot:layout:/docs:1:2");
    expect(result.patchResult.patchedNode.thenable).resolves.toBe("api");
  });

  test("still requests full fallback when patch decode fails", async () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );
    const response = new Response(textStream("bad patch flight"), {
      headers: {
        "Content-Type": RSC_CONTENT_TYPE,
        [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(targetState),
      },
    });

    const result = await validateRscPatchAndRequestFullFallback({
      href: targetState.href,
      response,
      patch: makePatch("/docs/api"),
      currentTree,
      createThenable: () => Promise.reject(new Error("decode failed")),
    });

    expect(result.sendRouterState).toBe(false);
    expect(result.patchResult).toEqual({ status: "rejected", reason: "decode-error" });
  });

  test("rejects guarded patch commits when the explicit guard is disabled", async () => {
    let decodedPatchPayload = "";
    const result = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: false,
      href: "https://example.test/docs/api",
      response: new Response(textStream("patch flight"), { headers: { "Content-Type": RSC_CONTENT_TYPE } }),
      patch: makePatch("/docs/api"),
      currentTree: null,
      createThenable: (stream) =>
        new Response(stream).text().then((text) => {
          decodedPatchPayload = text;
          return "api";
        }),
    });

    expect(decodedPatchPayload).toBe("patch flight");
    expect(result).toEqual({ status: "rejected", reason: "guard-disabled" });
  });

  test("rejects guarded patch commits when the target outlet is not mounted", async () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );
    const response = new Response(textStream("patch flight"), {
      headers: {
        "Content-Type": RSC_CONTENT_TYPE,
        [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(targetState),
      },
    });

    const result = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: true,
      href: targetState.href,
      response,
      patch: { ...makePatch("/docs/api"), headSafe: true, headSnapshot: makeHeadSnapshot() },
      currentTree,
      createThenable: (stream) => new Response(stream).text().then(() => "api"),
    });

    expect(result).toEqual({ status: "rejected", reason: "outlet-missing" });
  });

  test("accepts guarded patch commits when metadata is head-safe and the outlet is mounted", async () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );
    const response = new Response(textStream("patch flight"), {
      headers: {
        "Content-Type": RSC_CONTENT_TYPE,
        [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(targetState),
      },
    });
    globalThis.__AKAN_RSC_SEGMENT_OUTLET_STORE__ = {
      entries: new Map(),
      listeners: new Map([["slot:layout:/docs:1:2", new Set([() => {}])]]),
    };

    try {
      const result = await validateRscPatchForGuardedCommit({
        partialCommitEnabled: true,
        href: targetState.href,
        response,
        patch: { ...makePatch("/docs/api"), headSafe: true, headSnapshot: makeHeadSnapshot() },
        currentTree,
        createThenable: (stream) => new Response(stream).text().then(() => "api"),
      });

      expect(result.status).toBe("patched");
      if (result.status !== "patched") return;
      expect(result.patchedNode.segment.key).toBe("page:/docs/api:2");
      expect(result.outletKey).toBe("slot:layout:/docs:1:2");
      expect(result.headSnapshot).toEqual(makeHeadSnapshot());
      expect(result.patchedNode.thenable).resolves.toBe("api");
    } finally {
      delete globalThis.__AKAN_RSC_SEGMENT_OUTLET_STORE__;
    }
  });

  test("accepts guarded same-route searchParams patch commits when the page outlet is mounted", async () => {
    const currentState = makeRouterState("https://example.test/docs?page=1", "/docs");
    const targetState = makeRouterState("https://example.test/docs?page=2", "/docs");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("page 1"),
        routerState: currentState,
      }),
    );
    const response = new Response(textStream("patch flight"), {
      headers: {
        "Content-Type": RSC_CONTENT_TYPE,
        [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(targetState),
      },
    });
    globalThis.__AKAN_RSC_SEGMENT_OUTLET_STORE__ = {
      entries: new Map(),
      listeners: new Map([["slot:layout:/docs:1:2", new Set([() => {}])]]),
    };

    try {
      const result = await validateRscPatchForGuardedCommit({
        partialCommitEnabled: true,
        href: targetState.href,
        response,
        patch: { ...makePatch("/docs"), headSafe: true, headSnapshot: makeHeadSnapshot("Docs page 2") },
        currentTree,
        createThenable: (stream) => new Response(stream).text().then(() => "page 2"),
      });

      expect(result.status).toBe("patched");
      if (result.status !== "patched") return;
      expect(result.patchedNode.segment.key).toBe("page:/docs:2");
      expect(result.patchedNode.href).toBe("https://example.test/docs?page=2");
      expect(result.outletKey).toBe("slot:layout:/docs:1:2");
      expect(result.headSnapshot).toEqual(makeHeadSnapshot("Docs page 2"));
      expect(result.patchedNode.thenable).resolves.toBe("page 2");
    } finally {
      delete globalThis.__AKAN_RSC_SEGMENT_OUTLET_STORE__;
    }
  });

  test("rejects guarded patch commits without explicit head safety", async () => {
    let decodedPatchPayload = "";
    const result = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: true,
      href: "https://example.test/docs/api",
      response: new Response(textStream("patch flight"), { headers: { "Content-Type": RSC_CONTENT_TYPE } }),
      patch: makePatch("/docs/api"),
      currentTree: null,
      createThenable: (stream) =>
        new Response(stream).text().then((text) => {
          decodedPatchPayload = text;
          return "api";
        }),
    });

    expect(decodedPatchPayload).toBe("patch flight");
    expect(result).toEqual({ status: "rejected", reason: "head-unsafe" });
  });

  test("rejects guarded patch commits without a valid head snapshot", async () => {
    const missingResult = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: true,
      href: "https://example.test/docs/api",
      response: new Response(textStream("patch flight"), { headers: { "Content-Type": RSC_CONTENT_TYPE } }),
      patch: { ...makePatch("/docs/api"), headSafe: true },
      currentTree: null,
      createThenable: (stream) => new Response(stream).text().then(() => "api"),
    });
    const invalidResult = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: true,
      href: "https://example.test/docs/api",
      response: new Response(textStream("patch flight"), { headers: { "Content-Type": RSC_CONTENT_TYPE } }),
      patch: { ...makePatch("/docs/api"), headSafe: true, headSnapshotFailure: "head-invalid" },
      currentTree: null,
      createThenable: (stream) => new Response(stream).text().then(() => "api"),
    });

    expect(missingResult).toEqual({ status: "rejected", reason: "head-missing" });
    expect(invalidResult).toEqual({ status: "rejected", reason: "head-invalid" });
  });

  test("rejects patch payloads that contain redirect or error rows", async () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );
    const headers = {
      "Content-Type": RSC_CONTENT_TYPE,
      [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(targetState),
    };

    const redirectResult = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: true,
      href: targetState.href,
      response: new Response(textStream('a:E{"digest":"AKAN_REDIRECT;push;307;%2Flogin","name":"Error"}\n'), {
        headers,
      }),
      patch: { ...makePatch("/docs/api"), headSafe: true, headSnapshot: makeHeadSnapshot() },
      currentTree,
      createThenable: (stream) => new Response(stream).text().then(() => "api"),
    });
    const errorResult = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: true,
      href: targetState.href,
      response: new Response(textStream('b:E{"digest":"AKAN_RENDER_ERROR","name":"Error","message":"Boom"}\n'), {
        headers,
      }),
      patch: { ...makePatch("/docs/api"), headSafe: true, headSnapshot: makeHeadSnapshot() },
      currentTree,
      createThenable: (stream) => new Response(stream).text().then(() => "api"),
    });

    expect(redirectResult).toEqual({ status: "rejected", reason: "redirect-in-patch" });
    expect(errorResult).toEqual({ status: "rejected", reason: "error-in-patch" });
  });
});
