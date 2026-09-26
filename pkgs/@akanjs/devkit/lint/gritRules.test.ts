import { afterAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Linter } from "../linter";

/**
 * Fixture tests for the GritQL plugins in this folder.
 *
 * These rules break the apps/libs build, and a rule that stops matching reports **zero diagnostics** rather
 * than an error — so a biome upgrade can retire one silently. GritQL has known sharp edges here (escaped
 * quotes, argument-position matching), which is what makes the quiet failure plausible rather than
 * theoretical.
 *
 * Each rule runs alone, against a config this test writes, so a diagnostic can only have come from that
 * plugin. The path scoping in `biome.base.json` is deliberately not exercised — what is under test is
 * whether the pattern still matches. A rule that reads `$filename` needs a real path anyway, which is what
 * a case's `fixture.json` supplies.
 */
const lintDir = import.meta.dir;
const fixturesDir = path.join(lintDir, "__fixtures__");
const workspaceRoot = path.resolve(lintDir, "../../../..");
const biomeBin = path.join(workspaceRoot, "node_modules", ".bin", Linter.biomeBinName);

interface BiomeDiagnostic {
  severity: string;
  message: string;
  category: string;
  location?: { start?: { line?: number } };
}

/**
 * `path` is where the source is written inside the temp workspace, for a rule that gates on `$filename`;
 * its extension also decides whether the file may hold JSX. `expect: "file"` is for a rule whose span is
 * the whole module (`JsModule()`), where there is no per-line diagnostic to match.
 */
interface FixtureMeta {
  path?: string;
  expect?: "lines" | "file";
}

interface FixtureCase {
  rule: string;
  name: string;
  dir: string;
  meta: FixtureMeta;
}

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const runBiome = (args: string[], cwd: string) =>
  new Promise<string>((resolve, reject) => {
    const proc = spawn(biomeBin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    proc.on("error", reject);
    proc.on("close", () => resolve(stdout || stderr));
  });

/** Every directory holding a `bad.*`, named `<rule>` or `<rule>/<case>`. */
const collectCases = async (): Promise<FixtureCase[]> => {
  const cases: FixtureCase[] = [];
  const walk = async (dir: string, rule: string, name: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name.startsWith("bad."))) {
      const metaPath = path.join(dir, "fixture.json");
      const meta = existsSync(metaPath) ? (JSON.parse(await readFile(metaPath, "utf-8")) as FixtureMeta) : {};
      cases.push({ rule, name: name || rule, dir, meta });
    }
    for (const entry of entries.filter((entry) => entry.isDirectory()))
      await walk(path.join(dir, entry.name), rule, `${rule}/${entry.name}`);
  };
  for (const entry of (await readdir(fixturesDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()))
    await walk(path.join(fixturesDir, entry.name), entry.name, "");
  return cases.sort((left, right) => left.name.localeCompare(right.name));
};

const sourceName = (fixture: FixtureCase, kind: "bad" | "good") => {
  const target = fixture.meta.path;
  if (!target) return { read: `${kind}.tsx`, write: `${kind}.tsx` };
  const ext = path.extname(target);
  return { read: `${kind}${ext}`, write: target };
};

const readFixture = async (fixture: FixtureCase, kind: "bad" | "good") =>
  await readFile(path.join(fixture.dir, sourceName(fixture, kind).read), "utf-8");

/** Diagnostics from one plugin against one fixture, keyed by the 1-based line each was reported on. */
const lintFixture = async (fixture: FixtureCase, kind: "bad" | "good") => {
  const dir = await mkdtemp(path.join(os.tmpdir(), `grit-${fixture.rule}-`));
  tempDirs.push(dir);
  // Every built-in rule off and the formatter silent, so the only thing left that can report is the plugin.
  await writeFile(
    path.join(dir, "biome.json"),
    JSON.stringify({
      linter: { enabled: true, rules: { recommended: false } },
      formatter: { enabled: false },
      assist: { enabled: false },
      plugins: [path.join(lintDir, `${fixture.rule}.grit`)],
    }),
  );
  const source = path.join(dir, sourceName(fixture, kind).write);
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(source, await readFixture(fixture, kind));
  const output = await runBiome(
    ["check", "--reporter=json", "--max-diagnostics=none", "--no-errors-on-unmatched", `--config-path=${dir}`, source],
    dir,
  );
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end < start)
    throw new Error(`biome produced no JSON for ${fixture.name}/${kind}: ${output.slice(0, 400)}`);
  const diagnostics =
    (JSON.parse(output.slice(start, end + 1)) as { diagnostics?: BiomeDiagnostic[] }).diagnostics ?? [];
  return {
    diagnostics,
    lines: [...new Set(diagnostics.map((diagnostic) => diagnostic.location?.start?.line ?? 0))].sort(
      (left, right) => left - right,
    ),
  };
};

/** The 1-based line of every line carrying `marker`. One case per line is the fixture contract. */
const markedLines = async (fixture: FixtureCase, kind: "bad" | "good", marker: string) =>
  (await readFixture(fixture, kind))
    .split("\n")
    .map((line, index) => (line.includes(marker) ? index + 1 : 0))
    .filter((line) => line > 0);

const fixtures = await collectCases();

describe("grit lint rules", () => {
  test("the harness found the biome binary and at least one fixture", () => {
    expect(existsSync(biomeBin)).toBe(true);
    expect(fixtures.length).toBeGreaterThan(0);
  });

  test("every fixture folder names a rule that exists", () => {
    for (const fixture of fixtures) expect(existsSync(path.join(lintDir, `${fixture.rule}.grit`))).toBe(true);
  });

  test("every rule in this folder has a fixture", async () => {
    const ruleFiles = (await readdir(lintDir))
      .filter((name) => name.endsWith(".grit"))
      .map((name) => name.slice(0, -5));
    const covered = new Set(fixtures.map((fixture) => fixture.rule));
    expect(ruleFiles.filter((rule) => !covered.has(rule))).toEqual([]);
  });

  for (const fixture of fixtures) {
    test(`${fixture.name} flags exactly the marked lines in bad`, async () => {
      const { lines, diagnostics } = await lintFixture(fixture, "bad");
      for (const diagnostic of diagnostics) expect(diagnostic.category).toBe("plugin");
      if (fixture.meta.expect === "file") {
        expect(diagnostics.length).toBeGreaterThan(0);
        return;
      }
      const expected = await markedLines(fixture, "bad", "// @flag");
      expect(expected.length).toBeGreaterThan(0);
      // Set equality, not containment: a marked line nobody reported is a pattern that stopped matching,
      // and a reported line nobody marked is the rule reaching further than the fixture claims.
      expect(lines).toEqual(expected);
    });

    test(`${fixture.name} leaves good clean`, async () => {
      expect((await markedLines(fixture, "good", "// @ok")).length).toBeGreaterThan(0);
      const { diagnostics } = await lintFixture(fixture, "good");
      expect(diagnostics.map((diagnostic) => `${diagnostic.location?.start?.line}: ${diagnostic.message}`)).toEqual([]);
    });
  }
});
