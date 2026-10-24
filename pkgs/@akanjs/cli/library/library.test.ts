import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { CommandContainer, type Workspace } from "@akanjs/devkit/commandDecorators";
import { CommandExecutionError } from "@akanjs/devkit/executors";
import { LibSource } from "@akanjs/devkit/libSource";
import {
  createCallRecorder,
  createFakeExecutor,
  createTempLib,
  tempRoots,
  writeJson,
} from "@akanjs/devkit/testHelpers";
import type { PackageJson } from "@akanjs/devkit/types";
import { LibraryRunner } from "./library.runner";
import { LibraryScript } from "./library.script";

afterEach(() => {
  CommandContainer.clear();
  mock.restore();
});
const track = tempRoots();
const repoRoot = path.resolve(import.meta.dir, "../../../..");

describe("LibraryScript", () => {
  test("syncs and installs libraries through runner boundaries", async () => {
    const script = CommandContainer.get(LibraryScript);
    const recorder = createCallRecorder();
    const lib = createFakeExecutor("shared", {}, recorder);
    const workspace = createFakeExecutor("workspace", {}, recorder);
    script.libraryRunner.createLibrary = async (...args) => {
      recorder.record("createLibrary", ...args);
      return lib as never;
    };
    script.libraryRunner.installLibrary = async (...args) => {
      recorder.record("installLibrary", ...args);
      return lib as never;
    };
    script.libraryRunner.mergeLibraryDependencies = async (...args) =>
      recorder.record("mergeLibraryDependencies", ...args);

    await script.createLibrary("shared", workspace as never);
    await script.installLibrary(workspace as never, "shared");

    expect(recorder.names()).toContain("createLibrary");
    expect(recorder.names()).toContain("shared.scan");
    expect(recorder.names()).toContain("installLibrary");
    expect(recorder.names()).toContain("mergeLibraryDependencies");
  });
});

describe("LibraryRunner", () => {
  const mergeFixture = async (libName: string, { changed }: { changed: boolean }) => {
    const { root, workspace, lib } = track(await createTempLib(libName));
    await writeJson(`${root}/package.json`, {
      name: "repo",
      version: "1.0.0",
      description: "repo",
      dependencies: { lodash: "4.17.0", "react-spring": "^9.7.5" },
      devDependencies: { typescript: "5.0.0" },
    });
    workspace.spawn = mock(async () => "") as never;
    workspace.hasChanges = mock(async () => changed) as never;
    workspace.commit = mock(async () => undefined) as never;
    const warn = spyOn(lib.logger, "warn").mockImplementation(() => undefined);
    const readRoot = async () => (await Bun.file(`${root}/package.json`).json()) as PackageJson;
    const writeLibManifest = (deps: Pick<PackageJson, "dependencies" | "devDependencies">) =>
      writeJson(`${root}/libs/${libName}/package.json`, {
        name: libName,
        version: "1.0.0",
        description: libName,
        ...deps,
      });
    return { root, workspace, lib, warn, readRoot, writeLibManifest };
  };

  test("adds what the root lacks into the matching map, and keeps the root's versions and maps", async () => {
    const { workspace, lib, warn, readRoot, writeLibManifest } = await mergeFixture("merged", { changed: true });
    await writeLibManifest({
      dependencies: { "react-spring": "^10.0.4", typescript: "5.5.0", swiper: "^12.1.4" },
      devDependencies: { lodash: "4.17.0", vite: "5.0.0" },
    });

    await new LibraryRunner().mergeLibraryDependencies(lib);

    const merged = await readRoot();
    expect(merged.dependencies).toEqual({ lodash: "4.17.0", "react-spring": "^9.7.5", swiper: "^12.1.4" });
    expect(merged.devDependencies).toEqual({ typescript: "5.0.0", vite: "5.0.0" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("react-spring ^9.7.5 (lib: ^10.0.4), typescript 5.0.0 (lib: 5.5.0)");
    expect(workspace.spawn).toHaveBeenCalledWith("bun", ["install"]);
    expect(workspace.commit).toHaveBeenCalledWith("Merge merged library dependencies");
  });

  test("leaves a root that already has every package alone and commits nothing", async () => {
    const { root, workspace, lib, warn, writeLibManifest } = await mergeFixture("unmerged", { changed: false });
    await writeLibManifest({ dependencies: { lodash: "4.17.0" }, devDependencies: { typescript: "5.0.0" } });
    const before = await Bun.file(`${root}/package.json`).text();

    await new LibraryRunner().mergeLibraryDependencies(lib);

    expect(await Bun.file(`${root}/package.json`).text()).toBe(before);
    expect(warn).not.toHaveBeenCalled();
    expect(workspace.spawn).not.toHaveBeenCalled();
    expect(workspace.commit).not.toHaveBeenCalled();
  });

  test("brings the type packages the shipped shared and util libraries compile against into the root", async () => {
    const repoPackageJson = (await Bun.file(path.join(repoRoot, "package.json")).json()) as PackageJson;
    for (const [libName, typesPackage] of [
      ["shared", "@types/react-dom"],
      ["util", "@types/nodemailer"],
    ] as const) {
      const { root, lib, readRoot } = await mergeFixture(libName, { changed: true });
      await Bun.write(
        `${root}/libs/${libName}/package.json`,
        Bun.file(path.join(repoRoot, "libs", libName, "package.json")),
      );

      await new LibraryRunner().mergeLibraryDependencies(lib);

      expect([libName, (await readRoot()).devDependencies?.[typesPackage]]).toEqual([
        libName,
        repoPackageJson.devDependencies?.[typesPackage] ?? `${typesPackage} missing from the repo root`,
      ]);
    }
  });

  test("a new library holds an empty barrel in each facet folder, the one sync writes, and no placeholder", async () => {
    const { root, workspace } = track(await createTempLib("fresh"));
    const libDir = `${root}/libs/fresh`;
    const facetFiles = () =>
      [...new Bun.Glob("{common,srvkit,ui,webkit}/**").scanSync({ cwd: libDir })]
        .map((file) => file.replaceAll("\\", "/"))
        .sort((a, b) => a.localeCompare(b));
    const barrels = ["common/index.ts", "srvkit/index.ts", "ui/index.ts", "webkit/index.ts"];

    const lib = await new LibraryRunner().createLibrary("fresh", workspace);
    expect(facetFiles()).toEqual(barrels);
    for (const barrel of barrels) expect(await Bun.file(`${libDir}/${barrel}`).text()).toBe("export {};\n");

    await lib.scan();
    expect(facetFiles()).toEqual(barrels);
    for (const barrel of barrels) expect(await Bun.file(`${libDir}/${barrel}`).text()).toBe("export {};\n");
  });

  // `git ls-remote` and `git clone` would reach GitHub, so they answer from here; every other command runs.
  const stubRemoteGit = (root: string, workspace: Workspace, lsRemote: (args: string[]) => Promise<string>) => {
    const spawn = workspace.spawn.bind(workspace);
    const clones: string[][] = [];
    spyOn(workspace, "spawn").mockImplementation(async (command, args = [], options) => {
      if (command !== "git") return await spawn(command, args, options);
      if (args[0] === "ls-remote") return await lsRemote(args);
      if (args[0] === "clone") {
        clones.push(args);
        for (const libName of ["util", "shared"]) {
          await Bun.write(`${root}/${args.at(-1)}/libs/${libName}/package.json`, `{ "name": "@${libName}" }\n`);
          await Bun.write(`${root}/${args.at(-1)}/libs/${libName}/env/env.server.example.ts`, "export default {};\n");
        }
        return "";
      }
      if (args.includes("rev-parse")) return "0123456789abcdef0123456789abcdef01234567\n";
      return await spawn(command, args, options);
    });
    workspace.exec = mock(async () => "") as never;
    return clones;
  };

  // `installLibrary` commits and hashes the copy via `git ls-files`, so the fixture is a real repo, `commit` mocked.
  const createInstallableLib = async (libName: string) => {
    const { root, workspace } = track(await createTempLib(libName));
    await mkdir(`${root}/node_modules/akanjs/libs/${libName}/env`, { recursive: true });
    await Bun.write(`${root}/node_modules/akanjs/libs/${libName}/package.json`, `{ "name": "@${libName}" }\n`);
    await Bun.write(`${root}/node_modules/akanjs/package.json`, '{ "version": "3.0.0" }\n');
    await Bun.write(`${root}/node_modules/akanjs/libs/${libName}/env/env.server.example.ts`, "export default {};\n");
    await Bun.write(`${root}/.gitignore`, "node_modules\n");
    await workspace.spawn("git", ["init", "--quiet"]);
    const clones = stubRemoteGit(root, workspace, async () => "");
    workspace.commit = mock(async () => undefined) as never;
    return { root, workspace, clones };
  };

  test("installs a library from the local akanjs package before falling back to git", async () => {
    const { root, workspace, clones } = await createInstallableLib("shared");

    await new LibraryRunner().installLibrary(workspace, "shared");

    expect(await Bun.file(path.join(root, "libs/shared/package.json")).exists()).toBe(true);
    expect(await Bun.file(path.join(root, "libs/shared/env/env.server.testing.ts")).exists()).toBe(true);
    expect(clones).toEqual([]);
    expect(workspace.commit).toHaveBeenCalledWith("Install shared library from akanjs");
  });

  test("stamps the installed source and stays re-runnable", async () => {
    const { root, workspace } = await createInstallableLib("stamped");
    const testingEnv = path.join(root, "libs/stamped/env/env.server.testing.ts");
    const runner = new LibraryRunner();

    const lib = await runner.installLibrary(workspace, "stamped");
    const stamp = await new LibSource(lib).read();
    expect(stamp?.origin).toBe("akanjs");
    expect(stamp?.sha).toBe("3.0.0");
    expect((await new LibSource(lib).status()).drift).toBe("clean");

    await Bun.write(testingEnv, "export default { key: 1 };\n");
    await runner.installLibrary(workspace, "stamped");

    expect(await Bun.file(testingEnv).text()).toBe("export default { key: 1 };\n");
    expect((await new LibSource(lib).status()).drift).toBe("clean");
  });

  const createRepositoryInstall = async (version: string | null, lsRemote: (args: string[]) => Promise<string>) => {
    const { root, workspace } = track(await createTempLib("util"));
    if (version) await Bun.write(`${root}/node_modules/akanjs/package.json`, JSON.stringify({ version }));
    await Bun.write(`${root}/.gitignore`, "node_modules\n");
    await workspace.spawn("git", ["init", "--quiet"]);
    const clones = stubRemoteGit(root, workspace, lsRemote);
    workspace.commit = mock(async () => undefined) as never;
    const warn = spyOn(workspace.logger, "warn").mockImplementation(() => undefined);
    return { workspace, clones, warn };
  };
  const failWith = (code: number) => async (args: string[]) => {
    throw new CommandExecutionError({ command: "git", args, cwd: ".", code, signal: null });
  };
  const repository = LibraryRunner.libraryRepository;

  test("installs every library of a run from one shallow clone of the installed akanjs version's tag", async () => {
    const { workspace, clones, warn } = await createRepositoryInstall("3.1.0", async () => "");
    const runner = new LibraryRunner();

    const libs = [await runner.installLibrary(workspace, "util"), await runner.installLibrary(workspace, "shared")];

    expect(clones).toEqual([["clone", "--depth", "1", "--branch", "v3.1.0", repository, "node_modules/.akan/akanjs"]]);
    for (const lib of libs)
      expect(await new LibSource(lib).read()).toMatchObject({ origin: repository, sha: "0123456789ab" });
    expect(workspace.exec).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  test("falls back to the default branch with a warning when the installed version has no tag", async () => {
    const { workspace, clones, warn } = await createRepositoryInstall("3.1.0-rc.20", failWith(2));

    const lib = await new LibraryRunner().installLibrary(workspace, "util");

    expect(clones).toEqual([["clone", "--depth", "1", repository, "node_modules/.akan/akanjs"]]);
    expect(await new LibSource(lib).read()).toMatchObject({ origin: repository, sha: "0123456789ab" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("akanjs 3.1.0-rc.20");
  });

  test("falls back to the default branch with a warning when akanjs is not installed", async () => {
    const { workspace, clones, warn } = await createRepositoryInstall(null, failWith(2));

    await new LibraryRunner().installLibrary(workspace, "util");

    expect(clones).toEqual([["clone", "--depth", "1", repository, "node_modules/.akan/akanjs"]]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("akanjs is not installed");
  });

  test("stops when the repository is unreachable instead of installing its default branch", async () => {
    const { workspace, clones } = await createRepositoryInstall("3.1.0", failWith(128));

    await expect(new LibraryRunner().installLibrary(workspace, "util")).rejects.toThrow(CommandExecutionError);
    expect(clones).toEqual([]);
  });
});
