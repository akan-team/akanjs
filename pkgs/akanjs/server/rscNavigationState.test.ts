import { describe, expect, test } from "bun:test";
import type { AkanRouterStateV1, AkanRscPatchMetadata } from "./routeState";
import {
  applyAkanSegmentCachePatch,
  commitLatestRscNavigation,
  commitRscNavigation,
  createAkanSegmentCacheTree,
  createRscNavigationCacheNode,
  createRscPatchNavigationCacheNode,
  deleteRscCacheEntryIfCurrent,
  observeRscNavigation,
  observeRscNavigationNode,
  type RscNavigationCacheNode,
  rememberRscCacheEntry,
  rememberRscCacheNode,
  rememberRscPatchCacheNode,
  resolveCachedRscPatchNavigation,
} from "./rscNavigationState";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
type TestCacheNode = RscNavigationCacheNode<Promise<string>>;

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

describe("RSC navigation state helpers", () => {
  test("commits a pending thenable immediately inside the transition", () => {
    const cache = new Map<string, Promise<string>>();
    const thenable = new Promise<string>(() => {});
    const calls: unknown[] = [];

    commitRscNavigation({
      cache,
      href: "https://example.test/next",
      thenable,
      maxEntries: 32,
      startTransition: (callback) => {
        calls.push("transition");
        callback();
      },
      commitThenable: (value) => calls.push(["commit", value]),
      updateHistory: () => calls.push("history"),
      scrollToTop: true,
      bumpScrollToTop: () => calls.push("scroll"),
    });

    expect(cache.get("https://example.test/next")).toBe(thenable);
    expect(calls).toEqual(["transition", ["commit", thenable], "history", "scroll"]);
  });

  test("does not commit stale navigation results", () => {
    const cache = new Map<string, Promise<string>>();
    const thenable = Promise.resolve("stale");
    const calls: unknown[] = [];

    const committed = commitLatestRscNavigation({
      cache,
      href: "https://example.test/stale",
      thenable,
      maxEntries: 32,
      navId: 1,
      getCurrentNavId: () => 2,
      startTransition: (callback) => {
        calls.push("transition");
        callback();
      },
      commitThenable: (value) => calls.push(["commit", value]),
      updateHistory: () => calls.push("history"),
      scrollToTop: true,
      bumpScrollToTop: () => calls.push("scroll"),
    });

    expect(committed).toBe(false);
    expect(cache.has("https://example.test/stale")).toBe(false);
    expect(calls).toEqual([]);
  });

  test("commits latest navigation results", () => {
    const cache = new Map<string, Promise<string>>();
    const thenable = Promise.resolve("latest");
    const calls: unknown[] = [];

    const committed = commitLatestRscNavigation({
      cache,
      href: "https://example.test/latest",
      thenable,
      maxEntries: 32,
      navId: 2,
      getCurrentNavId: () => 2,
      startTransition: (callback) => {
        calls.push("transition");
        callback();
      },
      commitThenable: (value) => calls.push(["commit", value]),
      updateHistory: () => calls.push("history"),
      scrollToTop: true,
      bumpScrollToTop: () => calls.push("scroll"),
    });

    expect(committed).toBe(true);
    expect(cache.get("https://example.test/latest")).toBe(thenable);
    expect(calls).toEqual(["transition", ["commit", thenable], "history", "scroll"]);
  });

  test("evicts the oldest cache entry when remembering a new thenable", () => {
    const cache = new Map<string, Promise<string>>();
    const first = Promise.resolve("first");
    const second = Promise.resolve("second");
    const third = Promise.resolve("third");

    rememberRscCacheEntry(cache, "/a", first, 2);
    rememberRscCacheEntry(cache, "/b", second, 2);
    rememberRscCacheEntry(cache, "/c", third, 2);

    expect(cache.has("/a")).toBe(false);
    expect(cache.get("/b")).toBe(second);
    expect(cache.get("/c")).toBe(third);
  });

  test("deletes cache entries only when the rejected thenable is current", async () => {
    const cache = new Map<string, Promise<string>>();
    const oldThenable = Promise.reject(new Error("old"));
    oldThenable.catch(() => {});
    const currentThenable = Promise.resolve("current");
    const errors: unknown[] = [];

    cache.set("/target", currentThenable);
    observeRscNavigation({
      cache,
      href: "/target",
      thenable: oldThenable,
      navId: 1,
      getCurrentNavId: () => 1,
      onLatestError: (error) => errors.push(error),
    });

    await tick();

    expect(cache.get("/target")).toBe(currentThenable);
    expect(errors).toHaveLength(1);
  });

  test("ignores stale navigation failures after cleaning up only the stale entry", async () => {
    const cache = new Map<string, Promise<string>>();
    const staleThenable = Promise.reject(new Error("stale"));
    staleThenable.catch(() => {});
    const errors: unknown[] = [];

    cache.set("/stale", staleThenable);
    observeRscNavigation({
      cache,
      href: "/stale",
      thenable: staleThenable,
      navId: 1,
      getCurrentNavId: () => 2,
      onLatestError: (error) => errors.push(error),
    });

    await tick();

    expect(cache.has("/stale")).toBe(false);
    expect(errors).toEqual([]);
  });

  test("does not remove a newer same-href navigation when a stale thenable rejects", async () => {
    const cache = new Map<string, Promise<string>>();
    const staleThenable = Promise.reject(new Error("stale"));
    staleThenable.catch(() => {});
    const latestThenable = Promise.resolve("latest");
    const errors: unknown[] = [];

    cache.set("/same", latestThenable);
    observeRscNavigation({
      cache,
      href: "/same",
      thenable: staleThenable,
      navId: 1,
      getCurrentNavId: () => 2,
      onLatestError: (error) => errors.push(error),
    });

    await tick();

    expect(cache.get("/same")).toBe(latestThenable);
    expect(errors).toEqual([]);
  });

  test("ignores expected redirect navigation errors", async () => {
    const cache = new Map<string, Promise<string>>();
    const redirectError = new Error("redirect started");
    const thenable = Promise.reject(redirectError);
    thenable.catch(() => {});
    const errors: unknown[] = [];

    cache.set("/redirect", thenable);
    observeRscNavigation({
      cache,
      href: "/redirect",
      thenable,
      navId: 1,
      getCurrentNavId: () => 1,
      isExpectedNavigationError: (error) => error === redirectError,
      onLatestError: (error) => errors.push(error),
    });

    await tick();

    expect(cache.has("/redirect")).toBe(false);
    expect(errors).toEqual([]);
  });

  test("does not delete a newer thenable explicitly", () => {
    const cache = new Map<string, Promise<string>>();
    const oldThenable = Promise.resolve("old");
    const newThenable = Promise.resolve("new");
    cache.set("/target", newThenable);

    expect(deleteRscCacheEntryIfCurrent(cache, "/target", oldThenable)).toBe(false);
    expect(cache.get("/target")).toBe(newThenable);
    expect(deleteRscCacheEntryIfCurrent(cache, "/target", newThenable)).toBe(true);
    expect(cache.has("/target")).toBe(false);
  });

  test("keeps thenable and route state together in navigation cache nodes", () => {
    const cache = new Map<string, TestCacheNode>();
    const thenable = Promise.resolve("node");
    const node = createRscNavigationCacheNode({
      href: "https://example.test/node",
      thenable,
      routerState: {
        version: 1,
        href: "https://example.test/node",
        routeId: "/node",
        segments: [{ kind: "page", path: "/node", key: "page:/node:0" }],
      },
    });

    rememberRscCacheNode(cache, node, 32);

    expect(cache.get("https://example.test/node")).toBe(node);
    expect(cache.get("https://example.test/node")?.thenable).toBe(thenable);
    expect(cache.get("https://example.test/node")?.routerState?.routeId).toBe("/node");
  });

  test("evicts the oldest navigation cache node", () => {
    const cache = new Map<string, TestCacheNode>();
    const first = createRscNavigationCacheNode({ href: "/a", thenable: Promise.resolve("a"), routerState: null });
    const second = createRscNavigationCacheNode({ href: "/b", thenable: Promise.resolve("b"), routerState: null });
    const third = createRscNavigationCacheNode({ href: "/c", thenable: Promise.resolve("c"), routerState: null });

    rememberRscCacheNode(cache, first, 2);
    rememberRscCacheNode(cache, second, 2);
    rememberRscCacheNode(cache, third, 2);

    expect(cache.has("/a")).toBe(false);
    expect(cache.get("/b")).toBe(second);
    expect(cache.get("/c")).toBe(third);
  });

  test("commits latest navigation cache nodes through the existing stale guard", () => {
    const cache = new Map<string, TestCacheNode>();
    const node = createRscNavigationCacheNode({
      href: "https://example.test/latest-node",
      thenable: Promise.resolve("latest-node"),
      routerState: null,
    });
    const calls: unknown[] = [];

    const committed = commitLatestRscNavigation({
      cache,
      href: node.href,
      thenable: node,
      maxEntries: 32,
      navId: 2,
      getCurrentNavId: () => 2,
      startTransition: (callback) => {
        calls.push("transition");
        callback();
      },
      commitThenable: (value) => calls.push(["commit", value.thenable]),
    });

    expect(committed).toBe(true);
    expect(cache.get(node.href)).toBe(node);
    expect(calls).toEqual(["transition", ["commit", node.thenable]]);
  });

  test("does not commit stale navigation cache nodes", () => {
    const cache = new Map<string, TestCacheNode>();
    const node = createRscNavigationCacheNode({
      href: "https://example.test/stale-node",
      thenable: Promise.resolve("stale-node"),
      routerState: null,
    });
    const calls: unknown[] = [];

    const committed = commitLatestRscNavigation({
      cache,
      href: node.href,
      thenable: node,
      maxEntries: 32,
      navId: 1,
      getCurrentNavId: () => 2,
      startTransition: (callback) => {
        calls.push("transition");
        callback();
      },
      commitThenable: (value) => calls.push(["commit", value.thenable]),
    });

    expect(committed).toBe(false);
    expect(cache.has(node.href)).toBe(false);
    expect(calls).toEqual([]);
  });

  test("does not remove a newer same-href navigation node when a stale node rejects", async () => {
    const cache = new Map<string, TestCacheNode>();
    const staleThenable: Promise<string> = Promise.reject(new Error("stale node"));
    staleThenable.catch(() => {});
    const staleNode = createRscNavigationCacheNode({ href: "/same-node", thenable: staleThenable, routerState: null });
    const latestNode = createRscNavigationCacheNode({
      href: "/same-node",
      thenable: Promise.resolve("latest node"),
      routerState: null,
    });
    const errors: unknown[] = [];

    cache.set("/same-node", latestNode);
    observeRscNavigationNode({
      cache,
      node: staleNode,
      navId: 1,
      getCurrentNavId: () => 2,
      onLatestError: (error) => errors.push(error),
    });

    await tick();

    expect(cache.get("/same-node")).toBe(latestNode);
    expect(errors).toEqual([]);
  });

  test("reuses navigation cache nodes without router state", () => {
    const cache = new Map<string, TestCacheNode>();
    const thenable = Promise.resolve("full fallback node");
    const node = createRscNavigationCacheNode({ href: "/no-state", thenable, routerState: null });

    rememberRscCacheNode(cache, node, 32);

    const cached = cache.get("/no-state");
    expect(cached).toBe(node);
    expect(cached?.thenable).toBe(thenable);
    expect(cached?.routerState).toBeNull();
  });

  test("creates a single route chain segment cache tree from a full navigation node", () => {
    const thenable = Promise.resolve("intro");
    const routerState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const tree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: routerState.href,
        thenable,
        routerState,
      }),
    );

    expect(tree?.segment.key).toBe("root:/:0");
    expect(tree?.children[0]?.segment.key).toBe("layout:/docs:1");
    expect(tree?.children[0]?.children[0]?.segment.key).toBe("page:/docs/intro:2");
    expect(tree?.children[0]?.children[0]?.thenable).toBe(thenable);
  });

  test("returns null when a full navigation node has no router state", () => {
    const tree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: "https://example.test/docs/intro",
        thenable: Promise.resolve("intro"),
        routerState: null,
      }),
    );

    expect(tree).toBeNull();
  });

  test("shadow merges a supported sibling page patch without mutating the current tree", () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );
    const patchThenable = Promise.resolve("api");

    const result = applyAkanSegmentCachePatch({
      currentTree,
      targetRouterState: targetState,
      patch: makePatch("/docs/api"),
      href: targetState.href,
      thenable: patchThenable,
    });

    expect(result.status).toBe("patched");
    if (result.status !== "patched") return;
    expect(result.patchedNode.segment.key).toBe("page:/docs/api:2");
    expect(result.outletKey).toBe("slot:layout:/docs:1:2");
    expect(result.patchedNode.thenable).toBe(patchThenable);
    expect(result.tree.children[0]?.children[0]).toBe(result.patchedNode);
    expect(currentTree?.children[0]?.children[0]?.segment.key).toBe("page:/docs/intro:2");
  });

  test("shadow merges a same-route searchParams patch by replacing only the page leaf", () => {
    const currentState = makeRouterState("https://example.test/docs?page=1", "/docs");
    const targetState = makeRouterState("https://example.test/docs?page=2", "/docs");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("page 1"),
        routerState: currentState,
      }),
    );
    const patchThenable = Promise.resolve("page 2");

    const result = applyAkanSegmentCachePatch({
      currentTree,
      targetRouterState: targetState,
      patch: makePatch("/docs"),
      href: targetState.href,
      thenable: patchThenable,
    });

    expect(result.status).toBe("patched");
    if (result.status !== "patched") return;
    expect(result.outletKey).toBe("slot:layout:/docs:1:2");
    expect(result.tree.segment).toEqual(currentTree?.segment);
    expect(result.tree.children[0]?.segment).toEqual(currentTree?.children[0]?.segment);
    expect(result.patchedNode.segment.key).toBe("page:/docs:2");
    expect(result.patchedNode.href).toBe("https://example.test/docs?page=2");
    expect(result.patchedNode.thenable).toBe(patchThenable);
    expect(currentTree?.children[0]?.children[0]?.href).toBe("https://example.test/docs?page=1");
  });

  test("rejects segment patches without a current tree", () => {
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");

    expect(
      applyAkanSegmentCachePatch({
        currentTree: null,
        targetRouterState: targetState,
        patch: makePatch("/docs/api"),
        href: targetState.href,
      }),
    ).toEqual({ status: "rejected", reason: "missing-current-tree" });
  });

  test("rejects segment path mismatches", () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );

    expect(
      applyAkanSegmentCachePatch({
        currentTree,
        targetRouterState: targetState,
        patch: { ...makePatch("/docs/api"), segmentPath: ["root:/:0", "layout:/blog:1", "page:/docs/api:2"] },
        href: targetState.href,
      }),
    ).toEqual({ status: "rejected", reason: "segment-path-mismatch" });
  });

  test("rejects target router state prefixes that do not match the patch segment path", () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState: AkanRouterStateV1 = {
      ...makeRouterState("https://example.test/docs/api", "/docs/api"),
      segments: [
        { kind: "root-layout", path: "/", key: "root:/:0" },
        { kind: "layout", path: "/blog", key: "layout:/blog:1" },
        { kind: "page", path: "/docs/api", key: "page:/docs/api:2" },
      ],
    };
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );

    expect(
      applyAkanSegmentCachePatch({
        currentTree,
        targetRouterState: targetState,
        patch: makePatch("/docs/api"),
        href: targetState.href,
      }),
    ).toEqual({ status: "rejected", reason: "segment-path-mismatch" });
  });

  test("rejects patch segment paths with trailing metadata", () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );

    expect(
      applyAkanSegmentCachePatch({
        currentTree,
        targetRouterState: targetState,
        patch: {
          ...makePatch("/docs/api"),
          segmentPath: ["root:/:0", "layout:/docs:1", "page:/docs/api:2", "page:/docs/extra:3"],
        },
        href: targetState.href,
      }),
    ).toEqual({ status: "rejected", reason: "unsupported-suffix" });
  });

  test("rejects stale segment patches", () => {
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: "https://example.test/docs/intro",
        thenable: Promise.resolve("intro"),
        routerState: makeRouterState("https://example.test/docs/intro", "/docs/intro"),
      }),
    );

    expect(
      applyAkanSegmentCachePatch({
        currentTree,
        targetRouterState: targetState,
        patch: makePatch("/docs/api"),
        href: targetState.href,
        navId: 1,
        getCurrentNavId: () => 2,
      }),
    ).toEqual({ status: "rejected", reason: "stale" });
  });

  test("rejects unsupported multi-segment suffix patches", () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState: AkanRouterStateV1 = {
      ...makeRouterState("https://example.test/docs/api/reference", "/docs/api/reference"),
      segments: [
        { kind: "root-layout", path: "/", key: "root:/:0" },
        { kind: "layout", path: "/docs", key: "layout:/docs:1" },
        { kind: "layout", path: "/docs/api", key: "layout:/docs/api:2" },
        { kind: "page", path: "/docs/api/reference", key: "page:/docs/api/reference:3" },
      ],
    };
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );

    expect(
      applyAkanSegmentCachePatch({
        currentTree,
        targetRouterState: targetState,
        patch: {
          patchStartIndex: 2,
          patchStartSegmentKey: "layout:/docs/api:2",
          segmentPath: ["root:/:0", "layout:/docs:1", "layout:/docs/api:2", "page:/docs/api/reference:3"],
        },
        href: targetState.href,
      }),
    ).toEqual({ status: "rejected", reason: "unsupported-suffix" });
  });

  test("rejects patches whose suffix Flight failed to decode", () => {
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");

    expect(
      applyAkanSegmentCachePatch({
        currentTree: createAkanSegmentCacheTree(
          createRscNavigationCacheNode({
            href: "https://example.test/docs/intro",
            thenable: Promise.resolve("intro"),
            routerState: makeRouterState("https://example.test/docs/intro", "/docs/intro"),
          }),
        ),
        targetRouterState: targetState,
        patch: makePatch("/docs/api"),
        href: targetState.href,
        decodeFailed: true,
      }),
    ).toEqual({ status: "rejected", reason: "decode-error" });
  });

  test("remembers patch navigation cache nodes separately from full navigation nodes", () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );
    const patchThenable = Promise.resolve("api");
    const patch = makePatch("/docs/api");
    const patchResult = applyAkanSegmentCachePatch({
      currentTree,
      targetRouterState: targetState,
      patch,
      href: targetState.href,
      thenable: patchThenable,
    });
    expect(patchResult.status).toBe("patched");
    if (patchResult.status !== "patched") return;
    const headSnapshot = { version: 1 as const, nodes: [{ tag: "title" as const, text: "API" }] };
    const node = createRscPatchNavigationCacheNode({
      href: targetState.href,
      patch,
      patchedNode: patchResult.patchedNode,
      outletKey: patchResult.outletKey,
      headSnapshot,
    });
    const cache = new Map();

    expect(node).not.toBeNull();
    if (!node) return;
    rememberRscPatchCacheNode(cache, node, 32);

    expect(cache.get(targetState.href)).toBe(node);
    expect(cache.get(targetState.href)?.thenable).toBe(patchThenable);
    expect(cache.get(targetState.href)?.routerState).toBe(targetState);
    expect(cache.get(targetState.href)?.patch).toBe(patch);
    expect(cache.get(targetState.href)?.headSnapshot).toBe(headSnapshot);
  });

  test("evicts the oldest patch navigation cache node", () => {
    const headSnapshot = { version: 1 as const, nodes: [{ tag: "title" as const, text: "Page" }] };
    const makeNode = (routeId: string) => {
      const state = makeRouterState(`https://example.test${routeId}`, routeId);
      return {
        href: state.href,
        thenable: Promise.resolve(routeId),
        routerState: state,
        patch: makePatch(routeId),
        outletKey: "slot:layout:/docs:1:2",
        headSnapshot,
      };
    };
    const cache = new Map();

    rememberRscPatchCacheNode(cache, makeNode("/docs/a"), 2);
    rememberRscPatchCacheNode(cache, makeNode("/docs/b"), 2);
    rememberRscPatchCacheNode(cache, makeNode("/docs/c"), 2);

    expect(cache.has("https://example.test/docs/a")).toBe(false);
    expect(cache.has("https://example.test/docs/b")).toBe(true);
    expect(cache.has("https://example.test/docs/c")).toBe(true);
  });

  test("resolves cached patch navigation only when the current tree still matches", () => {
    const currentState = makeRouterState("https://example.test/docs/intro", "/docs/intro");
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const currentTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: currentState.href,
        thenable: Promise.resolve("intro"),
        routerState: currentState,
      }),
    );
    const patchThenable = Promise.resolve("api");
    const patch = makePatch("/docs/api");
    const headSnapshot = { version: 1 as const, nodes: [{ tag: "title" as const, text: "API" }] };
    const node = {
      href: targetState.href,
      thenable: patchThenable,
      routerState: targetState,
      patch,
      outletKey: "slot:layout:/docs:1:2",
      headSnapshot,
    };

    const resolved = resolveCachedRscPatchNavigation({
      currentTree,
      node,
      partialCommitEnabled: true,
    });

    expect(resolved.status).toBe("patched");
    if (resolved.status !== "patched") return;
    expect(resolved.patchedNode.href).toBe(targetState.href);
    expect(resolved.patchedNode.thenable).toBe(patchThenable);
    expect(resolved.headSnapshot).toBe(headSnapshot);

    const mismatchTree = createAkanSegmentCacheTree(
      createRscNavigationCacheNode({
        href: "https://example.test/blog/intro",
        thenable: Promise.resolve("blog"),
        routerState: {
          ...makeRouterState("https://example.test/blog/intro", "/blog/intro"),
          segments: [
            { kind: "root-layout", path: "/", key: "root:/:0" },
            { kind: "layout", path: "/blog", key: "layout:/blog:1" },
            { kind: "page", path: "/blog/intro", key: "page:/blog/intro:2" },
          ],
        },
      }),
    );

    expect(
      resolveCachedRscPatchNavigation({
        currentTree: mismatchTree,
        node,
        partialCommitEnabled: true,
      }),
    ).toEqual({ status: "rejected", reason: "segment-path-mismatch" });
  });

  test("rejects cached patch navigation when the partial commit guard is disabled", () => {
    const targetState = makeRouterState("https://example.test/docs/api", "/docs/api");
    const node = {
      href: targetState.href,
      thenable: Promise.resolve("api"),
      routerState: targetState,
      patch: makePatch("/docs/api"),
      outletKey: "slot:layout:/docs:1:2",
      headSnapshot: { version: 1 as const, nodes: [{ tag: "title" as const, text: "API" }] },
    };

    expect(
      resolveCachedRscPatchNavigation({
        currentTree: null,
        node,
        partialCommitEnabled: false,
      }),
    ).toEqual({ status: "rejected", reason: "guard-disabled" });
  });
});
