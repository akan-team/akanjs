import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppExecutor, LibExecutor, ModuleExecutor, PkgExecutor, WorkspaceExecutor } from "@akanjs/devkit/executors";
export interface CallRecord {
  name: string;
  args: unknown[];
}

export const createCallRecorder = () => {
  const calls: CallRecord[] = [];
  return {
    calls,
    record(name: string, ...args: unknown[]) {
      calls.push({ name, args });
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

export const makeCliTempWorkspace = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-cli-"));
  await mkdir(root, { recursive: true });
  await writeText(path.join(root, ".gitignore"), "");
  const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
  return { root, workspace };
};

export const cleanupCliTempWorkspace = async (root: string) => {
  await rm(root, { recursive: true, force: true });
};

export const writeText = async (filePath: string, content: string) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
};

export const writeJson = async (filePath: string, value: object) => {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

export const createTempApp = async (appName = "demo") => {
  const { root, workspace } = await makeCliTempWorkspace();
  await writeJson(path.join(root, "package.json"), {
    name: "repo",
    version: "1.0.0",
    description: "repo",
    dependencies: {
      react: "19.0.0",
      "react-dom": "19.0.0",
      "react-server-dom-webpack": "19.0.0",
      sharp: "1.0.0",
    },
  });
  await writeJson(path.join(root, "tsconfig.json"), {
    compilerOptions: { target: "ESNext", paths: {} },
    references: [],
  });
  await writeJson(path.join(root, "apps", appName, "tsconfig.json"), {
    compilerOptions: { target: "ESNext", paths: {} },
  });
  await writeJson(path.join(root, "apps", appName, "package.json"), {
    name: appName,
    version: "1.0.0",
    description: appName,
    dependencies: {},
    devDependencies: {},
  });
  await writeText(path.join(root, "apps", appName, "akan.config.ts"), "export default {};\n");
  await mkdir(path.join(root, "apps", appName, "lib", "__scalar"), { recursive: true });
  const app = AppExecutor.from(workspace, appName);
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
  await writeJson(path.join(root, "tsconfig.json"), {
    compilerOptions: { target: "ESNext", paths: {} },
    references: [],
  });
  const lib = LibExecutor.from(workspace, libName);
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
  await writeJson(path.join(root, "tsconfig.json"), {
    compilerOptions: { target: "ESNext", paths: {} },
  });
  await writeJson(path.join(root, "pkgs", pkgName, "package.json"), {
    name: pkgName,
    version: "0.1.0",
    description: "tool",
    exports: {},
  });
  await writeJson(path.join(root, "pkgs", pkgName, "tsconfig.json"), {
    compilerOptions: { target: "ESNext", paths: {} },
  });
  await writeText(path.join(root, "pkgs", pkgName, "index.ts"), 'import "lodash";\nexport const value = 1;\n');
  const pkg = PkgExecutor.from(workspace, pkgName);
  return { root, workspace, pkg };
};

export const createTempModule = async (moduleName = "post") => {
  const { root, workspace, app } = await createTempApp("demo");
  const module = ModuleExecutor.from(app, moduleName);
  return { root, workspace, app, module };
};
