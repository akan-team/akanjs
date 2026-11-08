import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "@akanjs/devkit/commandDecorators";
import { AppExecutor } from "@akanjs/devkit/executors";
import { Logger } from "akanjs/common";

type EnvArchiveWorkspace = Pick<Workspace, "workspaceRoot" | "spawn" | "getExecs">;

export class EnvArchive {
  static readonly envFilePattern = /^env\.(client|server)\.(?!(type|example)\.ts$).+\.ts$/;

  //? The archive holds whatever the cloud or the shared server was given, so only env files and declared secrets leave it.
  static async extract(workspace: EnvArchiveWorkspace, archivePath: string) {
    const root = workspace.workspaceRoot;
    await mkdir(path.join(root, "local"), { recursive: true });
    const staging = await mkdtemp(path.join(root, "local", "env-extract-"));
    try {
      //? Relative, so GNU tar never reads a Windows drive letter (`C:\…`) as a remote `host:file` spec.
      const relativeArchive = path.relative(staging, path.resolve(root, archivePath)).split(path.sep).join("/");
      await workspace.spawn("tar", ["-xf", relativeArchive], { cwd: staging });
      const secretGlobs = await EnvArchive.#secretGlobs(workspace);
      const { files, others } = await EnvArchive.#walk(staging);
      const kept = files.filter((file) => EnvArchive.#isEnvFile(file, secretGlobs));
      const skipped = [...files.filter((file) => !kept.includes(file)), ...others];
      for (const file of kept) {
        const target = path.join(root, file);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(path.join(staging, file), target);
      }
      if (skipped.length)
        Logger.warn(`Left out of the env archive what is no env or declared secret file: ${skipped.join(", ")}`);
      return { kept, skipped };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  static #isEnvFile(file: string, secretGlobs: Map<string, Bun.Glob[]>) {
    const [scope = "", name = "", ...rest] = file.split("/");
    const [folder, fileName = ""] = rest;
    if ((scope === "apps" || scope === "libs") && rest.length === 2 && folder === "env")
      return EnvArchive.envFilePattern.test(fileName);
    return scope === "apps" && !!secretGlobs.get(name)?.some((glob) => glob.match(rest.join("/")));
  }

  static async #secretGlobs(workspace: EnvArchiveWorkspace) {
    const [appNames] = await workspace.getExecs();
    const entries = await Promise.all(
      appNames.map(async (appName) => {
        const { secrets = [] } = await AppExecutor.from(workspace as Workspace, appName).getConfig();
        return [appName, secrets.map((pattern) => new Bun.Glob(pattern))] as const;
      }),
    );
    return new Map(entries);
  }

  static async #walk(dir: string, prefix = ""): Promise<{ files: string[]; others: string[] }> {
    const files: string[] = [];
    const others: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const nested = await EnvArchive.#walk(path.join(dir, entry.name), relative);
        files.push(...nested.files);
        others.push(...nested.others);
      } else if (entry.isFile()) files.push(relative);
      else others.push(relative);
    }
    return { files, others };
  }
}
