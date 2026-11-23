import { readFileSync } from "node:fs";
import path from "node:path";
import type { Workspace } from "@akanjs/devkit/commandDecorators";
import { devInstallCommand } from "@akanjs/devkit/util/devInstallCommand";

export type AkanCodeModule = typeof import("@akanjs/code/host");

export interface CodePackageFound {
  from: string;
  dir: string;
  version: string;
}

export interface CodePackageLoadOptions {
  version: string;
  ask: boolean;
  searchDirs?: string[];
}

const resolveFrom = (specifier: string, dir: string) => {
  try {
    return Bun.resolveSync(specifier, dir);
  } catch {
    return null;
  }
};

//? A workspace that never runs `akan code` must not install its LLM SDKs, so the CLI finds the engine at run time.
export class CodePackage {
  static readonly packageName = "@akanjs/code";

  static find(searchDirs: string[]): CodePackageFound | null {
    for (const from of searchDirs) {
      const manifest = resolveFrom(`${CodePackage.packageName}/package.json`, from);
      if (!manifest) continue;
      const { version = "" } = JSON.parse(readFileSync(manifest, "utf8")) as { version?: string };
      return { from, dir: path.dirname(manifest), version };
    }
    return null;
  }

  static problem(found: CodePackageFound | null, version: string) {
    return found
      ? `akan code needs ${CodePackage.packageName} ${version}, the version of this akan, but ${found.dir} is ${found.version}.`
      : `akan code runs the coding agent from ${CodePackage.packageName}, which this workspace does not have.`;
  }

  //? A global akan resolves packages from its own install, so the workspace is searched before it.
  static async load(
    workspace: Pick<Workspace, "workspaceRoot" | "spawn">,
    { version, ask, searchDirs }: CodePackageLoadOptions,
  ): Promise<AkanCodeModule> {
    const root = workspace.workspaceRoot;
    let found = CodePackage.find(searchDirs ?? [root, import.meta.dir]);
    if (found?.version !== version) {
      const [command, ...args] = devInstallCommand(root, `${CodePackage.packageName}@${version}`);
      const install = [command, ...args].join(" ");
      const problem = CodePackage.problem(found, version);
      if (!ask || !(await CodePackage.#confirm(`${problem} Install it now with \`${install}\`?`)))
        throw new Error(`${problem} Run \`${install}\` in ${root}, then run akan code again.`);
      await workspace.spawn(command, args, { stdio: "inherit" });
      found = CodePackage.find([root]);
      if (found?.version !== version)
        throw new Error(`${CodePackage.problem(found, version)} \`${install}\` did not fix it.`);
    }
    return (await import(Bun.resolveSync(`${CodePackage.packageName}/host`, found.from))) as AkanCodeModule;
  }

  static async #confirm(message: string) {
    const { confirm } = await import("@inquirer/prompts");
    return await confirm({ message, default: true });
  }
}
