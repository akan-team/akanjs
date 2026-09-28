import { describe, expect, test } from "bun:test";
import type { BuildRouteClientResult } from "./ipcTypes";
import { RouteClientCache } from "./routeClientCache";
import type { RoutesManifest } from "./routesManifestStore";

const emptySsrManifest = { moduleLoading: null, moduleMap: {} };

describe("RouteClientCache", () => {
  test("seeds existing manifests and returns isolated snapshots", async () => {
    const manifest: RoutesManifest = {
      routeIds: ["/seeded"],
      clientManifest: {
        "apps/demo/Page.tsx#default": {
          id: "/_akan/client/page.js",
          chunks: ["/_akan/client/page.js"],
          name: "default",
          async: true,
        },
      },
      ssrManifest: {
        moduleLoading: null,
        moduleMap: { "/_akan/client/page.js": { default: { id: "page.ssr.js", chunks: [], name: "default" } } },
      },
      knownEntries: ["/repo/apps/demo/Page.tsx"],
    };
    const cache = new RouteClientCache({
      buildRoute: async () => {
        throw new Error("seeded routes should not rebuild");
      },
    });

    cache.seed(manifest);
    await cache.ensure("/seeded", []);
    const snapshot = cache.snapshot();
    snapshot.knownEntries.add("/mutated");

    expect(cache.snapshot().knownEntries.has("/mutated")).toBe(false);
    expect(cache.snapshot().clientManifest).toEqual(manifest.clientManifest);
  });

  test("deduplicates concurrent builds and retries failures", async () => {
    let attempts = 0;
    const cache = new RouteClientCache({
      buildRoute: async (routeId, info) => {
        attempts += 1;
        if (attempts === 1) throw new Error("boom");
        return {
          manifestDelta: {
            [`${routeId}#default`]: {
              id: `/_akan/client/${attempts}.js`,
              chunks: [`/_akan/client/${attempts}.js`],
              name: "default",
            },
          },
          ssrManifestDelta: emptySsrManifest,
          newEntries: [...info.knownEntries, `/repo${routeId}.tsx`],
          clientDeps: [],
        };
      },
    });

    await expect(cache.ensure("/retry", [])).rejects.toThrow("boom");
    const [first, second] = await Promise.all([cache.ensure("/retry", []), cache.ensure("/retry", [])]);

    expect(first).toBe(second);
    expect(attempts).toBe(2);
    expect(cache.snapshot().knownEntries.has("/repo/retry.tsx")).toBe(true);
  });

  test("invalidates built routes, rebuilds a route whose build an invalidation overtook, and clears generations", async () => {
    // An array, not `let x = null`: TS ignores the executor's assignment and narrows the call below to `null`.
    const resolveBuild: (() => void)[] = [];
    const cache = new RouteClientCache({
      buildRoute: async (routeId, { generation }) =>
        await new Promise((resolve) => {
          resolveBuild.push(() =>
            resolve({
              manifestDelta: { [`${routeId}#${generation}`]: { id: "stale.js", chunks: [], name: "default" } },
              ssrManifestDelta: emptySsrManifest,
              newEntries: [`/repo/${routeId}-${generation}.tsx`],
              clientDeps: [],
            }),
          );
        }),
    });

    const pending = cache.ensure("/slow", []);
    expect(cache.clear()).toEqual([]);
    resolveBuild[0]?.();
    for (let tick = 0; tick < 100 && resolveBuild.length < 2; tick++) await Bun.sleep(1);
    resolveBuild[1]?.();
    await pending;

    expect(Object.keys(cache.snapshot().clientManifest)).toEqual(["/slow#1"]);
    expect(cache.snapshot().knownEntries).toEqual(new Set(["/repo//slow-1.tsx"]));

    const immediate = new RouteClientCache({
      buildRoute: async (routeId) => ({
        manifestDelta: { [routeId]: { id: "fresh.js", chunks: [], name: "default" } },
        ssrManifestDelta: emptySsrManifest,
        newEntries: [`/repo/${routeId}.tsx`],
        clientDeps: [],
      }),
    });
    await immediate.ensure("/a", []);
    await immediate.ensure("/b", []);
    expect(immediate.invalidate((routeId) => routeId === "/a")).toEqual(["/a"]);
    expect(immediate.snapshot().knownEntries).toEqual(new Set(["/repo//a.tsx", "/repo//b.tsx"]));
    expect(immediate.clear().sort((a, b) => a.localeCompare(b))).toEqual(["/b"]);
    expect(immediate.snapshot().generation).toBe(2);
  });

  test("client entry invalidation drops only stale entries and manifest rows", async () => {
    const cache = new RouteClientCache({
      buildRoute: async (routeId) => ({
        manifestDelta: {
          [`/repo${routeId}.tsx#default`]: {
            id: `/_akan/client${routeId}.js`,
            chunks: [`/_akan/client${routeId}.js`, `/_akan/client/chunk${routeId}.js`],
            name: "default",
          },
        },
        ssrManifestDelta: {
          moduleLoading: null,
          moduleMap: {
            [`/_akan/client${routeId}.js`]: {
              default: { id: `ssr${routeId}.js`, chunks: [], name: "default" },
            },
          },
        },
        newEntries: [`/repo${routeId}.tsx`],
        clientDeps: [],
      }),
    });
    await cache.ensure("/a", []);
    await cache.ensure("/b", []);

    expect(
      cache.invalidateClientEntries({
        routePredicate: (routeId) => routeId === "/a",
        staleEntries: ["/repo/a.tsx"],
      }),
    ).toEqual(["/a"]);

    const snapshot = cache.snapshot();
    expect(snapshot.knownEntries).toEqual(new Set(["/repo/b.tsx"]));
    expect(snapshot.clientManifest["/repo/a.tsx#default"]).toBeUndefined();
    expect(snapshot.clientManifest["/repo/b.tsx#default"]).toBeDefined();
    expect(snapshot.ssrManifest.moduleMap["/_akan/client/a.js"]).toBeUndefined();
    expect(snapshot.ssrManifest.moduleMap["/_akan/client/b.js"]).toBeDefined();
  });

  test("route invalidation preserves known entries and manifest rows for server-only edits", async () => {
    const cache = new RouteClientCache({
      buildRoute: async (routeId) => ({
        manifestDelta: {
          [`/repo${routeId}.tsx#default`]: {
            id: `/_akan/client${routeId}.js`,
            chunks: [`/_akan/client${routeId}.js`],
            name: "default",
          },
        },
        ssrManifestDelta: emptySsrManifest,
        newEntries: [`/repo${routeId}.tsx`],
        clientDeps: [],
      }),
    });
    await cache.ensure("/a", []);

    expect(cache.invalidate((routeId) => routeId === "/a")).toEqual(["/a"]);
    const snapshot = cache.snapshot();
    expect(snapshot.knownEntries).toEqual(new Set(["/repo/a.tsx"]));
    expect(snapshot.clientManifest["/repo/a.tsx#default"]).toBeDefined();
  });

  test("client entry invalidation also removes rows by stale chunk urls", async () => {
    const cache = new RouteClientCache({
      buildRoute: async () => ({
        manifestDelta: {
          "/repo/Entry.tsx#default": {
            id: "/_akan/client/entry.js",
            chunks: ["/_akan/client/entry.js", "/_akan/client/shared.js"],
            name: "default",
          },
          "/repo/Entry.tsx#Named": {
            id: "/_akan/client/shared.js",
            chunks: ["/_akan/client/shared.js"],
            name: "Named",
          },
          "/repo/Other.tsx#default": {
            id: "/_akan/client/other.js",
            chunks: ["/_akan/client/other.js"],
            name: "default",
          },
        },
        ssrManifestDelta: {
          moduleLoading: null,
          moduleMap: {
            "/_akan/client/entry.js": {
              default: { id: "entry.ssr.js", chunks: [], name: "default" },
            },
            "/_akan/client/shared.js": {
              Named: { id: "named.ssr.js", chunks: [], name: "Named" },
            },
            "/_akan/client/other.js": {
              default: { id: "other.ssr.js", chunks: [], name: "default" },
            },
          },
        },
        newEntries: ["/repo/Entry.tsx", "/repo/Other.tsx"],
        clientDeps: [],
      }),
    });
    await cache.ensure("/a", []);

    cache.invalidateClientEntries({
      routePredicate: (routeId) => routeId === "/a",
      staleEntries: ["/repo/Entry.tsx"],
    });

    const snapshot = cache.snapshot();
    expect(Object.keys(snapshot.clientManifest).sort()).toEqual(["/repo/Other.tsx#default"]);
    expect(Object.keys(snapshot.ssrManifest.moduleMap).sort()).toEqual(["/_akan/client/other.js"]);
    expect(snapshot.knownEntries).toEqual(new Set(["/repo/Other.tsx"]));
  });

  test("shared entries can be discovered by later routes without rebuilding the shared entry", async () => {
    const builds: Array<{ routeId: string; knownEntries: string[] }> = [];
    const cache = new RouteClientCache({
      buildRoute: async (routeId, { knownEntries }): Promise<BuildRouteClientResult> => {
        builds.push({ routeId, knownEntries: [...knownEntries].sort() });
        if (routeId === "/a") {
          return {
            manifestDelta: {
              "/repo/Shared.tsx#default": {
                id: "/_akan/client/shared.js",
                chunks: ["/_akan/client/shared.js"],
                name: "default",
              },
            },
            ssrManifestDelta: emptySsrManifest,
            newEntries: ["/repo/Shared.tsx"],
            discoveredEntries: ["/repo/Shared.tsx"],
            clientDeps: ["/repo/Shared.tsx"],
            clientDepsByEntry: { "/repo/Shared.tsx": ["/repo/Shared.tsx"] },
          };
        }
        return {
          manifestDelta: {},
          ssrManifestDelta: emptySsrManifest,
          newEntries: [],
          discoveredEntries: ["/repo/Shared.tsx"],
          clientDeps: [],
          clientDepsByEntry: {},
        };
      },
    });

    await cache.ensure("/a", []);
    await cache.ensure("/b", []);

    expect(builds).toEqual([
      { routeId: "/a", knownEntries: [] },
      { routeId: "/b", knownEntries: ["/repo/Shared.tsx"] },
    ]);
    expect(cache.snapshot().knownEntries).toEqual(new Set(["/repo/Shared.tsx"]));
  });

  const heldBuilds = () => {
    const held: { routeId: string; generation: number; finish: () => void }[] = [];
    const cache = new RouteClientCache({
      buildRoute: async (routeId, { generation }) =>
        await new Promise<BuildRouteClientResult>((resolve) => {
          held.push({
            routeId,
            generation,
            finish: () =>
              resolve({
                manifestDelta: {
                  [`/repo${routeId}.tsx#default`]: {
                    id: `ssr-dev:${routeId}#${generation}`,
                    chunks: [],
                    name: "default",
                  },
                },
                ssrManifestDelta: emptySsrManifest,
                newEntries: [`/repo${routeId}.tsx`],
                discoveredEntries: [`/repo${routeId}.tsx`],
                clientDeps: [`/repo${routeId}.tsx`, "/repo/ui/Button.tsx"],
                clientDepsByEntry: { [`/repo${routeId}.tsx`]: [`/repo${routeId}.tsx`, "/repo/ui/Button.tsx"] },
              }),
          });
        }),
    });
    const settle = async (count: number) => {
      for (let tick = 0; tick < 200 && held.length < count; tick++) await Bun.sleep(1);
    };
    return { cache, held, settle };
  };

  test("a save that concerns neither the route nor what its build reached leaves that build merged", async () => {
    const { cache, held, settle } = heldBuilds();
    const pending = cache.ensure("/b", []);
    await settle(1);
    cache.invalidateClientEntries({
      routePredicate: (routeId) => routeId === "/a",
      staleEntries: ["/repo/a.tsx"],
      files: ["/repo/a.tsx"],
    });
    held[0]?.finish();
    const merged = await pending;

    expect(held.map(({ routeId }) => routeId)).toEqual(["/b"]);
    expect(merged.generation).toBe(1);
    expect(merged.clientManifest["/repo/b.tsx#default"]?.id).toBe("ssr-dev:/b#0");
  });

  test("a save no entry is known to read is kept for a running build to check, and costs nothing with none running", async () => {
    const { cache, held, settle } = heldBuilds();
    const pending = cache.ensure("/b", []);
    await settle(1);
    cache.invalidateClientEntries({ routePredicate: () => false, staleEntries: [], files: ["/repo/ui/Other.tsx"] });
    held[0]?.finish();
    const merged = await pending;
    expect(held).toHaveLength(1);
    expect(merged.generation).toBe(1);

    const revision = cache.revision;
    cache.invalidateClientEntries({ routePredicate: () => false, staleEntries: [], files: ["/repo/ui/Button.tsx"] });
    expect(cache.snapshot().generation).toBe(1);
    expect(cache.revision).toBe(revision);
  });

  test("a running build is built again when a save drops its route, stales an entry it reached, or edits a dep", async () => {
    const invalidations: [string, (cache: RouteClientCache) => void][] = [
      ["its route", (cache) => cache.invalidate((routeId) => routeId === "/b")],
      [
        "an entry it reached",
        (cache) => cache.invalidateClientEntries({ routePredicate: () => false, staleEntries: ["/repo/b.tsx"] }),
      ],
      [
        "a file it bundled that no entry is known to read",
        (cache) =>
          cache.invalidateClientEntries({
            routePredicate: () => false,
            staleEntries: [],
            files: ["/repo/ui/Button.tsx"],
          }),
      ],
      [
        "a file it bundled, for a server-only route",
        (cache) => cache.invalidate(() => false, { files: ["/repo/ui/Button.tsx"] }),
      ],
      ["everything", (cache) => cache.clear()],
    ];
    for (const [label, invalidate] of invalidations) {
      const { cache, held, settle } = heldBuilds();
      const pending = cache.ensure("/b", []);
      await settle(1);
      invalidate(cache);
      held[0]?.finish();
      await settle(2);
      held[1]?.finish();
      const merged = await pending;
      expect({ label, builds: held.map(({ generation }) => generation) }).toEqual({ label, builds: [0, 1] });
      expect(merged.clientManifest["/repo/b.tsx#default"]?.id).toBe("ssr-dev:/b#1");
    }
  });

  test("a caller that came after a save retries a build from before it that failed, rather than failing", async () => {
    let attempts = 0;
    let failFirst: (error: Error) => void = () => undefined;
    const cache = new RouteClientCache({
      buildRoute: async (routeId) => {
        attempts += 1;
        if (attempts === 1)
          return await new Promise<BuildRouteClientResult>((_, reject) => {
            failFirst = reject;
          });
        return {
          manifestDelta: { [`/repo${routeId}.tsx#default`]: { id: "fixed.js", chunks: [], name: "default" } },
          ssrManifestDelta: emptySsrManifest,
          newEntries: [`/repo${routeId}.tsx`],
          discoveredEntries: [`/repo${routeId}.tsx`],
          clientDeps: [],
        };
      },
    });
    const first = cache.ensure("/b", []);
    for (let tick = 0; tick < 200 && attempts < 1; tick++) await Bun.sleep(1);
    cache.invalidate((routeId) => routeId === "/b", { files: ["/repo/b.tsx"] });
    const second = cache.ensure("/b", []);
    failFirst(new Error("broken before the save"));

    await expect(first).rejects.toThrow("broken before the save");
    expect((await second).clientManifest["/repo/b.tsx#default"]?.id).toBe("fixed.js");
    expect(attempts).toBe(2);
  });
});
