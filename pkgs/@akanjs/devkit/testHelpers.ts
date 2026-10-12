import { afterEach, beforeEach } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Executors are imported on first use: they load akanjs/base, which patches the String/Boolean/Date globals.
const executors = () => import("@akanjs/devkit/executors");

export interface CallRecord {
  name: string;
  args: unknown[];
}

export const createCallRecorder = () => {
  const calls: CallRecord[] = [];
  return {
    calls,
    /** `Returns` only types the stub: it always returns `undefined`, so use it where the result is not read. */
    record<Returns = void>(name: string, ...args: unknown[]): Returns {
      calls.push({ name, args });
      return undefined as unknown as Returns;
    },
    names() {
      return calls.map((call) => call.name);
    },
  };
};

export const createFakeSpinner = (recorder = createCallRecorder()) => ({
  succeed: (message?: string) => recorder.record("spinner.succeed", message),
  fail: (message?: string) => recorder.record("spinner.fail", message),
});

export const createFakeExecutor = <Extra extends object = object>(
  name: string,
  extra: Extra = {} as Extra,
  recorder = createCallRecorder(),
) =>
  ({
    name,
    cwdPath: `/workspace/${name}`,
    workspaceRoot: "/workspace",
    spinning: (message: string) => {
      recorder.record(`${name}.spinning`, message);
      return createFakeSpinner(recorder);
    },
    spawn: async (...args: unknown[]) => {
      recorder.record(`${name}.spawn`, ...args);
      return "";
    },
    exec: async (...args: unknown[]) => {
      recorder.record(`${name}.exec`, ...args);
      return "";
    },
    scan: async (...args: unknown[]) => {
      recorder.record(`${name}.scan`, ...args);
      return { name };
    },
    scanSync: async (...args: unknown[]) => {
      recorder.record(`${name}.scanSync`, ...args);
      return { name };
    },
    //? `PkgExecutor.from(fake, name)` reads `.workspace`; without one it falls back to `fromRoot()`, which forks git.
    get workspace(): unknown {
      return this;
    },
    ...extra,
  }) as Extra & {
    name: string;
    cwdPath: string;
    workspaceRoot: string;
    spinning: (message: string) => ReturnType<typeof createFakeSpinner>;
    spawn: (...args: unknown[]) => Promise<string>;
    exec: (...args: unknown[]) => Promise<string>;
    scan: (...args: unknown[]) => Promise<{ name: string }>;
    scanSync: (...args: unknown[]) => Promise<{ name: string }>;
  };

export const makeCliTempWorkspace = async (parentDir = os.tmpdir()) => {
  await mkdir(parentDir, { recursive: true });
  const root = await mkdtemp(path.join(parentDir, "akan-cli-"));
  await writeText(path.join(root, ".gitignore"), "");
  await writeText(
    path.join(root, ".env"),
    ["AKAN_PUBLIC_REPO_NAME=repo", "AKAN_PUBLIC_SERVE_DOMAIN=localhost", "AKAN_PUBLIC_ENV=local", ""].join("\n"),
  );
  const { WorkspaceExecutor } = await executors();
  const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
  return { root, workspace };
};

// Registers the afterEach that removes the root of every value the returned tracker was handed.
export const tempRoots = (remove = (root: string) => rm(root, { recursive: true, force: true })) => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => remove(root)));
  });
  return <Temp extends { root: string }>(temp: Temp) => {
    roots.push(temp.root);
    return temp;
  };
};

// Registers the afterEach that removes every directory the returned factory created.
export const tempDirs = (prefix: string, remove?: (root: string) => Promise<void>) => {
  const track = tempRoots(remove);
  return async () => track({ root: await mkdtemp(path.join(os.tmpdir(), prefix)) }).root;
};

export const isolateEnv = (env: Record<string, string> = {}) => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...originalEnv, ...env };
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });
};

export const writeText = async (filePath: string, content: string) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
};

export const writeJson = async (filePath: string, value: object) => {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const repoRoot = path.resolve(import.meta.dir, "../../..");
const biomeBin = path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "biome.exe" : "biome");
export const hasBiome = existsSync(biomeBin);

//? Through stdin under a repo-relative name, so the repo's own Biome config and overrides judge content kept elsewhere.
export const formatWithBiome = async (content: string, repoPath: string) => {
  const proc = Bun.spawn([biomeBin, "check", "--write", `--stdin-file-path=${repoPath}`], {
    cwd: repoRoot,
    stdin: new Blob([content]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return output;
};

const tsconfigJson = { compilerOptions: { target: "ESNext", paths: {} } };

export const createTempApp = async (appName = "demo", parentDir?: string) => {
  const { root, workspace } = await makeCliTempWorkspace(parentDir);
  await writeJson(path.join(root, "package.json"), {
    name: "repo",
    version: "1.0.0",
    description: "repo",
    dependencies: {
      react: "19.0.0",
      "react-dom": "19.0.0",
      "react-server-dom-webpack": "19.0.0",
    },
  });
  await writeJson(path.join(root, "tsconfig.json"), { ...tsconfigJson, references: [] });
  await writeJson(path.join(root, "apps", appName, "tsconfig.json"), tsconfigJson);
  await writeJson(path.join(root, "apps", appName, "package.json"), {
    name: appName,
    version: "1.0.0",
    description: appName,
    dependencies: {},
    devDependencies: {},
  });
  await writeText(path.join(root, "apps", appName, "akan.config.ts"), "export default {};\n");
  await mkdir(path.join(root, "apps", appName, "lib", "__scalar"), { recursive: true });
  const app = (await executors()).AppExecutor.from(workspace, appName);
  return { root, workspace, app };
};

export const createTempLib = async (libName = "shared") => {
  const { root, workspace } = await makeCliTempWorkspace();
  await writeJson(path.join(root, "package.json"), {
    name: "repo",
    version: "1.0.0",
    description: "repo",
    dependencies: {},
    devDependencies: {},
  });
  await writeJson(path.join(root, "tsconfig.json"), { ...tsconfigJson, references: [] });
  const lib = (await executors()).LibExecutor.from(workspace, libName);
  return { root, workspace, lib };
};

export const createTempPackage = async (pkgName = "@sample/tool") => {
  const { root, workspace } = await makeCliTempWorkspace();
  await writeJson(path.join(root, "package.json"), {
    name: "repo",
    version: "1.0.0",
    description: "repo",
    dependencies: { lodash: "4.0.0" },
    devDependencies: { typescript: "6.0.0" },
  });
  await writeJson(path.join(root, "tsconfig.json"), tsconfigJson);
  await writeJson(path.join(root, "pkgs", pkgName, "package.json"), {
    name: pkgName,
    version: "0.1.0",
    description: "tool",
    exports: {},
  });
  await writeJson(path.join(root, "pkgs", pkgName, "tsconfig.json"), tsconfigJson);
  await writeText(path.join(root, "pkgs", pkgName, "index.ts"), 'import "lodash";\nexport const value = 1;\n');
  const pkg = (await executors()).PkgExecutor.from(workspace, pkgName);
  return { root, workspace, pkg };
};

export const createTempModule = async (moduleName = "post") => {
  const { root, workspace, app } = await createTempApp("demo");
  const module = (await executors()).ModuleExecutor.from(app, moduleName);
  return { root, workspace, app, module };
};
