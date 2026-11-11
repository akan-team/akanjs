import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Linter, parseBiomeReport } from "@akanjs/devkit/lint/linter";
import { writeJson, writeText } from "@akanjs/devkit/test/testHelpers";
import { VerifyStyleClasses } from "./verifyStyleClasses";

const grit = path.resolve(import.meta.dir, "../../devkit/lint/no-daisyui-legacy-class.grit");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const lintedApp = async (css: string, source: string) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "verify-style-"));
  roots.push(root);
  const installed = path.join(root, "node_modules/@akanjs/devkit/lint/no-daisyui-legacy-class.grit");
  await mkdir(path.dirname(installed), { recursive: true });
  await copyFile(grit, installed);
  await writeJson(path.join(root, "biome.json"), {
    linter: { enabled: true, rules: { recommended: false } },
    formatter: { enabled: false },
    assist: { enabled: false },
    plugins: [installed],
  });
  await writeText(path.join(root, "apps/demo/page/styles.css"), css);
  await writeText(path.join(root, "apps/demo/ui/Stats.tsx"), source);
  const [biome, ...biomeArgs] = Linter.biomeCommand(path.resolve(import.meta.dir, "../../../.."));
  const proc = Bun.spawn(
    [biome, ...biomeArgs, "check", "--reporter=json", `--config-path=${root}`, "apps/demo/ui/Stats.tsx"],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { root, diagnostics: parseBiomeReport(stdout).diagnostics ?? [] };
};

const linesOf = (diagnostics: { location?: { start?: { line?: number } }; severity: string }[]) =>
  diagnostics
    .map((diagnostic) => `${diagnostic.location?.start?.line}: ${diagnostic.severity}`)
    .sort((left, right) => left.localeCompare(right));

describe("VerifyStyleClasses", () => {
  test("reads the legacy component pattern off the rule, variants included", () => {
    const pattern = VerifyStyleClasses.legacyPatternOf(readFileSync(grit, "utf-8"));

    expect(["stat-value", "md:card-body", "!btn-primary"].map((token) => pattern?.test(token))).toEqual([
      true,
      true,
      true,
    ]);
    expect(["stat", "stat-values", "bg-base-100", "text-primary"].map((token) => pattern?.test(token))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  test("collects the classes a stylesheet defines, Tailwind utilities included and comments not", () => {
    const names = VerifyStyleClasses.classesDefinedIn(
      "/* .modal-box */ .grid > .stat-value:hover, .md\\:card-body { color: red; } @utility join-item { gap: 0; }",
    );

    expect([...names].sort((left, right) => left.localeCompare(right))).toEqual([
      "grid",
      "join-item",
      "md:card-body",
      "stat-value",
    ]);
  });

  test("drops a component-class warning the app's CSS defines, and keeps the undefined one and the colour slot", async () => {
    const { root, diagnostics } = await lintedApp(
      ".stat-value, .stat-title { font-weight: 700; }\n",
      [
        'export const Defined = () => <dt className="stat-title md:stat-value" />;',
        'export const Undefined = () => <dt className="stat-title stat-desc" />;',
        'export const ColourSlot = () => <dt className="stat-value bg-base-100" />;',
        "",
      ].join("\n"),
    );
    expect(linesOf(diagnostics)).toEqual(["1: warning", "2: warning", "3: error"]);

    const kept = await VerifyStyleClasses.dropDefined(root, diagnostics, ["apps/demo", "libs"]);

    expect(linesOf(kept)).toEqual(["2: warning", "3: error"]);
  });
});
