import { describe, expect, test } from "bun:test";
import { joinBytes, rowShapedText, textRow } from "./flightRows.fixture";
import {
  AKAN_RSC_RESPONSE_STATE_HEADER,
  type AkanHeadSnapshotV1,
  type AkanRouterStateV1,
  encodeAkanRouterState,
} from "./routeState";
import { validateRscPatchAndRequestFullFallback, validateRscPatchForGuardedCommit } from "./rscClientPatch";
import { RSC_CONTENT_TYPE } from "./rscHttp";
import { makePatch, makeRouterState, makeTreeOf } from "./rscNavigation.fixture";

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

const patchResponse = (body: string, targetState: AkanRouterStateV1) =>
  new Response(textStream(body), {
    headers: { "Content-Type": RSC_CONTENT_TYPE, [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(targetState) },
  });

describe("rscClient patch fallback flow", () => {
  test("decodes a patch response, validates the segment patch, and requests full fallback", async () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = makeTreeOf(currentState, "intro");
    const response = patchResponse("patch flight", targetState);
    let decodedPatchPayload = "";

    const result = await validateRscPatchAndRequestFullFallback({
      href: targetState.href,
      response,
      patch: makePatch("/docs/api"),
      currentTree,
      navId: 7,
      getCurrentNavId: () => 7,
      createThenable: (rows) =>
        new Response(rows()).text().then((text) => {
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
    const currentTree = makeTreeOf(currentState, "intro");
    const response = patchResponse("bad patch flight", targetState);

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
      createThenable: (rows) =>
        new Response(rows()).text().then((text) => {
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
    const currentTree = makeTreeOf(currentState, "intro");
    const response = patchResponse("patch flight", targetState);

    const result = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: true,
      href: targetState.href,
      response,
      patch: { ...makePatch("/docs/api"), headSafe: true, headSnapshot: makeHeadSnapshot() },
      currentTree,
      createThenable: (rows) => new Response(rows()).text().then(() => "api"),
    });

    expect(result).toEqual({ status: "rejected", reason: "outlet-missing" });
  });

  test("accepts guarded patch commits when metadata is head-safe and the outlet is mounted", async () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = makeTreeOf(currentState, "intro");
    const response = patchResponse("patch flight", targetState);
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
        createThenable: (rows) => new Response(rows()).text().then(() => "api"),
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
    const currentTree = makeTreeOf(currentState, "page 1");
    const response = patchResponse("patch flight", targetState);
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
        createThenable: (rows) => new Response(rows()).text().then(() => "page 2"),
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
      createThenable: (rows) =>
        new Response(rows()).text().then((text) => {
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
      createThenable: (rows) => new Response(rows()).text().then(() => "api"),
    });
    const invalidResult = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: true,
      href: "https://example.test/docs/api",
      response: new Response(textStream("patch flight"), { headers: { "Content-Type": RSC_CONTENT_TYPE } }),
      patch: { ...makePatch("/docs/api"), headSafe: true, headSnapshotFailure: "head-invalid" },
      currentTree: null,
      createThenable: (rows) => new Response(rows()).text().then(() => "api"),
    });

    expect(missingResult).toEqual({ status: "rejected", reason: "head-missing" });
    expect(invalidResult).toEqual({ status: "rejected", reason: "head-invalid" });
  });

  test("rejects patch payloads that contain redirect or error rows", async () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = makeTreeOf(currentState, "intro");

    const redirectResult = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: true,
      href: targetState.href,
      response: patchResponse('a:E{"digest":"AKAN_REDIRECT;push;307;%2Flogin","name":"Error"}\n', targetState),
      patch: { ...makePatch("/docs/api"), headSafe: true, headSnapshot: makeHeadSnapshot() },
      currentTree,
      createThenable: (rows) => new Response(rows()).text().then(() => "api"),
    });
    const errorResult = await validateRscPatchForGuardedCommit({
      partialCommitEnabled: true,
      href: targetState.href,
      response: patchResponse('b:E{"digest":"AKAN_RENDER_ERROR","name":"Error","message":"Boom"}\n', targetState),
      patch: { ...makePatch("/docs/api"), headSafe: true, headSnapshot: makeHeadSnapshot() },
      currentTree,
      createThenable: (rows) => new Response(rows()).text().then(() => "api"),
    });

    expect(redirectResult).toEqual({ status: "rejected", reason: "redirect-in-patch" });
    expect(errorResult).toEqual({ status: "rejected", reason: "error-in-patch" });
  });

  test("keeps a patch whose long text holds lines shaped like redirect or error rows", async () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const body = new TextDecoder().decode(joinBytes(textRow("1", rowShapedText), '0:"$1"\n'));

    const result = await validateRscPatchAndRequestFullFallback({
      href: targetState.href,
      response: patchResponse(body, targetState),
      patch: makePatch("/docs/api"),
      currentTree: makeTreeOf(currentState, "intro"),
      createThenable: (rows) => new Response(rows()).text().then(() => "api"),
    });

    expect(result.patchResult.status).toBe("patched");
  });
});
