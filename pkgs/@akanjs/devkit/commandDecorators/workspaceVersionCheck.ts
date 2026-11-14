import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import type { PackageJson } from "../workspace/types";
import type { TargetOption } from "./targetMeta";

interface Mismatch {
  args: string[];
  cliVersion: string;
  installed: string;
  pinnedCli: string | null;
  rerun: string;
  update: string;
}

export class WorkspaceVersionCheck {
  static readonly overrideEnv = "AKAN_ALLOW_VERSION_MISMATCH";
  static readonly #exemptCommands = new Set(["update", "create-workspace"]);
  static readonly #infoFlags = new Set(["--help", "-h", "--version", "-V"]);
  static readonly #updateTags = new Set(["dev", "canary", "beta", "rc", "alpha"]);

  static warning(cliVersion: string | undefined, argv: string[], workspaceRoot: string) {
    const mismatch = WorkspaceVersionCheck.#mismatchOf(cliVersion, argv, workspaceRoot);
    if (!mismatch) return null;
    const { cliVersion: cli, installed, pinnedCli, rerun, update } = mismatch;
    const lines = [
      `This akan is @akanjs/cli ${cli}, but this workspace has akanjs ${installed}: what it generates may not match the installed framework.`,
      `Run the matching CLI: ${rerun}`,
    ];
    if (Bun.semver.order(cli, installed) > 0)
      lines.push(`Or move the workspace and this CLI to the newest release of the line together: ${update}`);
    else if (pinnedCli !== installed)
      lines.push(`Pin it so \`bunx akan\` runs it: bun add -d @akanjs/cli@${installed}`);
    return lines.join("\n");
  }

  static refusal(
    cliVersion: string | undefined,
    argv: string[],
    workspaceRoot: string,
    env: { [name: string]: string | undefined } = process.env,
  ) {
    const mismatch = WorkspaceVersionCheck.#mismatchOf(cliVersion, argv, workspaceRoot);
    if (!mismatch || ["1", "true"].includes(env[WorkspaceVersionCheck.overrideEnv] ?? "")) return null;
    const { args, cliVersion: cli, installed, rerun, update } = mismatch;
    if (WorkspaceVersionCheck.#lineOf(cli) === WorkspaceVersionCheck.#lineOf(installed)) return null;
    //? An older CLI is not told `akan update`: it resolves the tag this CLI came from and could move akanjs back.
    const realign =
      Bun.semver.order(cli, installed) > 0
        ? `Move the workspace and this CLI to one release together: ${update}`
        : `Install the CLI this workspace was moved to: bun add -g @akanjs/cli@${installed}`;
    return [
      `This akan is @akanjs/cli ${cli}, but this workspace has akanjs ${installed}, another major.minor, so \`akan ${args[0]}\` is refused: it writes to the workspace, and what it writes would not match the installed framework.`,
      realign,
      `Or run the matching CLI once: ${rerun}`,
      `Or set ${WorkspaceVersionCheck.overrideEnv}=1 to run it anyway.`,
    ].join("\n");
  }

  static readsOnly(targetOption: TargetOption, values: { [name: string]: unknown }) {
    const { readOnly = false } = targetOption;
    return typeof readOnly === "function" ? readOnly(values) : readOnly;
  }

  static installedAkanVersion(workspaceRoot: string) {
    const packageDir = path.join(workspaceRoot, "node_modules", "akanjs");
    if (!existsSync(packageDir)) return null;
    //? A workspace link (the framework's own repo) runs akanjs from source, so no installed release can differ.
    if (!realpathSync(packageDir).split(path.sep).includes("node_modules")) return null;
    return WorkspaceVersionCheck.#versionAt(packageDir);
  }

  static #mismatchOf(cliVersion: string | undefined, argv: string[], workspaceRoot: string): Mismatch | null {
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
    return { args, cliVersion, installed, pinnedCli, rerun, update };
  }

  static #lineOf(version: string) {
    return version.split("-")[0]?.split(".").slice(0, 2).join(".");
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
