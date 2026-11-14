import { beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { type CommandModuleId, commandModuleIds } from "./commandModules";
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

  // `akan <command>` evaluates only its module's chunk closure, so every command in it pays these, `--help` too.
  test("each command module pulls only the heavy stack listed for it", () => {
    const expected: Record<CommandModuleId, string[]> = {
      workspace: ["@inquirer/prompts", "ssh2", "typescript"],
      agent: ["@inquirer/prompts", "ssh2", "typescript"],
      code: [],
      // Eager on purpose: `start` and `sync` compile anyway, and loading typescript mid-sync left the host ~20 MB larger.
      application: ["@inquirer/prompts", "ssh2", "typescript"],
      library: [],
      localRegistry: ["@inquirer/prompts", "ssh2", "typescript"],
      package: [],
      module: ["typescript"],
      page: [],
      context: ["@inquirer/prompts", "typescript"],
      cloud: ["@inquirer/prompts", "ssh2", "typescript"],
      subspace: [],
      guideline: ["@inquirer/prompts"],
      scalar: ["typescript"],
      primitive: ["typescript"],
      quality: ["typescript"],
      verify: ["ssh2", "typescript"],
      repair: ["typescript"],
      workflow: ["typescript"],
      pipeline: [],
      tunnel: ["@inquirer/prompts"],
    };
    const root = path.resolve(import.meta.dir, "..");
    const actual = Object.fromEntries(
      commandModuleIds.map((id) => {
        const source = path.join(import.meta.dir, id, `${id}.command.ts`);
        const heavy = graph.eagerHeavyDependencies(graph.chunkOf(source)).map((dep) => {
          if (expected[id].includes(dep)) return dep;
          const chain = graph
            .importChain(source, dep)
            .map((step) => (path.isAbsolute(step) ? path.relative(root, step) : step));
          return `${dep} via ${chain.join(" > ")}`;
        });
        return [id, heavy];
      }),
    );
    expect(actual).toEqual(expected);
  });
});
