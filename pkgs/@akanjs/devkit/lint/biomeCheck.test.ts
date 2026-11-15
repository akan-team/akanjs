import { describe, expect, test } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import { hasBiome, tempDirs, writeText } from "../test/testHelpers";
import { BiomeCheck } from "./biomeCheck";

const makeTempRoot = tempDirs("akan-devkit-biome-check-");
const repoRoot = path.resolve(import.meta.dir, "../../../..");
const sentinel = "SENTINEL_DB_PASSWORD_4f9c2a71e0b3";

const workspace = async () => {
  const root = await makeTempRoot();
  await mkdir(path.join(root, "node_modules"), { recursive: true });
  await symlink(path.join(repoRoot, "node_modules/@biomejs"), path.join(root, "node_modules/@biomejs"));
  await writeText(
    path.join(root, "biome.json"),
    JSON.stringify({
      vcs: { enabled: false },
      linter: { rules: { suspicious: { noTemplateCurlyInString: "error", noExplicitAny: "error" } } },
    }),
  );
  await writeText(
    path.join(root, "apps/demo/env/env.server.main.ts"),
    `export const env = {   apiKey:   "${sentinel}", password: "${sentinel}\${x}" };\n`,
  );
  await writeText(path.join(root, "apps/demo/ui/card.ts"), "export const card: any = 1;\n");
  return root;
};

const run = async (root: string, options: { write: boolean; maxDiagnostics: number }) => {
  const printed: string[] = [];
  const error = await BiomeCheck.run({
    root,
    target: path.join(root, "apps/demo"),
    configPath: path.join(root, "biome.json"),
    print: (text) => printed.push(text),
    ...options,
  }).then(
    () => null,
    (e: unknown) => e as Error,
  );
  return { output: printed.join("\n"), error };
};

describe.skipIf(!hasBiome)("BiomeCheck", () => {
  test.each([true, false])(
    "names an env file's diagnostics by position and rule only, with write %p",
    async (write) => {
      const root = await workspace();
      const { output, error } = await run(root, { write, maxDiagnostics: 200 });

      expect(output).not.toContain(sentinel);
      expect(output).not.toContain("apiKey");
      expect(output).toMatch(
        /apps\/demo\/env\/env\.server\.main\.ts:\d+:\d+ error lint\/suspicious\/noTemplateCurlyInString/,
      );
      expect(output).toContain("withheld");
      expect(output).toContain("export const card: any = 1;");
      expect(error?.message).toBe(write ? "Lint found 2 errors." : "Lint found 3 errors.");
      if (!write) expect(output).toMatch(/env\.server\.main\.ts:0:0 error format/);
    },
    60_000,
  );

  test("counts an env file's diagnostics when nothing else fails, and keeps to the cap", async () => {
    const root = await workspace();
    await writeText(path.join(root, "apps/demo/ui/card.ts"), "export const card = 1;\n");
    const all = await run(root, { write: true, maxDiagnostics: 0 });
    expect(all.error?.message).toBe("Lint found 1 error.");
    expect(all.output).not.toContain(sentinel);

    const capped = await run(await workspace(), { write: false, maxDiagnostics: 1 });
    expect(capped.output.match(/env\.server\.main\.ts:/g)).toHaveLength(1);
    expect(capped.output).toContain("not shown");
    expect(capped.output).not.toContain("export const card: any");
    expect(capped.error).not.toBeNull();
  }, 60_000);
});
