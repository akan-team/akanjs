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

const run = async (
  root: string,
  { targets = ["apps/demo"], ...options }: { write: boolean; maxDiagnostics: number; targets?: string[] },
) => {
  const printed: string[] = [];
  const error = await BiomeCheck.run({
    root,
    targets: targets.map((target) => path.join(root, target)),
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

  test("checks every target it is given in one run", async () => {
    const root = await workspace();
    await writeText(path.join(root, "apps/demo/env/env.server.main.ts"), "export const env = {};\n");
    await writeText(path.join(root, "libs/shared/ui/badge.ts"), "export const badge: any = 1;\n");
    const { output, error } = await run(root, {
      write: false,
      maxDiagnostics: 0,
      targets: ["apps/demo", "libs/shared"],
    });
    expect(output).toContain("export const card: any = 1;");
    expect(output).toContain("export const badge: any = 1;");
    expect(error?.message).toBe("Lint found 2 errors.");
  }, 60_000);

  test("explains a biome.json Biome cannot read, in Biome's own words", async () => {
    const root = await workspace();
    await writeText(path.join(root, "biome.json"), '{ // a comment\n  "vcs": { "enabled": false } }');
    const { error, output } = await run(root, { write: false, maxDiagnostics: 200 });
    expect(output).toBe("");
    expect(error?.message).toContain("biome.json");
    expect(error?.message).not.toContain("gave no report");
  }, 60_000);

  test("reports every file of a large app in groups, and stops at the cap with the count left", async () => {
    const root = await workspace();
    await writeText(path.join(root, "apps/demo/env/env.server.main.ts"), "export const env = {};\n");
    await writeText(path.join(root, "apps/demo/ui/card.ts"), "export const card = 1;\n");
    for (let idx = 0; idx < 250; idx += 1)
      await writeText(path.join(root, `apps/demo/ui/many/file${idx}.ts`), `export const value${idx}: any = ${idx};\n`);
    const reported = (output: string) => output.match(/noExplicitAny ━/g)?.length ?? 0;

    const all = await run(root, { write: false, maxDiagnostics: 0 });
    expect(reported(all.output)).toBe(250);
    expect(all.output).not.toContain("not shown");
    expect(all.output.match(/^Found 250 errors\.$/gm)).toHaveLength(1);
    expect(all.output).not.toContain("Checked ");
    expect(all.error?.message).toBe("Lint found 250 errors.");

    const capped = await run(root, { write: false, maxDiagnostics: 150 });
    expect(reported(capped.output)).toBe(150);
    expect(capped.output).toContain("50 more diagnostics are not shown; --max-diagnostics 0 shows them all.");
  }, 120_000);

  test("lists after a write only what is still wrong", async () => {
    const root = await workspace();
    await writeText(path.join(root, "apps/demo/env/env.server.main.ts"), "export const env = {};\n");
    await writeText(path.join(root, "apps/demo/ui/card.ts"), "export const card = 1;\nexport const other   =   2\n");
    const { output, error } = await run(root, { write: true, maxDiagnostics: 200 });
    expect(output).toBe("");
    expect(error).toBeNull();
    expect(await Bun.file(path.join(root, "apps/demo/ui/card.ts")).text()).toContain("export const other = 2;");
  }, 60_000);

  test("withholds a grit plugin diagnostic on an env file", async () => {
    const root = await workspace();
    await writeText(
      path.join(root, "no-marker.grit"),
      'engine biome(1.0)\nlanguage js(typescript)\n`MARKER` as $m where { register_diagnostic(span = $m, message = "marker found", severity = "error") }\n',
    );
    await writeText(
      path.join(root, "biome.json"),
      JSON.stringify({ vcs: { enabled: false }, plugins: ["./no-marker.grit"] }),
    );
    await writeText(
      path.join(root, "apps/demo/env/env.server.main.ts"),
      `export const env = { password: MARKER, other: "${sentinel}" };\n`,
    );
    const { output, error } = await run(root, { write: false, maxDiagnostics: 200 });
    expect(output).not.toContain(sentinel);
    expect(output).toMatch(/env\.server\.main\.ts:\d+:\d+ error plugin - the text is withheld/);
    expect(error).not.toBeNull();
  }, 60_000);

  test("drops a group's own summary lines, coloured or not", () => {
    const coloured = "\u001b[1mChecked 100 files in 1s.\u001b[0m\n\u001b[31mFound 3 errors.\u001b[39m\na.ts:1:1 lint/x";
    expect(BiomeCheck.withoutSummary(coloured)).toBe("a.ts:1:1 lint/x");
    expect(BiomeCheck.withoutSummary("Checked 1 file in 2ms.\nFound 1 warning.\nb.ts:2:1 lint/y")).toBe(
      "b.ts:2:1 lint/y",
    );
  });
});
