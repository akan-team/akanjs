import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";

const barrel = "@akanjs/devkit/codeAgent";
const codeAgentDir = `${import.meta.dir}/../../devkit/codeAgent`;

describe("command module graph", () => {
  // The `codeAgent` barrel re-exports the whole engine, so reaching it is itself an offence; only leaves are walked.
  test("nothing statically reachable from code.command imports the engine", async () => {
    const seen = new Set<string>();
    const offenders: string[] = [];
    const visit = async (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const name = file.split("/").at(-1) ?? file;
      const source = await Bun.file(file).text();
      // `import type` is erased before the module ever loads, so only value imports count as a static path.
      const specifiers = [...source.matchAll(/^\s*import\s+(?!type[\s{])[^"']*["']([^"']+)["']/gm)].map(
        (m) => m[1] ?? "",
      );
      if (specifiers.some((s) => s.startsWith("@earendil-works/") || s === barrel)) offenders.push(name);
      for (const specifier of specifiers) {
        const base = specifier.startsWith(".")
          ? path.resolve(path.dirname(file), specifier)
          : specifier.startsWith(`${barrel}/`)
            ? `${codeAgentDir}${specifier.slice(barrel.length)}`
            : undefined;
        if (base) await visit([`${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate)) ?? `${base}.ts`);
      }
    };
    await visit(`${import.meta.dir}/code.command.ts`);
    expect(offenders).toEqual([]);
    expect(seen.size).toBeGreaterThan(3);
  });
});
