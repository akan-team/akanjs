import { describe, expect, test } from "bun:test";
import path from "node:path";

const pkgsDir = path.resolve(import.meta.dir, "../..");

// `import type` is erased before the module ever loads, so only value imports put the engine in the CLI bundle.
const valueImports = (source: string) =>
  [
    ...source.matchAll(/^\s*(?:import|export)\s+(?!type[\s{])(?:[^"';]*?\bfrom\s*)?["']([^"']+)["']/gm),
    ...source.matchAll(/(?<!typeof\s)\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1] ?? "");

describe("code agent boundary", () => {
  test("the CLI and devkit never import the code agent's engine, which @akanjs/code ships", async () => {
    const offenders: string[] = [];
    for (const pkg of ["cli", "devkit"])
      for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: path.join(pkgsDir, pkg) })) {
        if (file.includes("node_modules/") || /\.(test|spec)\.tsx?$/.test(file)) continue;
        const source = await Bun.file(path.join(pkgsDir, pkg, file)).text();
        const engine = valueImports(source).filter(
          (specifier) => specifier.startsWith("@earendil-works/") || specifier.startsWith("@akanjs/code"),
        );
        if (engine.length) offenders.push(`${pkg}/${file}: ${engine.join(", ")}`);
      }
    expect(offenders).toEqual([]);
  });
});
