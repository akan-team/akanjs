import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AkanAppConfig } from "./akanConfig";
import { AppExecutor, CommandExecutionError, Executor, PkgExecutor, WorkspaceExecutor } from "./executors";
import { AppInfo } from "./scanInfo";
import type { PackageJson } from "./types";

const originalEnv = { ...process.env };
const tempRoots: string[] = [];

const makeTempRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-devkit-"));
  tempRoots.push(root);
  return root;
};

const writeJson = async (filePath: string, value: object) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const PAGE_SOURCE = "export default function Page() {\n  return null;\n}\n";

const rootPackageJson = (extra: Partial<PackageJson> = {}): PackageJson => ({
  name: "fixture",
  version: "1.0.0",
  description: "fixture",
  dependencies: {
    react: "19.0.0",
    "react-dom": "19.0.0",
    "react-server-dom-webpack": "19.0.0",
    sharp: "1.0.0",
    lodash: "4.0.0",
  },
  devDependencies: {
    typescript: "6.0.0",
  },
  ...extra,
});

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Executor filesystem helpers", () => {
  test("reports command failures with command context and captured output", async () => {
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);

    let error: unknown;
    try {
      await exec.spawn(process.execPath, ["--eval", "console.error('spawn failed'); process.exit(7)"]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(CommandExecutionError);
    expect((error as CommandExecutionError).message).toContain(`Command failed: ${process.execPath}`);
    expect((error as CommandExecutionError).message).toContain(`cwd: ${root}`);
    expect((error as CommandExecutionError).message).toContain("exit code: 7");
    expect((error as CommandExecutionError).message).toContain("spawn failed");
  });

  test("reports inherited stdio command failures with a fallback message", async () => {
    const root = await makeTempRoot();
    const exec = new Executor("fixture", root);

    let error: unknown;
    try {
      await exec.spawn(process.execPath, ["--eval", "process.exit(3)"], { stdio: "inherit" });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(CommandExecutionError);
    expect((error as CommandExecutionError).message).toContain(`Command failed: ${process.execPath}`);
    expect((error as CommandExecutionError).message).toContain(`cwd: ${root}`);
    expect((error as CommandExecutionError).message).toContain("exit code: 3");
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
    expect(await readFile(path.join(root, "workspace/biome.json"), "utf8")).toContain(
      "./node_modules/@akanjs/devkit/lint/no-import-client-functions.grit",
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

    const prepared = await app.prepareCommand("build");
    expect(prepared.env.AKAN_COMMAND_TYPE).toBe("build");
    expect(prepared.env.AKAN_PUBLIC_BASE_PATHS).toBe("admin");
    expect((await stat(path.join(root, "dist/apps/demo/private"))).isDirectory()).toBe(true);
    expect((await stat(path.join(root, "dist/apps/demo/public"))).isDirectory()).toBe(true);
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
    // `AppExecutor.from` memoises by name, so each test needs a name no other test has used.
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
    // `AppExecutor.from` memoises by name, so each test needs a name no other test has used.
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

      await expect(app.getPageKeys({ refresh: true })).rejects.toThrow(
        "pageConfig.devOnly must be a literal true or false",
      );
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
      // `AppExecutor.from` memoises by name, so each test needs names no other test has used.
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

      // Sorts ahead of `drift-b`, so the same app now answers with a different port — and a dev host
      // recomputes this on every restart.
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

  test("accepts metadata route exports during page key discovery", async () => {
    const root = await makeTempRoot();
    process.env.AKAN_PUBLIC_REPO_NAME = "repo";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    await writeJson(path.join(root, "package.json"), rootPackageJson());
    await mkdir(path.join(root, "apps/demo/page/docs"), { recursive: true });
    await writeFile(path.join(root, "apps/demo/akan.config.ts"), "export default {};\n");
    await writeFile(
      path.join(root, "apps/demo/page/_layout.tsx"),
      [
        "export const head = null;",
        "export const metadata = { title: 'Root' };",
        "export default function Layout({ children }) { return children; }",
        "",
      ].join("\n"),
    );
    await writeFile(
      path.join(root, "apps/demo/page/docs/_layout.tsx"),
      [
        "export async function generateMetadata() { return { title: 'Docs' }; }",
        "export default function Layout({ children }) { return children; }",
        "",
      ].join("\n"),
    );
    await writeFile(
      path.join(root, "apps/demo/page/docs/intro.tsx"),
      ["export const metadata = { title: 'Intro' };", "export default function Page() { return null; }", ""].join("\n"),
    );

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const app = AppExecutor.from(workspace, "demo");

    await expect(app.getPageKeys({ refresh: true })).resolves.toEqual([
      "./_layout.tsx",
      "./docs/_layout.tsx",
      "./docs/intro.tsx",
    ]);
  });

  test("rejects conflicting metadata route exports during page key discovery", async () => {
    const root = await makeTempRoot();
    process.env.AKAN_PUBLIC_REPO_NAME = "repo";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    await writeJson(path.join(root, "package.json"), rootPackageJson());
    await mkdir(path.join(root, "apps/demo/page"), { recursive: true });
    await writeFile(path.join(root, "apps/demo/akan.config.ts"), "export default {};\n");
    await writeFile(
      path.join(root, "apps/demo/page/conflict.tsx"),
      [
        "export const metadata = { title: 'Conflict' };",
        "export function generateMetadata() { return { title: 'Conflict' }; }",
        "export default function Page() { return null; }",
        "",
      ].join("\n"),
    );

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const app = AppExecutor.from(workspace, "demo");

    await expect(app.getPageKeys({ refresh: true })).rejects.toThrow(
      "metadata and generateMetadata cannot both be exported",
    );
  });

  test("rejects mixed head and metadata route export channels during page key discovery", async () => {
    const root = await makeTempRoot();
    process.env.AKAN_PUBLIC_REPO_NAME = "repo";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    await writeJson(path.join(root, "package.json"), rootPackageJson());
    await mkdir(path.join(root, "apps/demo/page"), { recursive: true });
    await writeFile(path.join(root, "apps/demo/akan.config.ts"), "export default {};\n");
    await writeFile(
      path.join(root, "apps/demo/page/mixed.tsx"),
      [
        "export const head = null;",
        "export const metadata = { title: 'Mixed' };",
        "export default function Page() { return null; }",
        "",
      ].join("\n"),
    );

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const app = AppExecutor.from(workspace, "demo");

    await expect(app.getPageKeys({ refresh: true })).rejects.toThrow(
      "head/generateHead and metadata/generateMetadata cannot both be exported",
    );
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
      optionalDependencies: { sharp: "1.0.0" },
    });

    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    const pkg = PkgExecutor.from(workspace, "@sample/tool");
    const distPackageJson = await pkg.generateDistPackageJson(["lodash"], ["typescript"]);

    expect(distPackageJson).toMatchObject({
      name: "@sample/tool",
      type: "module",
      engines: { bun: ">=1.3.13" },
      dependencies: { lodash: "4.0.0" },
      devDependencies: { typescript: "6.0.0" },
      peerDependencies: { react: "19.0.0" },
      peerDependenciesMeta: { react: { optional: true } },
      optionalDependencies: { sharp: "1.0.0" },
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
