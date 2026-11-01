import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import type { PackageJson } from "../types";

export class WorkspaceVersionCheck {
  static readonly #exemptCommands = new Set(["update", "create-workspace"]);
  static readonly #infoFlags = new Set(["--help", "-h", "--version", "-V"]);
  static readonly #updateTags = new Set(["dev", "canary", "beta", "rc", "alpha"]);

  static warning(cliVersion: string | undefined, argv: string[], workspaceRoot: string) {
    const args = argv.slice(2);
    if (!cliVersion || WorkspaceVersionCheck.#exemptCommands.has(args[0] ?? "")) return null;
    if (args.some((arg) => WorkspaceVersionCheck.#infoFlags.has(arg))) return null;
    const installed = WorkspaceVersionCheck.installedAkanVersion(workspaceRoot);
    if (!installed || installed === cliVersion) return null;
    const pinnedCli = WorkspaceVersionCheck.#versionAt(path.join(workspaceRoot, "node_modules/@akanjs/cli"));
    const runner = pinnedCli === installed ? ["bunx"] : ["bunx", "-p", `@akanjs/cli@${installed}`];
    const rerun = [...runner, "akan", ...args].map(WorkspaceVersionCheck.#quote).join(" ");
    const [, prerelease = ""] = cliVersion.split("-");
    const tag = prerelease.split(".")[0];
    const update = `akan update${WorkspaceVersionCheck.#updateTags.has(tag) ? ` --tag ${tag}` : ""}`;
    const lines = [
      `This akan is @akanjs/cli ${cliVersion}, but this workspace has akanjs ${installed}: what it generates may not match the installed framework.`,
      `Run the matching CLI: ${rerun}`,
    ];
    if (Bun.semver.order(cliVersion, installed) > 0)
      lines.push(`Or move the workspace and this CLI to the newest release of the line together: ${update}`);
    else if (pinnedCli !== installed)
      lines.push(`Pin it so \`bunx akan\` runs it: bun add -d @akanjs/cli@${installed}`);
    return lines.join("\n");
  }

  static installedAkanVersion(workspaceRoot: string) {
    const packageDir = path.join(workspaceRoot, "node_modules", "akanjs");
    if (!existsSync(packageDir)) return null;
    //? A workspace link (the framework's own repo) runs akanjs from source, so no installed release can differ.
    if (!realpathSync(packageDir).split(path.sep).includes("node_modules")) return null;
    return WorkspaceVersionCheck.#versionAt(packageDir);
  }

  static #versionAt(packageDir: string) {
    const packageJsonPath = path.join(packageDir, "package.json");
    if (!existsSync(packageJsonPath)) return null;
    return (JSON.parse(readFileSync(packageJsonPath, "utf8")) as Partial<PackageJson>).version ?? null;
  }

  static #quote(arg: string) {
    if (/^[\w@%+=:,./-]+$/.test(arg)) return arg;
    //? cmd and PowerShell take neither single quotes nor '\'' as POSIX shells do.
    if (process.platform === "win32") return `"${arg.replaceAll('"', '\\"')}"`;
    return `'${arg.replaceAll("'", `'\\''`)}'`;
  }
}
