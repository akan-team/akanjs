import { beforeAll, describe, expect, test } from "bun:test";
import { EntryModuleGraph } from "./entryModuleGraph";

/**
 * Guard #4 of `local/optimize-resource/04-measurement-harness.md`: the barrel split has to stay split.
 *
 * Every process here lives for the whole dev session (the host and the builder watcher) or is spawned
 * per build (the workers), so one accidental barrel import is worth 15-236 MB — measured, that is how
 * `commandDecorators` came to cost 236 MB through a single `from ".."`.
 *
 * Each expectation is an exact list rather than "nothing heavy", because these entries legitimately
 * need *some* heavy dependency and a blanket ban would have to be suppressed rather than read.
 * **Shrinking a list is a win: update it here and say so in the results doc.**
 */
describe("dev entry module graphs", () => {
  let graph: EntryModuleGraph;
  beforeAll(async () => {
    graph = await EntryModuleGraph.create(import.meta.dir);
  });

  test("the cli entry pulls nothing heavy at all", () => {
    // It used to reach `@inquirer/prompts` (~24 MB) through one chunk hop, because `runCommands` shares a
    // module with the interactive argument fallbacks; those now `import()` the prompt stack on first use.
    // `akan start` never prompts, and it holds this process for the whole session.
    expect(graph.eagerHeavyDependencies("index.js")).toEqual([]);
  });

  test("the builder watcher pulls typescript and nothing else", () => {
    // `typescript` is expected: `getPageKeys` validates route exports in the watcher.
    // The tailwind pair that used to sit here was `frontendBuild`'s barrel reaching `cssCompiler` and
    // `ssrBaseArtifactBuilder` — dead weight since phase 2 moved css compilation into the batch worker,
    // and ~40 MB in a process that idles at ~134-202 MB. The proc imports by module path now.
    expect(graph.eagerHeavyDependencies("incrementalBuilder.proc.js")).toEqual(["typescript"]);
  });

  test("the batch worker pulls the build stack but not the font subsetters", () => {
    // The worker exits per generation, so its imports are reclaimed — the property worth guarding is
    // that font subsetting stays lazy, which is what makes a cache hit cost ~66 MB less (3.3).
    expect(graph.eagerHeavyDependencies("buildBatch.proc.js")).toEqual([
      "@tailwindcss/node",
      "tailwindcss",
      "typescript",
    ]);
  });

  test("the typecheck worker pulls typescript alone", () => {
    expect(graph.eagerHeavyDependencies("typecheck.proc.js")).toEqual(["typescript"]);
  });

  test("no entry reaches the mobile, cloud or ai stacks", () => {
    const neverEager = [
      "ink",
      "ssh2",
      "@trapezedev/project",
      "@langchain/core",
      "@langchain/openai",
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
