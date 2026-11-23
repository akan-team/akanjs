import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";

const engineFiles = ["agent/CodeAgent", "agent/CodeAgentRpcHost", "agent/CodeAgentRpcListener", "tui/CodeTui"];

describe("host module graph", () => {
  // `serve` swaps the console out before the engine loads, so the entry the CLI imports reaches no engine module.
  test("nothing statically reachable from the host entry imports the engine", async () => {
    const root = path.resolve(import.meta.dir, "..");
    const seen = new Set<string>();
    const offenders: string[] = [];
    const visit = async (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = await Bun.file(file).text();
      // `import type` is erased before the module ever loads, so only value imports count as a static path.
      const specifiers = [
        ...source.matchAll(/^\s*(?:import|export)\s+(?!type[\s{])(?:[^"';]*?\bfrom\s*)?["']([^"']+)["']/gm),
      ].map((m) => m[1] ?? "");
      const relative = path.relative(root, file).replace(/\.tsx?$/, "");
      if (engineFiles.includes(relative) || specifiers.some((s) => s.startsWith("@earendil-works/")))
        offenders.push(relative);
      for (const specifier of specifiers.filter((s) => s.startsWith("."))) {
        const base = path.resolve(path.dirname(file), specifier);
        await visit([`${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate)) ?? `${base}.ts`);
      }
    };
    await visit(path.join(import.meta.dir, "index.ts"));
    expect(offenders).toEqual([]);
    expect(seen.size).toBeGreaterThan(3);
  });
});
