import { describe, expect, test } from "bun:test";
import type { ClientBundleGraph } from "./clientBuildTypes";
import { RouteRuntimeCheck } from "./routeRuntimeCheck";

const root = "/ws";
const abs = (file: string) => `${root}/${file}`;
const fetchPiece = "apps/demo/lib/__client/memo.fetch.ts";
const storePiece = "apps/demo/lib/__client/memo.st.ts";
const storeFile = "apps/demo/lib/memo/memo.store.ts";
const card = "apps/demo/ui/Card.tsx";

interface GraphShape {
  imports: Record<string, (string | { lazy: string })[]>;
  chunks?: Record<string, string[]>;
  chunkImports?: Record<string, string[]>;
}

const graphOf = ({ imports, chunks = {}, chunkImports = {} }: GraphShape): ClientBundleGraph => ({
  importsByModule: new Map(
    Object.entries(imports).map(([module, list]) => [
      abs(module),
      list.map((imported) =>
        typeof imported === "string" ? { path: abs(imported), lazy: false } : { path: abs(imported.lazy), lazy: true },
      ),
    ]),
  ),
  chunksByModule: new Map(Object.entries(chunks).map(([module, list]) => [abs(module), list])),
  importsByChunk: new Map(Object.entries(chunkImports)),
});

const failuresOf = (shape: GraphShape, narrowed?: { entries: Record<string, string>; wholeReaders?: string[] }) =>
  new RouteRuntimeCheck(
    root,
    graphOf(shape),
    narrowed
      ? {
          entries: new Map(Object.entries(narrowed.entries).map(([build, entry]) => [abs(build), abs(entry)])),
          wholeReaders: new Set((narrowed.wholeReaders ?? []).map(abs)),
        }
      : null,
  ).failures;

describe('what a `clientRuntime: "route"` build checks in its own output', () => {
  const storeAndPiece = { [storeFile]: [fetchPiece], [fetchPiece]: [] };

  test("a module's chunk reaches the chunk of each runtime piece it imports, directly, through another chunk or by holding it", () => {
    const split = { [storeFile]: ["/out/store.js"], [fetchPiece]: ["/out/fetch.js"] };
    expect(failuresOf({ imports: storeAndPiece, chunks: split })).toEqual([
      "apps/demo/lib/memo/memo.store.ts needs apps/demo/lib/__client/memo.fetch.ts loaded first, but its chunk store.js does not import the chunk holding that piece",
    ]);
    const direct = { "/out/store.js": ["/out/fetch.js"] };
    const through = { "/out/store.js": ["/out/shared.js"], "/out/shared.js": ["/out/fetch.js"] };
    expect(failuresOf({ imports: storeAndPiece, chunks: split, chunkImports: direct })).toEqual([]);
    expect(failuresOf({ imports: storeAndPiece, chunks: split, chunkImports: through })).toEqual([]);
    const together = { [storeFile]: ["/out/store.js"], [fetchPiece]: ["/out/store.js"] };
    expect(failuresOf({ imports: storeAndPiece, chunks: together })).toEqual([]);
  });

  test("every chunk a module is copied into reaches the piece, and a piece asked for with `import()` needs no order", () => {
    const copied = { [storeFile]: ["/out/a.js", "/out/b.js"], [fetchPiece]: ["/out/fetch.js"] };
    const onlyFirst = { "/out/a.js": ["/out/fetch.js"] };
    expect(failuresOf({ imports: storeAndPiece, chunks: copied, chunkImports: onlyFirst })).toHaveLength(1);
    const lazy = { [card]: [{ lazy: storePiece }], [storePiece]: [] };
    const apart = { [card]: ["/out/card.js"], [storePiece]: ["/out/piece.js"] };
    expect(failuresOf({ imports: lazy, chunks: apart })).toEqual([]);
  });

  test("no store file is imported back by a runtime piece that a file it imports loads", () => {
    const helper = "apps/demo/webkit/relabel.ts";
    const cycle = { [storeFile]: [helper], [helper]: [storePiece], [storePiece]: [storeFile] };
    expect(failuresOf({ imports: cycle })).toEqual([
      "apps/demo/lib/memo/memo.store.ts imports apps/demo/webkit/relabel.ts, which loads apps/demo/lib/__client/memo.st.ts, and that piece imports the store file back before it is defined: move what apps/demo/webkit/relabel.ts reads from the store out of the files a store file imports",
    ]);
    expect(failuresOf({ imports: { ...cycle, [helper]: [] } })).toEqual([]);
    const uiCycle = { [card]: ["apps/demo/ui/Frame.tsx"], "apps/demo/ui/Frame.tsx": [card, storePiece] };
    expect(failuresOf({ imports: { ...uiCycle, [storePiece]: [storeFile], [storeFile]: [] } })).toEqual([]);
  });

  test("a page built to load only the modules its code names reaches neither a file needing every module nor the runtime of every module", () => {
    const entry = "apps/demo/.akan/generated/client-entry-bootstrap-route/Card.tsx";
    const run = "apps/demo/ui/Run.tsx";
    const whole = "apps/demo/lib/st.ts";
    const entries = { [entry]: card };
    expect(
      failuresOf({ imports: { [entry]: [card], [card]: [run], [run]: [] } }, { entries, wholeReaders: [run] }),
    ).toEqual([
      "apps/demo/ui/Card.tsx was built to load only the modules its code names, but it reaches apps/demo/ui/Run.tsx, which needs every module",
    ]);
    expect(failuresOf({ imports: { [entry]: [card], [card]: [whole], [whole]: [] } }, { entries })).toEqual([
      "apps/demo/ui/Card.tsx was built to load only the modules its code names, but apps/demo/ui/Card.tsx imports apps/demo/lib/st.ts, the runtime of every module",
    ]);
    expect(
      failuresOf(
        { imports: { [entry]: [card], [card]: [{ lazy: run }], [run]: [] } },
        { entries, wholeReaders: [run] },
      ),
    ).toEqual([]);
    expect(failuresOf({ imports: { [entry]: [card], [card]: [] } }, { entries, wholeReaders: [run] })).toEqual([]);
  });

  test("a failing build stops with the first failures, how many more there are, and the setting that builds meanwhile", () => {
    const stores = Array.from(
      { length: RouteRuntimeCheck.shown + 2 },
      (_, index) => `apps/demo/lib/m${index}/m${index}.store.ts`,
    );
    const imports = { ...Object.fromEntries(stores.map((store) => [store, [fetchPiece]])), [fetchPiece]: [] };
    const chunks = {
      ...Object.fromEntries(stores.map((store) => [store, ["/out/store.js"]])),
      [fetchPiece]: ["/out/fetch.js"],
    };
    const check = new RouteRuntimeCheck(root, graphOf({ imports, chunks }));
    expect(() => check.assert()).toThrow(
      [
        '[client-runtime] the build of `clientRuntime: "route"` would not load its modules in order:',
        ...stores
          .slice(0, RouteRuntimeCheck.shown)
          .map(
            (store) =>
              `  - ${store} needs ${fetchPiece} loaded first, but its chunk store.js does not import the chunk holding that piece`,
          ),
        "  - and 2 more",
        'Set `clientRuntime: "all"` in akan.config.ts to build until it is fixed.',
      ].join("\n"),
    );
    expect(() => new RouteRuntimeCheck(root, graphOf({ imports: storeAndPiece })).assert()).not.toThrow();
  });
});
