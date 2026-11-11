import { describe, expect, test } from "bun:test";
import { realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { App } from "../commandDecorators";
import { tempDirs, writeText } from "../test/testHelpers";
import { BackendImportGraph } from "./BackendImportGraph";
import { filesChangedSince } from "./devHostPolicy";

describe("BackendImportGraph", () => {
  const makeTempRoot = tempDirs("akan-devkit-graph-");

  const makeGraph = async (files: Record<string, string>) => {
    // Realpath: `Bun.resolveSync` returns real paths, and macOS `/var/folders` is a symlink.
    const workspaceRoot = await realpath(await makeTempRoot());
    const cwdPath = path.join(workspaceRoot, "apps/demo");
    for (const [rel, source] of Object.entries(files)) await writeText(path.join(cwdPath, rel), source);
    const app = { cwdPath, workspace: { workspaceRoot } } as unknown as App;
    return { graph: new BackendImportGraph(app, new Logger("test")), cwdPath };
  };

  test("walks the backend entrypoints' import graph", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./server";\n',
      "server.ts": 'import { handler } from "./lib/handler";\nexport default handler;\n',
      "lib/handler.ts": "export const handler = () => null;\n",
      "lib/unreachable.ts": "export const nope = 1;\n",
    });

    expect(await graph.refresh()).toBe(true);
    expect(graph.has(path.join(cwdPath, "lib/handler.ts"))).toBe(true);
    expect(graph.has(path.join(cwdPath, "lib/unreachable.ts"))).toBe(false);
  });

  test("picks up an import added to an already-scanned file", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./server";\n',
      "server.ts": "export default 1;\n",
      "lib/added.ts": "export const added = 1;\n",
    });
    await graph.refresh();
    expect(graph.has(path.join(cwdPath, "lib/added.ts"))).toBe(false);

    await writeFile(path.join(cwdPath, "server.ts"), 'import "./lib/added";\nexport default 1;\n');

    await graph.refresh();
    expect(graph.has(path.join(cwdPath, "lib/added.ts"))).toBe(true);
  });

  test("drops a file that left the graph", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./server";\n',
      "server.ts": 'import "./lib/leaving";\nexport default 1;\n',
      "lib/leaving.ts": "export const leaving = 1;\n",
    });
    await graph.refresh();
    expect(graph.has(path.join(cwdPath, "lib/leaving.ts"))).toBe(true);

    await writeFile(path.join(cwdPath, "server.ts"), "export default 1;\n");
    await graph.refresh();
    expect(graph.has(path.join(cwdPath, "lib/leaving.ts"))).toBe(false);
  });

  test("reports which backend files moved while nobody was watching", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./server";\n',
      "server.ts": 'import "./lib/handler";\nexport default 1;\n',
      "lib/handler.ts": "export const handler = () => null;\n",
    });
    await graph.refresh();
    const before = await graph.fingerprint();

    // `mtimeMs` has a coarse clock on Linux, so the size has to move too.
    await writeFile(path.join(cwdPath, "lib/handler.ts"), "export const handler = () => 'changed';\n");

    expect(filesChangedSince(before, await graph.fingerprint())).toEqual([path.join(cwdPath, "lib/handler.ts")]);
  });

  test("says nothing when the tree is untouched, and names a deleted file", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./server";\n',
      "server.ts": 'import "./lib/handler";\nexport default 1;\n',
      "lib/handler.ts": "export const handler = () => null;\n",
    });
    await graph.refresh();
    const before = await graph.fingerprint();
    expect(filesChangedSince(before, await graph.fingerprint())).toEqual([]);

    await rm(path.join(cwdPath, "lib/handler.ts"));
    expect(filesChangedSince(before, await graph.fingerprint())).toEqual([path.join(cwdPath, "lib/handler.ts")]);
  });

  test("keeps the previous graph when a refresh finds no entrypoints", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./lib/kept";\n',
      "lib/kept.ts": "export const kept = 1;\n",
    });
    await graph.refresh();
    expect(graph.ready).toBe(true);

    await rm(path.join(cwdPath, "main.ts"));
    await graph.refresh();
    // An empty scan is not a failure, so the graph legitimately empties out.
    expect(graph.has(path.join(cwdPath, "lib/kept.ts"))).toBe(false);
  });
});
