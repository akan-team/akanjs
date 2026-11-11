import { afterEach, describe, expect, test } from "bun:test";
import { rm, symlink } from "node:fs/promises";
import path from "node:path";
import { RouteJsBudget } from "@akanjs/devkit/app/routeJsBudget";
import { createTempApp, createTempPackage, writeJson, writeText } from "@akanjs/devkit/test/testHelpers";
import { ApplicationRunner } from "../application/application.runner";
import { WorkspaceRunner } from "../workspace/workspace.runner";
import { VerifyPipeline } from "./verifyPipeline";
import { VerifyReport } from "./verifyReport";
import { VerifyScope } from "./verifyScope";

const repoRoot = path.resolve(import.meta.dir, "../../../..");
const lintDir = path.resolve(import.meta.dir, "../../devkit/lint");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const brokenPackage = async () => {
  const { root, workspace } = await createTempPackage("@sample/tool");
  roots.push(root);
  await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  const dir = path.join(root, "pkgs/@sample/tool");
  await writeJson(path.join(dir, "tsconfig.json"), {
    compilerOptions: { strict: true, noEmit: true, types: [], target: "esnext", module: "esnext" },
    include: ["index.ts"],
  });
  await writeText(path.join(dir, "index.ts"), 'export const port: number = "8282";\nexport const ok = 1\n');
  return { root, workspace };
};

describe("VerifyPipeline", () => {
  test("lints with fixes and typechecks a package in one run, reporting one line per problem", async () => {
    const { root, workspace } = await brokenPackage();
    const scope = VerifyScope.resolve([{ code: " M", file: "pkgs/@sample/tool/index.ts" }], {
      apps: [],
      libs: [],
      pkgs: ["@sample/tool"],
    });

    const result = await new VerifyPipeline(workspace, new WorkspaceRunner(), new ApplicationRunner()).run(scope);

    expect(result.ok).toBe(false);
    expect(result.steps.map((step) => [step.name, step.status])).toEqual([
      ["lint", "pass"],
      ["typecheck", "fail"],
    ]);
    expect(result.steps.find((step) => step.name === "lint")?.fixed).toBe(1);
    expect(await Bun.file(path.join(root, "pkgs/@sample/tool/index.ts")).text()).toContain("export const ok = 1;");
    expect(VerifyReport.text(result).split("\n").slice(1)).toEqual([
      "pkgs/@sample/tool/index.ts:1:14 TS2322 Type 'string' is not assignable to type 'number'.",
    ]);
  }, 60_000);

  test("renames a module file's #private methods and drops a legacy-class warning the app's CSS defines", async () => {
    const { root, workspace } = await createTempApp("demo");
    roots.push(root);
    await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
    await writeJson(path.join(root, "biome.json"), {
      linter: { enabled: true, rules: { recommended: false } },
      formatter: { indentStyle: "space" },
      assist: { enabled: false },
      plugins: ["no-js-private-class-method", "no-daisyui-legacy-class"].map((rule) =>
        path.join(lintDir, `${rule}.grit`),
      ),
    });
    const service = "apps/demo/lib/post/post.service.ts";
    await writeText(
      path.join(root, service),
      "export class PostService {\n  #load() {\n    return 1;\n  }\n  run() {\n    return this.#load();\n  }\n}\n",
    );
    await writeText(path.join(root, "apps/demo/page/styles.css"), ".stat-value {\n  font-weight: 700;\n}\n");
    await writeText(
      path.join(root, "apps/demo/ui/Stat.tsx"),
      'export const Stat = () => <dd className="stat-value" />;\n',
    );
    const scope = VerifyScope.resolve(
      [service, "apps/demo/ui/Stat.tsx"].map((file) => ({ code: "??", file })),
      { apps: ["demo"], libs: [], pkgs: [] },
    );

    const result = await new VerifyPipeline(workspace, new WorkspaceRunner(), new ApplicationRunner()).run(scope, {
      lintOnly: true,
    });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === "plugin")).toEqual([]);
    expect(await Bun.file(path.join(root, service)).text()).toBe(
      "export class PostService {\n  private load() {\n    return 1;\n  }\n  run() {\n    return this.load();\n  }\n}\n",
    );
    expect(result.steps.find((step) => step.name === "lint")?.fixed).toBe(1);
  }, 60_000);

  test("warns of a route over its JS budget or with no entry, which only akan build --check-budget fails on", async () => {
    const { root, workspace } = await createTempApp("demo");
    roots.push(root);
    await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
    const changed = "apps/demo/common/value.ts";
    await writeText(path.join(root, changed), "export const value = 1;\n");
    const budgetPath = path.join(root, "apps/demo", RouteJsBudget.fileName);
    await writeJson(budgetPath, { routeJsBrotliKB: { "/:lang": 120 } });
    const { warnings } = await RouteJsBudget.check(
      [
        { routeId: "/:lang", files: 1, rawBytes: 300_000, brotliBytes: 128_000 },
        { routeId: "/:lang/new", files: 1, rawBytes: 3_000, brotliBytes: 1_000 },
      ],
      { mode: "report", app: "demo", budgetPath, source: "apps/demo/akan.budget.json", environment: "local" },
    );
    const builds: unknown[] = [];
    const applicationRunner = {
      typecheck: async () => undefined,
      build: async (_app: unknown, options: unknown) => {
        builds.push(options);
        return { routeJsWarnings: warnings };
      },
    } as unknown as ApplicationRunner;
    const scope = VerifyScope.resolve([{ code: "??", file: changed }], { apps: ["demo"], libs: [], pkgs: [] });

    const result = await new VerifyPipeline(workspace, new WorkspaceRunner(), applicationRunner).run(scope);

    expect(builds).toEqual([{ fast: true }]);
    expect(result.ok).toBe(true);
    expect(result.steps.find((step) => step.name === "build")?.status).toBe("pass");
    expect(VerifyReport.text(result).split("\n").slice(1)).toEqual([
      "apps/demo/akan.budget.json warning akan.budget /:lang loads 128,000 bytes brotli, over its limit of 126,976; akan build --check-budget fails on it fix: shrink what the route loads, or raise its entry with akan build demo --raise-budget",
      "apps/demo/akan.budget.json warning akan.budget /:lang/new has no entry; akan build --check-budget fails on it fix: record it with akan build demo --update-budget",
    ]);
  }, 60_000);
});
