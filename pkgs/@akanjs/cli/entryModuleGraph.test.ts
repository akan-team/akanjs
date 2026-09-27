import { beforeAll, describe, expect, test } from "bun:test";
import { EntryModuleGraph } from "./entryModuleGraph";

// These processes live for the whole dev session or spawn per build, so one stray barrel import costs 15-236 MB.
// Exact lists, not "nothing heavy": some entries legitimately need a heavy dependency. Shrinking a list is a win.
describe("dev entry module graphs", () => {
  let graph: EntryModuleGraph;
  beforeAll(async () => {
    graph = await EntryModuleGraph.create(import.meta.dir);
  });

  test("the cli entry pulls nothing heavy at all", () => {
    // `akan start` never prompts and holds this process for the whole session; prompts are `import()`ed on first use.
    expect(graph.eagerHeavyDependencies("index.js")).toEqual([]);
  });

  test("the builder watcher pulls typescript and nothing else", () => {
    // `typescript` is expected: `getPageKeys` validates route exports in the watcher.
    expect(graph.eagerHeavyDependencies("incrementalBuilder.proc.js")).toEqual(["typescript"]);
  });

  test("the batch worker pulls the build stack but not the font subsetters", () => {
    // The worker exits per generation; what matters is that font subsetting stays lazy for a cache hit.
    expect(graph.eagerHeavyDependencies("buildBatch.proc.js")).toEqual([
      "@tailwindcss/node",
      "tailwindcss",
      "typescript",
    ]);
  });

  test("the typecheck worker pulls typescript alone", () => {
    expect(graph.eagerHeavyDependencies("typecheck.proc.js")).toEqual(["typescript"]);
  });

  test("no entry reaches the mobile or cloud stacks", () => {
    const neverEager = [
      "ink",
      "ssh2",
      "@kubernetes/client-node",
      "puppeteer",
      "fonteditor-core",
      "subset-font",
      "fontaine",
    ];
    for (const entry of ["index.js", "incrementalBuilder.proc.js", "buildBatch.proc.js", "typecheck.proc.js"]) {
      const eager = graph.eagerHeavyDependencies(entry).filter((dep) => neverEager.includes(dep));
      expect([entry, eager]).toEqual([entry, []]);
    }
  });
});
