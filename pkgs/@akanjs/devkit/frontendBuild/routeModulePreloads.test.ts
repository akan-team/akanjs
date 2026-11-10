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
});
