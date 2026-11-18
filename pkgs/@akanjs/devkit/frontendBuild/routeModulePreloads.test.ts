import { describe, expect, test } from "bun:test";
import path from "node:path";
import { RouteModulePreloads } from "./routeModulePreloads";

describe("RouteModulePreloads", () => {
  const root = "/repo";
  const entry = (name: string) => path.join(root, `apps/demo/ui/${name}.tsx`);
  const row = (...chunks: string[]) => ({
    id: chunks[0] ?? "",
    chunks: chunks.flatMap((chunk) => [chunk, chunk]),
    name: "default",
  });
  const preloads = new RouteModulePreloads({
    runtimeChunks: {
      runtime: ["/_akan/client/rsc.js"],
      vendors: { react: ["/_akan/client/react.js"], "akanjs/store": ["/_akan/client/store.js"] },
    },
    entriesByRoute: new Map([
      ["/:lang", [entry("Home")]],
      ["/:lang/memo", [entry("Home"), entry("Memo")]],
    ]),
    clientManifest: {
      "apps/demo/ui/Home.tsx#default": row("/_akan/client/home.js", "/_akan/client/chunks/s.js"),
      "apps/demo/ui/Memo.tsx#default": row("/_akan/client/memo.js", "/_akan/client/chunks/s.js"),
    },
    externalsByChunkUrl: {
      "/_akan/client/home.js": ["react"],
      "/_akan/client/memo.js": ["akanjs/store", "node:fs"],
      "/_akan/client/chunks/s.js": [],
    },
    workspaceRoot: root,
  });

  test("keeps only importmap specifiers, and only for chunks that import one", () => {
    expect(preloads.table.chunkVendors).toEqual({
      "/_akan/client/home.js": ["react"],
      "/_akan/client/memo.js": ["akanjs/store"],
    });
  });

  test("lists what each route can load: the runtime, its vendors, then its chunks", () => {
    expect(preloads.modulesByRoute()).toEqual({
      "/:lang": [
        "/_akan/client/rsc.js",
        "/_akan/client/react.js",
        "/_akan/client/home.js",
        "/_akan/client/chunks/s.js",
      ],
      "/:lang/memo": [
        "/_akan/client/rsc.js",
        "/_akan/client/react.js",
        "/_akan/client/store.js",
        "/_akan/client/home.js",
        "/_akan/client/chunks/s.js",
        "/_akan/client/memo.js",
      ],
    });
  });

  test("a route asking an entry for some exports lists the chunks of those alone, and of them all when it asks for the file", () => {
    const pair = entry("Pair");
    const byExport = new RouteModulePreloads({
      runtimeChunks: { runtime: [], vendors: {} },
      entriesByRoute: new Map([
        ["/a", [pair]],
        ["/b", [pair]],
        ["/whole", [pair]],
        ["/unasked", [pair]],
      ]),
      askedByRoute: new Map<string, Map<string, string[] | null>>([
        ["/a", new Map([[pair, ["A"]]])],
        ["/b", new Map([[pair, ["B", "Missing"]]])],
        ["/whole", new Map([[pair, null]])],
      ]),
      clientManifest: {
        "apps/demo/ui/Pair.tsx#A": { ...row("/_akan/client/a.js", "/_akan/client/chunks/s.js"), name: "A" },
        "apps/demo/ui/Pair.tsx#B": { ...row("/_akan/client/b.js", "/_akan/client/chunks/s.js"), name: "B" },
      },
      externalsByChunkUrl: {},
      workspaceRoot: root,
    });
    const both = ["/_akan/client/a.js", "/_akan/client/chunks/s.js", "/_akan/client/b.js"];

    expect(byExport.modulesByRoute()).toEqual({
      "/a": ["/_akan/client/a.js", "/_akan/client/chunks/s.js"],
      "/b": ["/_akan/client/b.js", "/_akan/client/chunks/s.js"],
      "/whole": both,
      "/unasked": both,
    });
  });
});
