import { describe, expect, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readlink, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AkanAppConfig } from "./akanConfig";
import {
  AppExecutor,
  CommandExecutionError,
  Executor,
  type LibExecutor,
  PkgExecutor,
  WorkspaceExecutor,
} from "./executors";
import { DevGeneratedIndexSync } from "./frontendBuild/devGeneratedIndexSync";
import { AppInfo } from "./scanInfo";
import {
  createTempApp,
  createTempLib,
  formatWithBiome,
  hasBiome,
  isolateEnv,
  tempDirs,
  tempRoots,
  writeJson,
  writeText,
} from "./testHelpers";
import type { PackageJson } from "./types";

isolateEnv();
const makeTempRoot = tempDirs("akan-devkit-");
const trackRoot = tempRoots();

const PAGE_SOURCE = "export default function Page() {\n  return null;\n}\n";

const rootPackageJson = (extra: Partial<PackageJson> = {}): PackageJson => ({
  name: "fixture",
  version: "1.0.0",
  description: "fixture",
  dependencies: {
    react: "19.0.0",
    "react-dom": "19.0.0",
    "react-server-dom-webpack": "19.0.0",
    lodash: "4.0.0",
  },
  devDependencies: {
    typescript: "6.0.0",
  },
  ...extra,
});

describe("Executor filesystem helpers", () => {
  test("reports command failures with command context and captured output", async () => {
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);

    const error = await exec
      .spawn(process.execPath, ["--eval", "console.error('spawn failed'); process.exit(7)"])
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CommandExecutionError);
    const { message } = error as CommandExecutionError;
    expect(message).toContain(`Command failed: ${process.execPath}`);
    expect(message).toContain(`cwd: ${root}`);
    expect(message).toContain("exit code: 7");
    expect(message).toContain("spawn failed");
  });

  test("reports inherited stdio command failures with a fallback message", async () => {
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);

    const error = await exec
      .spawn(process.execPath, ["--eval", "process.exit(3)"], { stdio: "inherit" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CommandExecutionError);
    const { message } = error as CommandExecutionError;
    expect(message).toContain(`Command failed: ${process.execPath}`);
    expect(message).toContain(`cwd: ${root}`);
    expect(message).toContain("exit code: 3");
  });

  test("resolves paths and reads/writes files relative to cwd", async () => {
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);

    expect(exec.getPath("nested/file.txt")).toBe(path.join(root, "nested/file.txt"));
    expect(exec.getPath("./relative.txt")).toBe(path.join(root, "relative.txt"));
    expect(exec.getPath(root)).toBe(root);

    await exec.mkdir("nested");
    await exec.writeFile("nested/file.txt", "hello");
    await exec.writeJson("nested/data.json", { ok: true });

    expect(await exec.exists("nested/file.txt")).toBe(true);
    expect(await exec.readFile("nested/file.txt")).toBe("hello");
    expect(await exec.readJson("nested/data.json")).toEqual({ ok: true });
    expect(await exec.readdir("nested")).toEqual(expect.arrayContaining(["file.txt", "data.json"]));

    const entries = await exec.getFilesAndDirs(".");
    expect(entries.dirs).toContain("nested");
  });

  test("lists a folder in name order, whatever order the filesystem keeps it in", async () => {
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);
    for (const name of ["summary", "file", "banner", "_noti", "admin"]) await exec.mkdir(`lib/${name}`);
    for (const name of ["st.ts", "cnst.ts", "dict.ts"]) await exec.writeFile(`lib/${name}`, "");

    expect(await exec.readdir("lib")).toEqual([
      "_noti",
      "admin",
      "banner",
      "cnst.ts",
      "dict.ts",
      "file",
      "st.ts",
      "summary",
    ]);
    expect(await exec.getFilesAndDirs("lib")).toEqual({
      files: ["cnst.ts", "dict.ts", "st.ts"],
      dirs: ["_noti", "admin", "banner", "file", "summary"],
    });
    expect(await exec.getAllFiles("**/*", { cwd: exec.getPath("lib") })).toEqual(["cnst.ts", "dict.ts", "st.ts"]);
  });

  test("a refreshed tsconfig re-reads the config it extends", async () => {
    const root = await makeTempRoot();
    const appDir = path.join(root, "apps/demo");
    await writeJson(path.join(root, "tsconfig.json"), {
      compilerOptions: { target: "es2022", paths: { "@libs/*": ["libs/*"] } },
    });
    await writeJson(path.join(appDir, "tsconfig.json"), {
      extends: "../../tsconfig.json",
      compilerOptions: { target: "esnext" },
      references: [{ path: "../shared" }],
    });
    const exec = new Executor("fixture", appDir);
    expect(await exec.getTsConfig()).toEqual({
      extends: "../../tsconfig.json",
      compilerOptions: { target: "esnext", paths: { "@libs/*": ["libs/*"] } },
      references: [{ path: "../shared" }],
    });

    await writeJson(path.join(root, "tsconfig.json"), { compilerOptions: { target: "es2020" } });
    await writeJson(path.join(appDir, "tsconfig.json"), { extends: "../../tsconfig.json", compilerOptions: {} });
    const refreshed = { extends: "../../tsconfig.json", compilerOptions: { target: "es2020" } };
    expect(await exec.getTsConfig("tsconfig.json", { refresh: true })).toEqual(refreshed);
    expect(await new Executor("fixture", appDir).getTsConfig()).toEqual(refreshed);
  });

  test("applies CLI template files with dictionary replacement and overwrite control", async () => {
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);

    const [created] = await exec.applyTemplate({
      basePath: "local",
      template: "localDev/docker-compose.yaml.template",
      dict: { repoName: "sample" },
    });
    expect(created?.filePath).toBe(path.join(root, "local/docker-compose.yaml"));
    expect(await readFile(path.join(root, "local/docker-compose.yaml"), "utf8")).toContain("sample-network");

    await writeFile(path.join(root, "local/docker-compose.yaml"), "custom");
    await exec.applyTemplate({
      basePath: "local",
      template: "localDev/docker-compose.yaml.template",
      dict: { repoName: "changed" },
      overwrite: false,
    });
    expect(await readFile(path.join(root, "local/docker-compose.yaml"), "utf8")).toBe("custom");
  });

  test("hands every scaffolded TypeScript file to the formatter, and nothing else", async () => {
    // A template cannot sort imports that depend on the model name, and unsorted imports fail `biome check`.
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);
    const formatted: string[] = [];
    exec.getLinter = () =>
      ({
        fixFiles: async (filePaths: string[]) => {
          formatted.push(...filePaths);
          return { fixed: [] };
        },
      }) as unknown as ReturnType<Executor["getLinter"]>;

    await exec.applyTemplate({
      basePath: "apps/demo/page/task",
      template: "crudSinglePage",
      dict: { model: "task", appName: "demo" },
    });

    expect(formatted).toEqual([path.join(root, "apps/demo/page/task/_index.tsx")]);
  });

  test("an app hands its scaffolded files to the formatter too", async () => {
    const { root, app } = trackRoot(await createTempApp("demo"));
    const formatted: string[] = [];
    app.getLinter = () =>
      ({
        fixFiles: async (filePaths: string[]) => {
          formatted.push(...filePaths);
          return { fixed: [] };
        },
      }) as unknown as ReturnType<Executor["getLinter"]>;

    await app.applyTemplate({
      basePath: "page/task",
      template: "crudSinglePage",
      dict: { model: "task", appName: "demo" },
    });

    expect(formatted).toEqual([path.join(root, "apps/demo/page/task/_index.tsx")]);
  });

  test("hands the formatter only the files a template wrote, never one overwrite: false kept", async () => {
    const { root, app } = trackRoot(await createTempApp("demo"));
    const formatted: string[] = [];
    app.getLinter = () =>
      ({
        fixFiles: async (filePaths: string[]) => {
          formatted.push(...filePaths);
          return { fixed: [] };
        },
      }) as unknown as ReturnType<Executor["getLinter"]>;
    const scalarDir = path.join(root, "apps/demo/lib/__scalar/money");
    const own = "export class Money   {}\n";
    await writeText(path.join(scalarDir, "money.constant.ts"), own);

    const applied = await app.applyTemplate({
      basePath: "./lib/__scalar",
      template: "__scalar",
      dict: { model: "money", models: "moneys", sysName: "demo" },
      overwrite: false,
    });

    expect(applied.map((fileContent) => fileContent.filePath)).toContain(path.join(scalarDir, "money.constant.ts"));
    expect(formatted.sort((a, b) => a.localeCompare(b))).toEqual([
      path.join(scalarDir, "money.dictionary.ts"),
      path.join(scalarDir, "money.document.ts"),
    ]);
    expect(await readFile(path.join(scalarDir, "money.constant.ts"), "utf8")).toBe(own);
  });

  test("a formatter that cannot run does not fail the scaffold", async () => {
    // create-akan-workspace scaffolds before `bun install`, so Biome may be absent; a lint fix beats a failed scaffold.
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);
    exec.getLinter = () => {
      throw new Error("biome.json not found");
    };

    const created = await exec.applyTemplate({
      basePath: "apps/demo/page/task",
      template: "crudSinglePage",
      dict: { model: "task", appName: "demo" },
    });

    expect(created).toHaveLength(1);
    expect(await readFile(path.join(root, "apps/demo/page/task/_index.tsx"), "utf8")).toContain("Task.Zone.Card");
  });

  test("applies hidden files and directories from CLI templates", async () => {
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);

    await exec.applyTemplate({
      basePath: "workspace",
      template: "workspaceRoot",
      dict: { repoName: "sample", appName: "demo", serveDomain: "localhost" },
    });

    expect(await readFile(path.join(root, "workspace/.gitignore"), "utf8")).toContain("node_modules");
    expect(await readFile(path.join(root, "workspace/.env"), "utf8")).toContain("AKAN_PUBLIC_REPO_NAME");
    expect(await readFile(path.join(root, "workspace/.vscode/settings.json"), "utf8")).toContain("typescript.tsdk");
    expect(await readFile(path.join(root, "workspace/.cursor/rules/akan.mdc"), "utf8")).toContain(
      "Akan workspace agent guide",
    );
    expect(await readFile(path.join(root, "workspace/AGENTS.md"), "utf8")).toContain("sample Agent Guide");
    expect(await readFile(path.join(root, "workspace/docs/AI-DEVELOPMENT.md"), "utf8")).toContain(
      "AI Development Guide",
    );
    expect(await readFile(path.join(root, "workspace/docs/GENERATED.md"), "utf8")).toContain("Generated Akan Files");
    // Rules live in the package's base config, so a framework release reaches an existing workspace on `bun update`.
    expect(await readFile(path.join(root, "workspace/biome.json"), "utf8")).toContain(
      '"extends": ["@akanjs/devkit/biome.base.json"]',
    );
  });

  test("applies app sample signal test helpers", async () => {
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);

    await exec.applyTemplate({
      basePath: "app",
      template: "appSample",
      dict: { appName: "demo" },
      options: { libs: [] },
    });

    await expect(readFile(path.join(root, "app/lib/task/task.service.test.ts"), "utf8")).rejects.toThrow();
    expect(await readFile(path.join(root, "app/lib/task/task.signal.spec.ts"), "utf8")).toContain("getCompletedTask");
    expect(await readFile(path.join(root, "app/lib/task/task.signal.test.ts"), "utf8")).toContain("Task signal smoke");
    expect(await readFile(path.join(root, "app/lib/task/task.document.ts"), "utf8")).toContain('action: "started"');
  });

  test("copies static files from CLI templates", async () => {
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);

    await exec.applyTemplate({ basePath: "app", template: "app", dict: { appName: "demo" }, options: { libs: [] } });
    const templateRoot = path.resolve(import.meta.dir, "../cli/templates/app/public");
    await expect(readFile(path.join(root, "app/public/logo.png"))).resolves.toEqual(
      await readFile(path.join(templateRoot, "logo.png")),
    );
    await expect(readFile(path.join(root, "app/public/favicon.ico"))).resolves.toEqual(
      await readFile(path.join(templateRoot, "favicon.ico")),
    );
  });

  test("keeps a static file already there when overwrite is false, and reports it unwritten", async () => {
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);
    await writeText(path.join(root, "app/public/logo.png"), "the app's own logo");

    const applied = await exec.applyTemplate({
      basePath: "app/public",
      template: "app/public/logo.png",
      overwrite: false,
    });

    expect(await readFile(path.join(root, "app/public/logo.png"), "utf8")).toBe("the app's own logo");
    expect(applied).toEqual([
      expect.objectContaining({ filePath: path.join(root, "app/public/logo.png"), written: false }),
    ]);
  });
});

describe("Workspace and app executor environment contracts", () => {
  test("reads base development environment and reports required missing values", () => {
    process.env.AKAN_PUBLIC_REPO_NAME = "repo";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_APP_NAME = "demo";
    process.env.AKAN_WORKSPACE_ROOT = "/workspace";
    process.env.PORT_OFFSET = "10";

    expect(WorkspaceExecutor.getBaseDevEnv()).toEqual({
      appName: "demo",
      workspaceRoot: "/workspace",
      repoName: "repo",
      serveDomain: "example.com",
      env: "local",
      portOffset: 10,
      workspaceId: undefined,
    });

    delete process.env.AKAN_PUBLIC_REPO_NAME;
    expect(() => WorkspaceExecutor.getBaseDevEnv()).toThrow("AKAN_PUBLIC_REPO_NAME is not set");
  });

  test("reads base development environment from an explicit env file", async () => {
    const root = await makeTempRoot();
    await writeFile(
      path.join(root, ".env"),
      [
        "AKAN_PUBLIC_REPO_NAME=file-repo",
        'AKAN_PUBLIC_SERVE_DOMAIN="file.example.com"',
        "AKAN_PUBLIC_ENV=develop",
        "AKAN_WORKSPACE_ROOT=/from-file",
        "AKAN_PUBLIC_APP_NAME=file-app",
        "PORT_OFFSET=7",
        "",
      ].join("\n"),
    );
    delete process.env.AKAN_PUBLIC_REPO_NAME;
    delete process.env.AKAN_PUBLIC_SERVE_DOMAIN;

    expect(WorkspaceExecutor.getBaseDevEnv(path.join(root, ".env"))).toEqual({
      appName: "file-app",
      workspaceRoot: "/from-file",
      repoName: "file-repo",
      serveDomain: "file.example.com",
      env: "develop",
      portOffset: 7,
      workspaceId: undefined,
    });
  });

  test("builds app command environment and prepareCommand artifacts", async () => {
    const root = await makeTempRoot();
    process.env.AKAN_PUBLIC_REPO_NAME = "repo";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.PORT_OFFSET = "3";

    await writeJson(path.join(root, "package.json"), rootPackageJson());
    await mkdir(path.join(root, "apps/demo/private"), { recursive: true });
    await mkdir(path.join(root, "apps/demo/public"), { recursive: true });
    await writeFile(
      path.join(root, "apps/demo/akan.config.ts"),
      [
        "export default {",
        '  routes: [{ basePath: "admin", domains: { debug: ["Admin.Debug.Example.com:8282"] } }],',
        '  i18n: { locales: ["en", "ko"], defaultLocale: "ko" },',
        "};",
        "",
      ].join("\n"),
    );

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const app = AppExecutor.from(workspace, "demo");
    const env = app.getCommandEnv({ EXTRA: "ok" });
    expect(env.AKAN_PUBLIC_APP_NAME).toBe("demo");
    expect(env.AKAN_WORKSPACE_ROOT).toBe(root);
    expect(env.PORT).toBe("8285");
    expect(env.AKAN_PUBLIC_CLIENT_PORT).toBe("8285");
    expect(env.AKAN_PUBLIC_SERVER_PORT).toBe("8285");
    expect(env.EXTRA).toBe("ok");

    const shellOperationMode = process.env.AKAN_PUBLIC_OPERATION_MODE;
    const shellServerPort = process.env.AKAN_PUBLIC_SERVER_PORT;
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.AKAN_PUBLIC_SERVER_PORT = "8282";
    const prepared = await app.prepareCommand("build");
    const bakedOperationMode = process.env.AKAN_PUBLIC_OPERATION_MODE;
    const bakedServerPort = process.env.AKAN_PUBLIC_SERVER_PORT;
    if (shellOperationMode === undefined) delete process.env.AKAN_PUBLIC_OPERATION_MODE;
    else process.env.AKAN_PUBLIC_OPERATION_MODE = shellOperationMode;
    if (shellServerPort !== undefined) process.env.AKAN_PUBLIC_SERVER_PORT = shellServerPort;
    expect(bakedServerPort).toBeUndefined();
    expect(bakedOperationMode).toBeUndefined();
    expect(prepared.env.AKAN_COMMAND_TYPE).toBe("build");
    expect(prepared.env.AKAN_PUBLIC_BASE_PATHS).toBe("admin");
    expect(prepared.env.AKAN_DATABASE_MODE).toBe("single");
    expect(prepared.env.AKAN_DATABASE_MODES).toBe("single");
    // Bundling bakes each AKAN_PUBLIC_* into a literal, so a dev port published here would outrank the container PORT.
    expect(process.env.AKAN_PUBLIC_APP_NAME).toBe("demo");
    expect(process.env.AKAN_PUBLIC_CLIENT_PORT).toBeUndefined();
    expect(process.env.AKAN_PUBLIC_SERVER_PORT).toBeUndefined();
    expect((await stat(path.join(root, "dist/apps/demo/private"))).isDirectory()).toBe(true);
    expect((await stat(path.join(root, "dist/apps/demo/public"))).isDirectory()).toBe(true);
  });

  test("akan start clears the dev output and keeps the bin downloads and a native folder from before dist/native", async () => {
    const root = await makeTempRoot();
    process.env.AKAN_PUBLIC_REPO_NAME = "repo";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.PORT_OFFSET = "0";
    await writeJson(path.join(root, "package.json"), rootPackageJson());
    await mkdir(path.join(root, "apps/startclean/page"), { recursive: true });
    await writeFile(path.join(root, "apps/startclean/akan.config.ts"), "export default {};\n");
    const akan = path.join(root, "apps/startclean/.akan");
    const kept = [
      "native/desktop/updates/macos-arm64/main.json",
      "native/desktop/build/macos/App.app",
      "cache/bin/ffmpeg",
    ];
    const removed = [
      "artifact/client/app.js",
      "generated/dict/index.ts",
      "cache/cssCandidates.json",
      "desktop/server/main.js",
      "mobile/desktop/native/macos/App.app",
    ];
    for (const file of [...kept, ...removed]) await writeText(path.join(akan, file), "x");

    const app = AppExecutor.from(new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" }), "startclean");
    await app.prepareCommand("start");

    for (const file of kept) expect(existsSync(path.join(akan, file))).toBe(true);
    for (const file of [...removed, "artifact", "generated", "desktop", "mobile"])
      expect(existsSync(path.join(akan, file))).toBe(false);
  });

  describe("syncPages", () => {
    // `AppExecutor.from` memoises by name, so each test needs a name no other test has used.
    const makeAppWithLibPages = async (
      appName: string,
      { config = "export default {};\n", libs = { shared: ["about"] } as Record<string, string[] | null> } = {},
    ) => {
      const root = await makeTempRoot();
      process.env.AKAN_PUBLIC_REPO_NAME = "repo";
      process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
      process.env.AKAN_PUBLIC_ENV = "local";
      process.env.PORT_OFFSET = "0";
      await writeJson(path.join(root, "package.json"), rootPackageJson());
      for (const [lib, routes] of Object.entries(libs)) {
        await mkdir(path.join(root, "libs", lib), { recursive: true });
        for (const route of routes ?? []) {
          await mkdir(path.join(root, "libs", lib, "page", route), { recursive: true });
          await writeFile(path.join(root, "libs", lib, "page", route, "_index.tsx"), PAGE_SOURCE);
        }
      }
      await mkdir(path.join(root, "apps", appName, "page"), { recursive: true });
      await writeFile(path.join(root, "apps", appName, "akan.config.ts"), config);
      const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
      return { root, app: AppExecutor.from(workspace, appName), appRoot: path.join(root, "apps", appName) };
    };

    test("links every lib dep that ships a page folder when enabled with true", async () => {
      const { app, appRoot } = await makeAppWithLibPages("pages-true", {
        config: "export default { syncPageLibs: true };\n",
        libs: { shared: ["about"], util: null },
      });
      expect(await app.syncPages(["shared", "util"])).toBe(true);

      const link = path.join(appRoot, "page/(libs)/(shared)");
      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      expect(await lstat(path.join(appRoot, "page/(libs)/(util)")).catch(() => null)).toBeNull();
      expect(await app.getPageKeys({ refresh: true })).toEqual(["./(libs)/(shared)/about/_index.tsx"]);
    });

    test("is a no-op when the links already match the config", async () => {
      const { app } = await makeAppWithLibPages("pages-noop", {
        config: "export default { syncPageLibs: ['shared'] };\n",
      });
      expect(await app.syncPages(["shared"])).toBe(true);
      expect(await app.syncPages(["shared"])).toBe(false);
    });

    test("removes the synced page folder when disabled", async () => {
      const { app, appRoot } = await makeAppWithLibPages("pages-disable", {
        config: "export default { syncPageLibs: true };\n",
      });
      await app.syncPages(["shared"]);
      expect((await lstat(path.join(appRoot, "page/(libs)/(shared)"))).isSymbolicLink()).toBe(true);

      await writeFile(path.join(appRoot, "akan.config.ts"), "export default { syncPageLibs: false };\n");
      await app.getConfig({ refresh: true });
      expect(await app.syncPages(["shared"])).toBe(true);
      expect(await lstat(path.join(appRoot, "page/(libs)")).catch(() => null)).toBeNull();
    });

    test("clears a link whose lib page folder was deleted, and keeps the workspace walkable", async () => {
      const { root, app, appRoot } = await makeAppWithLibPages("pages-dangling", {
        config: "export default { syncPageLibs: true };\n",
      });
      await app.syncPages(["shared"]);
      await rm(path.join(root, "libs/shared/page"), { recursive: true, force: true });

      // A dangling link sits 3 levels under apps/, which is inside the workspace app scan's walk.
      expect(await app.workspace.getApps()).toEqual(["pages-dangling"]);
      expect(await app.syncPages(["shared"])).toBe(true);
      expect(await lstat(path.join(appRoot, "page/(libs)")).catch(() => null)).toBeNull();
    });

    test("rejects a lib the app does not depend on, and one without a page folder", async () => {
      const { app } = await makeAppWithLibPages("pages-unknown", {
        config: "export default { syncPageLibs: ['missing'] };\n",
      });
      await expect(app.syncPages(["shared"])).rejects.toThrow("does not depend on it");

      const { app: noPage } = await makeAppWithLibPages("pages-nopage", {
        config: "export default { syncPageLibs: ['util'] };\n",
        libs: { util: null },
      });
      await expect(noPage.syncPages(["util"])).rejects.toThrow("libs/util/page does not exist");
    });

    test("links into every basePath when the app declares subRoutes", async () => {
      const { app, appRoot } = await makeAppWithLibPages("pages-baseroutes", {
        config: [
          "export default {",
          "  syncPageLibs: true,",
          '  routes: [{ basePath: "admin", domains: {} }, { basePath: "shop", domains: {} }],',
          "};",
          "",
        ].join("\n"),
      });
      await app.syncPages(["shared"]);

      expect((await lstat(path.join(appRoot, "page/admin/(libs)/(shared)"))).isSymbolicLink()).toBe(true);
      expect((await lstat(path.join(appRoot, "page/shop/(libs)/(shared)"))).isSymbolicLink()).toBe(true);
      expect(await app.getPageKeys({ refresh: true })).toEqual([
        "./admin/(libs)/(shared)/about/_index.tsx",
        "./shop/(libs)/(shared)/about/_index.tsx",
      ]);
    });

    test("rejects a lib route that collides with an app route", async () => {
      const { app, appRoot } = await makeAppWithLibPages("pages-collide", {
        config: "export default { syncPageLibs: true };\n",
      });
      await mkdir(path.join(appRoot, "page/(marketing)/about"), { recursive: true });
      await writeFile(path.join(appRoot, "page/(marketing)/about/_index.tsx"), PAGE_SOURCE);
      await app.syncPages(["shared"]);

      await expect(app.getPageKeys({ refresh: true })).rejects.toThrow('duplicate page route "/:lang/about"');
    });

    test("rejects two libs that mount the same route", async () => {
      const { app } = await makeAppWithLibPages("pages-collide-libs", {
        config: "export default { syncPageLibs: true };\n",
        libs: { shared: ["about"], social: ["about"] },
      });
      await app.syncPages(["shared", "social"]);

      await expect(app.getPageKeys({ refresh: true })).rejects.toThrow('duplicate page route "/:lang/about"');
    });
  });

  describe("syncAssets", () => {
    const makeAppWithLibAssets = async (appName: string) => {
      const root = await makeTempRoot();
      process.env.AKAN_PUBLIC_REPO_NAME = "repo";
      process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
      process.env.AKAN_PUBLIC_ENV = "local";
      process.env.PORT_OFFSET = "0";
      await writeJson(path.join(root, "package.json"), rootPackageJson());
      await mkdir(path.join(root, "libs/shared/public"), { recursive: true });
      await writeFile(path.join(root, "libs/shared/public/logo.png"), "logo");
      await mkdir(path.join(root, "libs/shared/private"), { recursive: true });
      await writeFile(path.join(root, "libs/shared/private/rules.json"), "{}");
      await mkdir(path.join(root, "apps", appName), { recursive: true });
      await writeFile(path.join(root, "apps", appName, "akan.config.ts"), "export default {};\n");
      const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
      return { root, app: AppExecutor.from(workspace, appName), appRoot: path.join(root, "apps", appName) };
    };

    test("links lib assets into the app instead of copying them", async () => {
      const { app, appRoot } = await makeAppWithLibAssets("assets-link");
      await app.syncAssets(["shared"]);

      const publicLink = path.join(appRoot, "public/libs/shared");
      const privateLink = path.join(appRoot, "private/libs/shared");
      expect((await lstat(publicLink)).isSymbolicLink()).toBe(true);
      expect((await lstat(privateLink)).isSymbolicLink()).toBe(true);
      expect(await readFile(path.join(publicLink, "logo.png"), "utf8")).toBe("logo");
      expect(await readFile(path.join(privateLink, "rules.json"), "utf8")).toBe("{}");
      if (process.platform !== "win32") expect(path.isAbsolute(await readlink(publicLink))).toBe(false);
    });

    test("drops links for deps that no longer ship assets", async () => {
      const { app, appRoot } = await makeAppWithLibAssets("assets-drop");
      await app.syncAssets(["shared"]);
      await app.syncAssets([]);

      expect(await lstat(path.join(appRoot, "public/libs")).catch(() => null)).toBeNull();
      expect(await lstat(path.join(appRoot, "private/libs")).catch(() => null)).toBeNull();
    });

    test("removes a link whose target disappeared", async () => {
      const { root, app, appRoot } = await makeAppWithLibAssets("assets-dangling");
      await app.syncAssets(["shared"]);
      await rm(path.join(root, "libs/shared/public"), { recursive: true, force: true });

      const publicLink = path.join(appRoot, "public/libs/shared");
      await app.removeDir(publicLink);
      expect(await lstat(publicLink).catch(() => null)).toBeNull();
    });

    test("removing a linked dir with a trailing separator keeps the lib source", async () => {
      const { root, app, appRoot } = await makeAppWithLibAssets("assets-trailing");
      await app.syncAssets(["shared"]);

      const publicLink = path.join(appRoot, "public/libs/shared");
      await app.removeDir(`${publicLink}${path.sep}`);
      expect(await lstat(publicLink).catch(() => null)).toBeNull();
      expect(await readFile(path.join(root, "libs/shared/public/logo.png"), "utf8")).toBe("logo");
    });

    test("materializes linked lib assets into dist on build", async () => {
      const { root, app } = await makeAppWithLibAssets("assets-dist");
      await app.syncAssets(["shared"]);
      await app.prepareCommand("build");

      const distPublicLib = path.join(root, "dist/apps/assets-dist/public/libs/shared");
      expect((await lstat(distPublicLib)).isSymbolicLink()).toBe(false);
      expect(await readFile(path.join(distPublicLib, "logo.png"), "utf8")).toBe("logo");
      expect(await readFile(path.join(root, "dist/apps/assets-dist/private/libs/shared/rules.json"), "utf8")).toBe(
        "{}",
      );
    });
  });

  describe("devOnly routes", () => {
    const makeAppWithRoutes = async (appName: string, routes: Record<string, string>) => {
      const root = await makeTempRoot();
      process.env.AKAN_PUBLIC_REPO_NAME = "repo";
      process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
      process.env.AKAN_PUBLIC_ENV = "local";
      process.env.PORT_OFFSET = "0";
      await writeJson(path.join(root, "package.json"), rootPackageJson());
      await mkdir(path.join(root, "apps", appName, "page"), { recursive: true });
      await writeFile(path.join(root, "apps", appName, "akan.config.ts"), "export default {};\n");
      for (const [rel, source] of Object.entries(routes)) {
        const filePath = path.join(root, "apps", appName, "page", rel);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, source);
      }
      const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
      return { root, app: AppExecutor.from(workspace, appName) };
    };
    const devOnlyPage = `export const pageConfig = { devOnly: true };\n${PAGE_SOURCE}`;
    const layout = "export default function Layout({ children }) { return children; }\n";
    const devOnlyLayout = `export const pageConfig = { devOnly: true };\n${layout}`;

    test("keeps dev-only routes outside of a build", async () => {
      const { app } = await makeAppWithRoutes("devonly-start", {
        "_index.tsx": PAGE_SOURCE,
        "debug/_index.tsx": devOnlyPage,
      });

      expect(await app.getPageKeys({ refresh: true })).toEqual(["./_index.tsx", "./debug/_index.tsx"]);
    });

    test("drops a dev-only page from the build", async () => {
      const { app } = await makeAppWithRoutes("devonly-page", {
        "_index.tsx": PAGE_SOURCE,
        "debug/_index.tsx": devOnlyPage,
      });
      await app.prepareCommand("build");

      expect(await app.getPageKeys()).toEqual(["./_index.tsx"]);
    });

    test("drops a dev-only layout together with every route under it", async () => {
      const { app } = await makeAppWithRoutes("devonly-layout", {
        "_index.tsx": PAGE_SOURCE,
        "(dev)/_layout.tsx": devOnlyLayout,
        "(dev)/debug/_index.tsx": PAGE_SOURCE,
        "(dev)/debug/deep/_index.tsx": PAGE_SOURCE,
        "keep/_index.tsx": PAGE_SOURCE,
      });
      await app.prepareCommand("build");

      expect(await app.getPageKeys()).toEqual(["./_index.tsx", "./keep/_index.tsx"]);
    });

    test("treats devOnly: false as a normal route", async () => {
      const { app } = await makeAppWithRoutes("devonly-false", {
        "_index.tsx": `export const pageConfig = { devOnly: false, cache: true };\n${PAGE_SOURCE}`,
      });
      await app.prepareCommand("build");

      expect(await app.getPageKeys()).toEqual(["./_index.tsx"]);
    });

    test("rejects a devOnly value the build cannot read statically", async () => {
      const { app } = await makeAppWithRoutes("devonly-dynamic", {
        "_index.tsx": `export const pageConfig = { devOnly: process.env.NODE_ENV !== "production" };\n${PAGE_SOURCE}`,
      });

      await expect(app.getPageKeys({ refresh: true })).rejects.toThrow("devOnly must be a literal true or false");
    });

    test("reads devOnly through a satisfies annotation", async () => {
      const { app } = await makeAppWithRoutes("devonly-satisfies", {
        "_index.tsx": PAGE_SOURCE,
        "debug/_index.tsx": `export const pageConfig = { devOnly: true } satisfies { devOnly: boolean };\n${PAGE_SOURCE}`,
      });
      await app.prepareCommand("build");

      expect(await app.getPageKeys()).toEqual(["./_index.tsx"]);
    });
  });

  describe("getDevPort", () => {
    const makeWorkspaceWithApps = async (names: string[]) => {
      const root = await makeTempRoot();
      process.env.AKAN_PUBLIC_REPO_NAME = "repo";
      process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
      process.env.AKAN_PUBLIC_ENV = "local";
      process.env.PORT_OFFSET = "0";
      await writeJson(path.join(root, "package.json"), rootPackageJson());
      for (const name of names) {
        await mkdir(path.join(root, "apps", name), { recursive: true });
        await writeFile(path.join(root, "apps", name, "akan.config.ts"), "export default {};\n");
      }
      return new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    };

    test("derives the port from the app's position in the sorted apps listing", async () => {
      const workspace = await makeWorkspaceWithApps(["port-a", "port-b"]);

      expect(await AppExecutor.from(workspace, "port-a").getDevPort()).toBe(8282);
      expect(await AppExecutor.from(workspace, "port-b").getDevPort()).toBe(8283);
    });

    test("moves when another app appears before it, which is why pinning exists", async () => {
      const workspace = await makeWorkspaceWithApps(["drift-b"]);
      const app = AppExecutor.from(workspace, "drift-b");
      expect(await app.getDevPort()).toBe(8282);

      // Sorts ahead of `drift-b`, so the same app gets another port — and a dev host recomputes it on each restart.
      await mkdir(path.join(workspace.workspaceRoot, "apps/drift-a"), { recursive: true });
      await writeFile(path.join(workspace.workspaceRoot, "apps/drift-a/akan.config.ts"), "export default {};\n");

      expect(await app.getDevPort()).toBe(8283);
    });

    test("AKAN_DEV_PORT pins it, and survives an app appearing before it", async () => {
      const workspace = await makeWorkspaceWithApps(["pin-b"]);
      const app = AppExecutor.from(workspace, "pin-b");
      process.env.AKAN_DEV_PORT = "12345";

      expect(await app.getDevPort()).toBe(12345);

      await mkdir(path.join(workspace.workspaceRoot, "apps/pin-a"), { recursive: true });
      await writeFile(path.join(workspace.workspaceRoot, "apps/pin-a/akan.config.ts"), "export default {};\n");

      expect(await app.getDevPort()).toBe(12345);
    });

    test("ignores an unusable AKAN_DEV_PORT rather than binding a nonsense port", async () => {
      const workspace = await makeWorkspaceWithApps(["bad-a"]);
      const app = AppExecutor.from(workspace, "bad-a");

      for (const value of ["0", "-1", "nope", "", "70000", "8282.5"]) {
        process.env.AKAN_DEV_PORT = value;
        expect(await app.getDevPort()).toBe(8282);
      }
    });
  });

  describe("root layout source validation during page key discovery", () => {
    const makeRouteValidationApp = async (appName: string, config: string, files: Record<string, string>) => {
      const root = await makeTempRoot();
      process.env.AKAN_PUBLIC_REPO_NAME = "repo";
      process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
      process.env.AKAN_PUBLIC_ENV = "local";
      await writeJson(path.join(root, "package.json"), rootPackageJson());
      await mkdir(path.join(root, "apps", appName), { recursive: true });
      await writeFile(path.join(root, `apps/${appName}/akan.config.ts`), config);
      for (const [file, source] of Object.entries(files)) {
        const filePath = path.join(root, `apps/${appName}/page`, file);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, source);
      }
      const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
      return AppExecutor.from(workspace, appName);
    };
    const wsConnectLayout = [
      "export const wsConnect = false;",
      "export default function Layout({ children }) { return children; }",
      "",
    ].join("\n");

    test("accepts wsConnect on a configured base-path root layout", async () => {
      process.env.AKAN_PUBLIC_BASE_PATHS = "web,admin";
      const app = await makeRouteValidationApp(
        "base-path-root-ws",
        [
          "export default {",
          '  routes: [{ basePath: "web", domains: {} }, { basePath: "admin", domains: {} }],',
          "};",
          "",
        ].join("\n"),
        { "admin/_layout.tsx": wsConnectLayout },
      );

      await expect(app.getPageKeys({ refresh: true })).resolves.toEqual(["./admin/_layout.tsx"]);
    });

    test("rejects wsConnect on a nested layout", async () => {
      const app = await makeRouteValidationApp(
        "nested-layout-ws",
        'export default { routes: [{ basePath: "admin", domains: {} }] };\n',
        { "admin/users/_layout.tsx": wsConnectLayout },
      );

      await expect(app.getPageKeys({ refresh: true })).rejects.toThrow(/unsupported export "wsConnect"/);
    });

    test("accepts wsConnect on a grouped root layout", async () => {
      const app = await makeRouteValidationApp("grouped-root-ws", "export default {};\n", {
        "(docs)/_layout.tsx": wsConnectLayout,
      });

      await expect(app.getPageKeys({ refresh: true })).resolves.toEqual(["./(docs)/_layout.tsx"]);
    });
  });

  test("accepts head route exports during page key discovery", async () => {
    const root = await makeTempRoot();
    process.env.AKAN_PUBLIC_REPO_NAME = "repo";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    await writeJson(path.join(root, "package.json"), rootPackageJson());
    await mkdir(path.join(root, "apps/demo/page/docs"), { recursive: true });
    await writeFile(path.join(root, "apps/demo/akan.config.ts"), "export default {};\n");
    await writeFile(
      path.join(root, "apps/demo/page/_layout.tsx"),
      ["export const head = null;", "export default function Layout({ children }) { return children; }", ""].join("\n"),
    );
    await writeFile(
      path.join(root, "apps/demo/page/docs/_layout.tsx"),
      [
        "export async function generateHead() { return null; }",
        "export default function Layout({ children }) { return children; }",
        "",
      ].join("\n"),
    );
    await writeFile(
      path.join(root, "apps/demo/page/docs/intro.tsx"),
      ["export const head = null;", "export default function Page() { return null; }", ""].join("\n"),
    );

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const app = AppExecutor.from(workspace, "demo");

    await expect(app.getPageKeys({ refresh: true })).resolves.toEqual([
      "./_layout.tsx",
      "./docs/_layout.tsx",
      "./docs/intro.tsx",
    ]);
  });

  test("rejects a metadata route export during page key discovery", async () => {
    const root = await makeTempRoot();
    process.env.AKAN_PUBLIC_REPO_NAME = "repo";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    await writeJson(path.join(root, "package.json"), rootPackageJson());
    await mkdir(path.join(root, "apps/demo/page"), { recursive: true });
    await writeFile(path.join(root, "apps/demo/akan.config.ts"), "export default {};\n");
    await writeFile(
      path.join(root, "apps/demo/page/legacy.tsx"),
      ["export const metadata = { title: 'Legacy' };", "export default function Page() { return null; }", ""].join(
        "\n",
      ),
    );

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const app = AppExecutor.from(workspace, "demo");

    await expect(app.getPageKeys({ refresh: true })).rejects.toThrow('unsupported export "metadata"');
  });

  test("assigns start command ports from sorted app order", async () => {
    const root = await makeTempRoot();
    process.env.AKAN_PUBLIC_REPO_NAME = "repo";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";

    await writeJson(path.join(root, "package.json"), rootPackageJson());
    for (const appName of ["minimal", "akan"]) {
      await mkdir(path.join(root, `apps/${appName}`), { recursive: true });
      await writeFile(
        path.join(root, `apps/${appName}/akan.config.ts`),
        [
          "export default {",
          `  routes: [{ basePath: "${appName}", domains: { debug: ["${appName}.local:8282"] } }],`,
          "};",
          "",
        ].join("\n"),
      );
    }

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const akan = AppExecutor.from(workspace, "akan");
    const minimal = AppExecutor.from(workspace, "minimal");

    const akanStart = await akan.prepareCommand("start");
    expect(akanStart.env.PORT).toBe("8282");
    expect(akanStart.env.AKAN_PUBLIC_CLIENT_PORT).toBe("8282");
    expect(akanStart.env.AKAN_PUBLIC_SERVER_PORT).toBe("8282");

    const minimalStart = await minimal.prepareCommand("start");
    expect(minimalStart.env.PORT).toBe("8283");
    expect(minimalStart.env.AKAN_PUBLIC_CLIENT_PORT).toBe("8283");
    expect(minimalStart.env.AKAN_PUBLIC_SERVER_PORT).toBe("8283");

    process.env.PORT_OFFSET = "3";

    const offsetAkanStart = await akan.prepareCommand("start");
    expect(offsetAkanStart.env.PORT).toBe("8285");
    expect(offsetAkanStart.env.AKAN_PUBLIC_CLIENT_PORT).toBe("8285");
    expect(offsetAkanStart.env.AKAN_PUBLIC_SERVER_PORT).toBe("8285");

    const offsetMinimalStart = await minimal.prepareCommand("start");
    expect(offsetMinimalStart.env.PORT).toBe("8286");
    expect(offsetMinimalStart.env.AKAN_PUBLIC_CLIENT_PORT).toBe("8286");
    expect(offsetMinimalStart.env.AKAN_PUBLIC_SERVER_PORT).toBe("8286");
  });

  test("pins the start command to development so an ambient NODE_ENV cannot pick the production router", async () => {
    const root = await makeTempRoot();
    process.env.AKAN_PUBLIC_REPO_NAME = "repo";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    await writeJson(path.join(root, "package.json"), rootPackageJson());
    await mkdir(path.join(root, "apps/ambient"), { recursive: true });
    await writeFile(path.join(root, "apps/ambient/akan.config.ts"), "export default {};\n");

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
      const started = await AppExecutor.from(workspace, "ambient").prepareCommand("start");
      expect(started.env.NODE_ENV).toBe("development");
      // The builder runs in this process and bakes NODE_ENV into the dev bundles it emits.
      expect(process.env.NODE_ENV).toBe("development");
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });
});

describe("PkgExecutor package generation", () => {
  test("generates dist package metadata from root dependency versions", async () => {
    const root = await makeTempRoot();
    await writeJson(path.join(root, "package.json"), rootPackageJson());
    await writeJson(path.join(root, "pkgs/@sample/tool/package.json"), {
      name: "@sample/tool",
      version: "0.1.0",
      description: "tool",
      exports: { "./extra": { import: "./extra.ts" } },
      peerDependencies: { react: "19.0.0" },
      peerDependenciesMeta: { react: { optional: true } },
      optionalDependencies: { "@sample/native": "1.0.0" },
    });

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const pkg = PkgExecutor.from(workspace, "@sample/tool");
    const distPackageJson = await pkg.generateDistPackageJson(["lodash"], ["typescript"]);

    expect(distPackageJson).toMatchObject({
      name: "@sample/tool",
      type: "module",
      engines: { bun: ">=1.4.0" },
      dependencies: { lodash: "4.0.0" },
      devDependencies: { typescript: "6.0.0" },
      peerDependencies: { react: "19.0.0" },
      peerDependenciesMeta: { react: { optional: true } },
      optionalDependencies: { "@sample/native": "1.0.0" },
    });
    expect(distPackageJson.exports?.["."]).toEqual({
      import: "./index.ts",
      types: "./index.ts",
      default: "./index.ts",
    });
    expect(await Bun.file(path.join(root, "dist/pkgs/@sample/tool/package.json")).json()).toEqual(distPackageJson);
    expect(await Bun.file(path.join(root, "pkgs/@sample/tool/package.json")).json()).toEqual(distPackageJson);
  });
});

describe("scan info construction", () => {
  test("indexes database, service, and scalar file conventions from prepared scan results", () => {
    const root = "/workspace";
    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const app = AppExecutor.from(workspace, "demo");
    const config = new AkanAppConfig(
      app,
      [],
      rootPackageJson(),
      {},
      {
        repoName: "repo",
        serveDomain: "example.com",
        env: "debug",
        portOffset: 0,
        workspaceRoot: root,
      },
    );

    const info = new AppInfo(
      app,
      {
        name: "demo",
        type: "app",
        repoName: "repo",
        serveDomain: "example.com",
        akanConfig: config,
        files: {
          constant: { databases: ["post"], scalars: ["money"] },
          dictionary: { databases: ["post"], services: ["auth"], scalars: ["money"] },
          document: { databases: ["post"], scalars: ["money"] },
          service: { databases: ["post"], services: ["auth"] },
          signal: { databases: ["post"], services: ["auth"] },
          store: { databases: [], services: [] },
          template: { databases: [], services: [], scalars: [] },
          unit: { databases: [], services: [], scalars: [] },
          util: { databases: [], services: [], scalars: [] },
          view: { databases: [], services: [], scalars: [] },
          zone: { databases: [], services: [], scalars: [] },
        },
        libDeps: [],
        pkgDeps: [],
        dependencies: [],
        devDependencies: [],
        routes: ["./_index.tsx"],
      },
      [],
    );

    expect(info.getDatabaseModules()).toEqual(["post"]);
    expect(info.getServiceModules()).toEqual(["auth"]);
    expect(info.getScalarModules()).toEqual(["money"]);
    expect(info.file.constant.databases.has("post")).toBe(true);
    expect(info.file.dictionary.services.has("auth")).toBe(true);
    expect(info.file.document.scalars.has("money")).toBe(true);
  });
});

describe("WorkspaceExecutor listing", () => {
  test("lists apps, libs and pkgs in name order", async () => {
    const root = await makeTempRoot();
    for (const app of ["zeta", "alpha", "mid"]) await writeText(path.join(root, "apps", app, "akan.config.ts"), "");
    for (const lib of ["util", "shared"]) await writeText(path.join(root, "libs", lib, "akan.config.ts"), "");
    for (const pkg of ["zeta-tool", "@sample/tool", "akanjs"])
      await writeJson(path.join(root, "pkgs", pkg, "package.json"), { name: pkg });

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    expect(await workspace.getExecs()).toEqual([
      ["alpha", "mid", "zeta"],
      ["shared", "util"],
      ["@sample/tool", "akanjs", "zeta-tool"],
    ]);
  });

  test("never takes a scratch workspace under a local/ folder for a package, app or lib", async () => {
    const root = await makeTempRoot();
    await writeJson(path.join(root, "pkgs/@akanjs/devkit/package.json"), { name: "@akanjs/devkit" });
    await writeJson(path.join(root, "pkgs/@akanjs/devkit/local/akan-cli-x/package.json"), { name: "repo" });
    await writeText(path.join(root, "apps/portal/akan.config.ts"), "");
    await writeText(path.join(root, "libs/util/local/akan-cli-y/akan.config.ts"), "");

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    expect(await workspace.getExecs()).toEqual([["portal"], [], ["@akanjs/devkit"]]);
  });
});

describe("SysExecutor module listing", () => {
  test("lists only the module folders that hold the module's own file", async () => {
    const root = await makeTempRoot();
    const lib = path.join(root, "apps/modlist/lib");
    for (const file of [
      "cnst.ts",
      "post/post.constant.ts",
      "post/Post.View.tsx",
      "post/Post.Unit.tsx",
      "draft/draft.document.ts",
      "_auth/auth.service.ts",
      "_notes/notes.md",
      "__scalar/money/money.constant.ts",
      "__scalar/stale/stale.dictionary.ts",
    ])
      await writeText(path.join(lib, file), "export {};\n");

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const app = AppExecutor.from(workspace, "modlist");
    expect(await app.getDatabaseModules()).toEqual(["post"]);
    expect(await app.getServiceModules()).toEqual(["_auth"]);
    expect(await app.getScalarModules()).toEqual(["money"]);
    expect(await app.getViewComponents()).toEqual(["post"]);
    expect(await app.getUnitComponents()).toEqual(["post"]);
    expect(await app.getTemplateComponents()).toEqual([]);
    expect((await app.getViewsSourceCode()).map(({ filePath }) => filePath)).toEqual([
      "apps/modlist/lib/post/Post.View.tsx",
    ]);
    expect((await app.getScalarConstantFiles()).map(({ filePath }) => filePath)).toEqual([
      "apps/modlist/lib/__scalar/money/money.constant.ts",
    ]);
  });

  test("reads scalar dictionaries from the scalar folder", async () => {
    const root = await makeTempRoot();
    const scalarDir = path.join(root, "apps/scalardict/lib/__scalar/money");
    await writeText(path.join(scalarDir, "money.constant.ts"), "export {};\n");
    await writeText(path.join(scalarDir, "money.dictionary.ts"), "export const money = {};\n");

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const app = AppExecutor.from(workspace, "scalardict");
    expect(await app.getScalarDictionaryFiles()).toEqual([
      { filePath: "apps/scalardict/lib/__scalar/money/money.dictionary.ts", content: "export const money = {};\n" },
    ]);
  });
});

interface ScannableLibOptions {
  root?: Pick<PackageJson, "dependencies" | "devDependencies">;
  manifest?: Partial<PackageJson>;
  config?: string;
  files?: Record<string, string>;
}

//* `LibInfo.libInfos` caches a scan by lib name for the whole file, so every test passes a name of its own.
const createScannableLib = async (
  libName: string,
  { root = {}, manifest = {}, config = "export default {};\n", files = {} }: ScannableLibOptions = {},
) => {
  const temp = trackRoot(await createTempLib(libName));
  const libDir = path.join(temp.root, "libs", libName);
  await writeJson(path.join(temp.root, "package.json"), {
    name: "repo",
    version: "1.0.0",
    description: "repo",
    ...root,
  });
  await writeJson(path.join(libDir, "package.json"), {
    type: "module",
    name: `@${libName}`,
    version: "0.0.1",
    ...manifest,
  });
  await writeJson(path.join(libDir, "tsconfig.json"), { compilerOptions: { target: "ESNext", paths: {} } });
  await writeText(path.join(libDir, "akan.config.ts"), config);
  await mkdir(path.join(libDir, "lib", "__scalar"), { recursive: true });
  for (const [file, content] of Object.entries(files)) await writeText(path.join(libDir, file), content);
  return { ...temp, libDir };
};

describe("SysExecutor scan", () => {
  test("gives a facet folder with nothing to export an empty barrel, so a barrel a deleted file left heals", async () => {
    const { lib } = await createScannableLib("barrelheal", {
      files: {
        "common/index.ts": 'export * from "./commonLogic";\n',
        "webkit/thing.helper.ts": "export const thing = 1;\n",
      },
    });

    await lib.scan();

    expect(await lib.readFile("common/index.ts")).toBe("export {};\n");
    expect(await lib.readFile("webkit/index.ts")).toBe("export {};\n");
    expect(await lib.exists("ui")).toBe(false);
  });

  test("imports into the generated lib/dict.ts and lib/srv.ts only the helpers their code calls", async () => {
    const { lib: bare } = await createScannableLib("nomodulelib");
    await bare.scan();
    expect(await bare.readFile("lib/dict.ts")).toContain(
      'import { makeDictionary, makeTrans, dictionary as base } from "akanjs/dictionary";',
    );
    const bareSrv = await bare.readFile("lib/srv.ts");
    for (const unused of ["ServiceModel", '"./cnst"', '"./db"']) expect(bareSrv).not.toContain(unused);

    const { lib: full } = await createScannableLib("allmodulelib", {
      files: {
        "lib/post/post.constant.ts": "export class Post {}\n",
        "lib/post/post.service.ts": "export class PostService {}\n",
        "lib/_mail/mail.service.ts": "export class MailService {}\n",
        "lib/__scalar/money/money.constant.ts": "export class Money {}\n",
      },
    });
    await full.scan();
    expect(await full.readFile("lib/dict.ts")).toContain(
      "import { makeDictionary, makeTrans, registerScalarTrans, registerServiceTrans, registerModelTrans, dictionary as base }",
    );
    const fullSrv = await full.readFile("lib/srv.ts");
    expect(fullSrv).toContain('import { ServiceModel } from "akanjs/service";');
    expect(fullSrv).toContain('import * as cnst from "./cnst";\nimport * as db from "./db";');
  });

  test.skipIf(!hasBiome)("writes barrels, module indexes and akan.lib.json the way Biome prints them", async () => {
    const component = "export const C = () => null;\n";
    const uiFiles = ["QRCode", "Qa", "SSOButton", "Select", "Icon10", "Icon2"].map((name) => [
      `ui/${name}.tsx`,
      component,
    ]);
    const srvkitFiles = ["aB", "aa", "a10", "a9"].map((name) => [`srvkit/${name}.ts`, "export const x = 1;\n"]);
    const moduleFiles = ["Template", "Unit", "View"].map((role) => [`lib/post/Post.${role}.tsx`, component]);
    const { root, lib, libDir } = await createScannableLib("biomestable", {
      files: Object.fromEntries([
        ...uiFiles,
        ...srvkitFiles,
        ...moduleFiles,
        ["lib/post/post.constant.ts", "export class Post {}\n"],
      ]),
    });
    expect(await formatWithBiome('export * from "./b";\nexport * from "./a";\n', "libs/x/srvkit/index.ts")).toBe(
      'export * from "./a";\nexport * from "./b";\n',
    );

    await lib.scan();

    expect(await lib.readFile("ui/index.ts")).toBe(
      ["Icon2", "Icon10", "Qa", "QRCode", "Select", "SSOButton"].map((name) => `export * from "./${name}";\n`).join(""),
    );
    expect(await lib.readFile("srvkit/index.ts")).toBe(
      ["a9", "a10", "aa", "aB"].map((name) => `export * from "./${name}";\n`).join(""),
    );
    for (const file of ["ui/index.ts", "srvkit/index.ts", "lib/post/index.ts", "akan.lib.json"]) {
      const generated = await lib.readFile(file);
      expect(await formatWithBiome(generated, `libs/biomestable/${file}`)).toBe(generated);
    }
    const devSync = new DevGeneratedIndexSync({ workspaceRoot: root });
    const events = ["ui/QRCode.tsx", "srvkit/a9.ts", "lib/post"].map((file) => path.join(libDir, file));
    expect(await devSync.syncForBatch(events)).toEqual({ changedFiles: [], errors: [] });
  });

  test("refuses a hand-written ui/index.tsx beside the generated barrel, naming the file and the fix", async () => {
    const { lib } = await createScannableLib("shadowedbarrel", {
      files: {
        "ui/Chat.tsx": "export const Chat = () => null;\n",
        "ui/index.tsx": 'export { Chat } from "./Chat";\n',
        "ui/Page/index.tsx": 'export { Inner } from "./Inner";\n',
        "ui/Page/index_.tsx": '"use client";\nexport { Inner } from "./Inner";\n',
      },
    });

    const error = await lib.scan().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    const { message } = error as Error;
    expect(message).toContain("libs/shadowedbarrel/ui/index.tsx: shadows the generated ui/index.ts");
    expect(message).toContain("Delete it");
    expect(message).not.toContain("ui/Page/");
  });
});

describe("SysExecutor dependency sync", () => {
  const root: Pick<PackageJson, "dependencies" | "devDependencies"> = {
    dependencies: {
      chalk: "^5.6.2",
      esbuild: "^0.25.0",
      lodash: "^4.17.21",
      react: "19.3.0",
      "react-dom": "19.3.0",
      sharp: "^0.34.0",
      zod: "3.25.76",
    },
    devDependencies: { dayjs: "^1.11.20", "happy-dom": "20.11.2", typescript: "^6.0.3" },
  };
  const readManifest = async (libDir: string) =>
    (await Bun.file(path.join(libDir, "package.json")).json()) as PackageJson;
  const silenced = (lib: LibExecutor) => ({
    info: spyOn(lib.logger, "info").mockImplementation(() => undefined),
    warn: spyOn(lib.logger, "warn").mockImplementation(() => undefined),
  });

  test("prunes what the root declares and nothing imports, and keeps and warns once about what it does not", async () => {
    const { lib, libDir } = await createScannableLib("prunedeps", {
      root,
      manifest: {
        dependencies: { lodash: "^4.0.0", "react-dom": "19.2.6", "left-pad": "^1.3.0", "is-odd": "^3.0.1" },
        devDependencies: {},
      },
      files: { "srvkit/pad.ts": 'import padStart from "lodash/padStart";\nexport const pad = padStart;\n' },
    });
    const { info, warn } = silenced(lib);

    await lib.scan();

    expect((await readManifest(libDir)).dependencies).toEqual({
      lodash: "^4.17.21",
      "left-pad": "^1.3.0",
      "is-odd": "^3.0.1",
    });
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toContain(": react-dom (");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("libs/prunedeps/package.json lists left-pad, is-odd");
  });

  test("keeps what externalLibs, trustedDependencies or akan.keepDependencies names", async () => {
    const akan = { keepDependencies: ["chalk"] };
    const { lib, libDir } = await createScannableLib("keptdeps", {
      root,
      config: 'export default { externalLibs: ["sharp"], trustedDependencies: ["esbuild"] };\n',
      manifest: {
        dependencies: { sharp: "^0.33.0", esbuild: "^0.24.0", chalk: "^5.0.0", "react-dom": "19.2.6" },
        devDependencies: {},
        akan,
      },
    });
    silenced(lib);

    await lib.scan();

    const manifest = await readManifest(libDir);
    expect(manifest.dependencies).toEqual({ sharp: "^0.34.0", esbuild: "^0.25.0", chalk: "^5.6.2" });
    expect(manifest.akan).toEqual(akan);
  });

  test("gives every surviving entry the root version, leaving peer, optional and the akan source alone", async () => {
    const untouched = {
      peerDependencies: { react: "^19.0.0" },
      optionalDependencies: { fsevents: "^2.3.3" },
      akan: { source: { origin: "akanjs", sha: "3.0.0", hash: "0f0f", syncedAt: "2026-01-01T00:00:00.000Z" } },
    };
    const { lib, libDir } = await createScannableLib("realigneddeps", {
      root,
      manifest: {
        dependencies: { react: "19.2.7", lodash: "^4.0.0" },
        devDependencies: { dayjs: "^1.11.13" },
        ...untouched,
      },
      files: {
        "ui/Thing.tsx": 'import { useState } from "react";\nexport const Thing = () => useState(0);\n',
        "srvkit/pick.ts": 'import pick from "lodash/pick";\nexport const pickOf = pick;\n',
      },
    });
    silenced(lib);

    await lib.scan();

    const manifest = await readManifest(libDir);
    expect(manifest.dependencies).toEqual({ react: "19.3.0", lodash: "^4.17.21" });
    expect(manifest.devDependencies).toEqual({ dayjs: "^1.11.20" });
    expect(manifest).toMatchObject(untouched);
  });

  test("keeps the existing order, appends new names sorted, and a second scan rewrites nothing", async () => {
    const { lib, libDir } = await createScannableLib("ordereddeps", {
      root,
      manifest: { dependencies: { zod: "3.25.76", lodash: "^4.17.21" }, devDependencies: {} },
      files: {
        "srvkit/uses.ts": [
          'import { z } from "zod";',
          'import chunk from "lodash/chunk";',
          'import { createElement } from "react";',
          'import chalk from "chalk";',
          "export const uses = [z, chunk, createElement, chalk];",
          "",
        ].join("\n"),
      },
    });
    silenced(lib);

    await lib.scan();
    const manifestFile = path.join(libDir, "package.json");
    const [first, { mtimeMs }] = await Promise.all([readFile(manifestFile, "utf8"), stat(manifestFile)]);
    expect(Object.keys((JSON.parse(first) as PackageJson).dependencies ?? {})).toEqual([
      "zod",
      "lodash",
      "chalk",
      "react",
    ]);

    await lib.scan({ refresh: true });
    expect(await readFile(manifestFile, "utf8")).toBe(first);
    expect((await stat(manifestFile)).mtimeMs).toBe(mtimeMs);
  });

  test("moves a type-only import to devDependencies", async () => {
    const { lib, libDir } = await createScannableLib("typeonlydeps", {
      root,
      manifest: { dependencies: { zod: "3.25.76" }, devDependencies: {} },
      files: { "common/schema.ts": 'import type { ZodType } from "zod";\nexport type Schema = ZodType;\n' },
    });
    silenced(lib);

    await lib.scan();

    const manifest = await readManifest(libDir);
    expect(manifest.dependencies).toEqual({});
    expect(manifest.devDependencies).toEqual({ zod: "3.25.76" });
  });

  test("leaves a runtime import the root lists only in devDependencies in devDependencies", async () => {
    const { lib, libDir } = await createScannableLib("devonlydeps", {
      root,
      manifest: { dependencies: {}, devDependencies: { "happy-dom": "20.0.0" } },
      files: {
        "srvkit/dom.ts": 'import { Window } from "happy-dom";\nexport const createWindow = () => new Window();\n',
      },
    });
    silenced(lib);

    await lib.scan();

    const manifest = await readManifest(libDir);
    expect(manifest.dependencies).toEqual({});
    expect(manifest.devDependencies).toEqual({ "happy-dom": "20.11.2" });
  });

  test("has written the manifest by the time scan returns", async () => {
    const { lib, libDir } = await createScannableLib("settleddeps", {
      root,
      manifest: { dependencies: { "react-dom": "19.2.6" }, devDependencies: {} },
      files: { "srvkit/pick.ts": 'import pick from "lodash/pick";\nexport const pickOf = pick;\n' },
    });
    silenced(lib);

    await lib.scan({ writeLib: false });

    expect((await readManifest(libDir)).dependencies).toEqual({ lodash: "^4.17.21" });
  });
});
