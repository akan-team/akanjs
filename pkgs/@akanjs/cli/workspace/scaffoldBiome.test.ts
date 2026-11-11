import { describe, expect, spyOn, test } from "bun:test";
import { mkdir, readFile, symlink } from "node:fs/promises";
import path from "node:path";
import { WorkspaceExecutor } from "@akanjs/devkit/executors";
import { Linter } from "@akanjs/devkit/lint/linter";
import { hasBiome, makeCliTempWorkspace, tempRoots, writeText } from "@akanjs/devkit/test/testHelpers";
import { bilingualDescriptionForField, bilingualLabelForField } from "@akanjs/devkit/workflow";
import { capitalize, Logger } from "akanjs/common";
import { ContextRunner } from "../context/context.runner";
import { pluralizeName } from "../pluralizeName";

const repoRoot = path.resolve(import.meta.dir, "../../../..");
const track = tempRoots();

const withCapitals = (dict: Record<string, string>) => ({
  ...dict,
  ...Object.fromEntries(Object.entries(dict).map(([key, value]) => [capitalize(key), capitalize(value)])),
});

interface Sys {
  type: "app" | "lib";
  name: string;
  sharedGuards: boolean;
}

//? Names sorting around the identifiers imported beside them, and long enough to break lines at every layout branch.
const models = [
  "apple",
  "item",
  "product",
  "zebra",
  "organizationMembershipInvitation",
  "organizationMembershipInvitationReminderLetter",
];
const services = ["billing", "zooKeeperNotificationDispatcher"];
const scalars = ["address", "geoCoordinateRangeSnapshot"];
const systems: Sys[] = [
  { type: "app", name: "myapp", sharedGuards: true },
  { type: "app", name: "zooKeeperAdministrationPortal", sharedGuards: false },
  { type: "lib", name: "mylib", sharedGuards: false },
  { type: "lib", name: "analyticsWarehouseConnector", sharedGuards: true },
];

class Scaffold {
  readonly written: string[] = [];
  constructor(readonly workspace: WorkspaceExecutor) {}

  async apply(basePath: string, template: string, dict: Record<string, string>, options: Record<string, unknown> = {}) {
    const files = await this.workspace._applyTemplate({ basePath, template, dict: withCapitals(dict), options });
    this.written.push(...files.map((file) => file.filePath));
  }

  async sys({ type, name, sharedGuards }: Sys) {
    const root = `${type}s/${name}`;
    const sysDict = { sysName: name, sysType: type };
    for (const model of models)
      await this.apply(
        `${root}/lib/${model}`,
        "module",
        {
          model,
          models: pluralizeName(model),
          ...sysDict,
          modelLabelEn: bilingualLabelForField(model).en,
          modelLabelKo: bilingualLabelForField(model).ko,
          modelDescEn: bilingualDescriptionForField(model).en,
          modelDescKo: bilingualDescriptionForField(model).ko,
        },
        { sharedGuards },
      );
    for (const model of services) await this.apply(`${root}/lib/_${model}`, "service", { model, sysName: name });
    for (const model of scalars)
      await this.apply(`${root}/lib/__scalar`, "__scalar", { model, models: pluralizeName(model), sysName: name });
    if (type === "lib") return;
    for (const model of models) {
      const crudDict = { model, appName: name, clientPath: `@${type}s/${name}/client` };
      await this.apply(`${root}/page/(${name})/(public)/${model}`, "crudPages", crudDict);
      await this.apply(`${root}/page/(${name})/(single)/${model}`, "crudSinglePage", crudDict);
    }
    await this.apply(`${root}/script/migration`, "migration", {
      migrationId: "202611030000_backfillOrderTotals",
      title: "Backfill order totals",
    });
  }
}

const firstDifference = (generated: string, biome: string) => {
  const [generatedLines, biomeLines] = [generated.split("\n"), biome.split("\n")];
  const line = generatedLines.findIndex((text, idx) => text !== biomeLines[idx]);
  const at = line === -1 ? generatedLines.length : line;
  return { line: at + 1, generated: generatedLines.slice(at, at + 3), biome: biomeLines.slice(at, at + 3) };
};

describe("scaffold output", () => {
  test.skipIf(!hasBiome)(
    "is already in the form `biome check --write` prints, so a first lint rewrites nothing",
    async () => {
      spyOn(Logger, "rawLog").mockImplementation(() => undefined);
      const { root } = track(await makeCliTempWorkspace());
      const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot: root, repoName: "myrepo" });
      const scaffold = new Scaffold(workspace);

      await scaffold.apply(".", "workspaceRoot", {
        repoName: "myrepo",
        appName: "myapp",
        serveDomain: "localhost",
        owner: "",
      });
      await scaffold.apply("apps/myapp", "app", { appName: "myapp" }, { libs: ["util", "shared"] });
      await scaffold.apply("apps/myapp", "appSample", { appName: "myapp" }, { libs: ["util", "shared"] });
      await scaffold.apply(
        "apps/zooKeeperAdministrationPortal",
        "app",
        { appName: "zooKeeperAdministrationPortal" },
        { libs: [] },
      );
      for (const libName of ["mylib", "analyticsWarehouseConnector"])
        await scaffold.apply(`libs/${libName}`, "libRoot", { libName });
      await scaffold.apply("pkgs/tools", "pkgRoot", { pkgName: "tools", workspaceRootPath: "../.." });
      for (const sys of systems) await scaffold.sys(sys);
      for (const target of ["cursor", "claude"] as const)
        scaffold.written.push(path.join(root, await new ContextRunner().installMcp(workspace, target)));

      //? A canary Biome must rewrite: a config that failed to load would rewrite nothing and pass the check below.
      const canary = path.join(root, "apps/myapp/canary.ts");
      await writeText(canary, "export const  canary = { a:1 }\n");
      await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"), "junction");
      //? Windows resolves a relative symlink met through a junction against the junction's path, so the repo's
      //? `node_modules/@akanjs/devkit -> ../../pkgs/@akanjs/devkit` lands here, where Biome reads its plugins.
      if (process.platform === "win32") {
        await mkdir(path.join(root, "pkgs", "@akanjs"), { recursive: true });
        await symlink(path.join(repoRoot, "pkgs/@akanjs/devkit"), path.join(root, "pkgs/@akanjs/devkit"), "junction");
      }
      const checked = scaffold.written.filter((file) => /\.(tsx?|jsonc?)$/.test(file));
      const before = new Map(
        await Promise.all(checked.map(async (file) => [file, await readFile(file, "utf8")] as const)),
      );

      const { fixed } = await new Linter(root).fixFiles([...checked, canary]);

      expect(fixed).toContain(canary);
      const rewritten = await Promise.all(
        fixed
          .filter((file) => file !== canary)
          .map(async (file) => ({
            file: path.relative(root, file),
            ...firstDifference(before.get(file) ?? "", await readFile(file, "utf8")),
          })),
      );
      expect(rewritten).toEqual([]);
    },
    60_000,
  );
});
