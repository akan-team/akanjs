import { afterAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Linter } from "../linter";

//? A rule that stops matching reports zero diagnostics, not an error, so a biome upgrade can retire one silently.
//? Each rule runs alone against a config written here; the path scoping in biome.base.json is deliberately not tested.
const lintDir = import.meta.dir;
const fixturesDir = path.join(lintDir, "__fixtures__");
const workspaceRoot = path.resolve(lintDir, "../../../..");
const [biome, ...biomeArgs] = Linter.biomeCommand(workspaceRoot);

interface BiomeDiagnostic {
  severity: string;
  message: string;
  category: string;
  location?: { start?: { line?: number } };
}

interface FixtureMeta {
  /** Where the source is written, for a rule that gates on `$filename`; its extension decides whether JSX parses. */
  path?: string;
  /** `"file"`: the rule's span is the whole module (`JsModule()`), so there is no per-line diagnostic to match. */
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
    const proc = spawn(biome, [...biomeArgs, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    proc.on("error", reject);
    proc.on("close", () => resolve(stdout || stderr));
  });

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
  return (JSON.parse(output.slice(start, end + 1)) as { diagnostics?: BiomeDiagnostic[] }).diagnostics ?? [];
};

//? One case per line is the fixture contract, and a `bad` line's marker names the severity it is reported at.
const severityOfMarker = { "// @flag": "error", "// @warn": "warning" } as const;

const markedLines = async (fixture: FixtureCase, kind: "bad" | "good", marker: string) =>
  (await readFixture(fixture, kind))
    .split("\n")
    .map((line, index) => (line.includes(marker) ? index + 1 : 0))
    .filter((line) => line > 0);

const expectedReports = async (fixture: FixtureCase) =>
  (await readFixture(fixture, "bad")).split("\n").flatMap((line, index) =>
    Object.entries(severityOfMarker)
      .filter(([marker]) => line.includes(marker))
      .map(([, severity]) => `${index + 1}: ${severity}`),
  );

const byLine = (left: string, right: string) => Number.parseInt(left, 10) - Number.parseInt(right, 10);

const fixtures = await collectCases();

describe("grit lint rules", () => {
  test("the harness found the biome binary and at least one fixture", () => {
    expect(biome).toBe(process.execPath);
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
    test(`${fixture.name} reports each marked line in bad once, at its marker's severity`, async () => {
      const diagnostics = await lintFixture(fixture, "bad");
      for (const diagnostic of diagnostics) expect(diagnostic.category).toBe("plugin");
      if (fixture.meta.expect === "file") {
        expect(diagnostics.length).toBeGreaterThan(0);
        return;
      }
      const expected = await expectedReports(fixture);
      expect(expected.length).toBeGreaterThan(0);
      // An unreported mark stopped matching, an unmarked report is overreach, a line reported twice is one site
      // reported twice, and a severity that differs is a tier that moved.
      const reported = diagnostics.map(
        (diagnostic) => `${diagnostic.location?.start?.line ?? 0}: ${diagnostic.severity}`,
      );
      expect(reported.sort(byLine)).toEqual(expected.sort(byLine));
    });

    test(`${fixture.name} leaves good clean`, async () => {
      expect((await markedLines(fixture, "good", "// @ok")).length).toBeGreaterThan(0);
      const diagnostics = await lintFixture(fixture, "good");
      expect(diagnostics.map((diagnostic) => `${diagnostic.location?.start?.line}: ${diagnostic.message}`)).toEqual([]);
    });
  }
});
