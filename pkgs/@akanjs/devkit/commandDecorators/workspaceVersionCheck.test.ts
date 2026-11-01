import { describe, expect, test } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeJson } from "../testHelpers";
import { WorkspaceVersionCheck } from "./workspaceVersionCheck";

const makeRoot = tempDirs("akan-version-check-");
const argv = (...args: string[]) => ["bun", "akan", ...args];

const makeWorkspace = async ({ akanjs, cli }: { akanjs?: string; cli?: string }) => {
  const root = await makeRoot();
  if (akanjs) await writeJson(path.join(root, "node_modules/akanjs/package.json"), { name: "akanjs", version: akanjs });
  if (cli)
    await writeJson(path.join(root, "node_modules/@akanjs/cli/package.json"), { name: "@akanjs/cli", version: cli });
  return root;
};

describe("WorkspaceVersionCheck", () => {
  test("stays quiet when the CLI and the workspace's akanjs match, or when akanjs is not installed", async () => {
    expect(
      WorkspaceVersionCheck.warning("3.1.1-rc.5", argv("sync", "demo"), await makeWorkspace({ akanjs: "3.1.1-rc.5" })),
    ).toBeNull();
    expect(WorkspaceVersionCheck.warning("3.1.1-rc.5", argv("sync", "demo"), await makeWorkspace({}))).toBeNull();
  });

  test("names both versions and the matching CLI with the same arguments, quoted for the shell it runs in", async () => {
    const root = await makeWorkspace({ akanjs: "3.1.0-rc.6" });
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    const warningOn = (os: NodeJS.Platform) => {
      Object.defineProperty(process, "platform", { value: os });
      return WorkspaceVersionCheck.warning("3.1.0", argv("sync", "demo", "--title", "it's"), root);
    };
    try {
      const posix = warningOn("linux");
      expect(posix).toContain("@akanjs/cli 3.1.0, but this workspace has akanjs 3.1.0-rc.6");
      expect(posix).toContain(`Run the matching CLI: bunx -p @akanjs/cli@3.1.0-rc.6 akan sync demo --title 'it'\\''s'`);
      expect(posix).toEndWith("together: akan update");
      expect(warningOn("win32")).toContain(
        `Run the matching CLI: bunx -p @akanjs/cli@3.1.0-rc.6 akan sync demo --title "it's"`,
      );
    } finally {
      if (platform) Object.defineProperty(process, "platform", platform);
    }
  });

  test("offers akan update with the CLI's prerelease tag only when the CLI is the newer one", async () => {
    const older = await makeWorkspace({ akanjs: "3.1.1-rc.4" });
    expect(WorkspaceVersionCheck.warning("3.1.1-rc.5", argv("build", "demo"), older)).toEndWith("akan update --tag rc");

    const newer = await makeWorkspace({ akanjs: "3.1.1-rc.5" });
    const warning = WorkspaceVersionCheck.warning("3.1.0", argv("build", "demo"), newer);
    expect(warning).not.toContain("akan update");
    expect(warning).toEndWith("Pin it so `bunx akan` runs it: bun add -d @akanjs/cli@3.1.1-rc.5");
  });

  test("points at the workspace's own pinned CLI when it matches akanjs", async () => {
    const root = await makeWorkspace({ akanjs: "3.1.1-rc.5", cli: "3.1.1-rc.5" });

    const warning = WorkspaceVersionCheck.warning("3.1.0", argv("start", "demo"), root);

    expect(warning).toContain("Run the matching CLI: bunx akan start demo");
    expect(warning).not.toContain("bun add -d");
  });

  test("leaves update, create-workspace, help and version alone", async () => {
    const root = await makeWorkspace({ akanjs: "3.1.0-rc.6" });
    for (const args of [["update"], ["create-workspace", "next"], ["--version"], ["-V"], ["sync", "--help"]])
      expect(WorkspaceVersionCheck.warning("3.1.0", argv(...args), root)).toBeNull();
  });

  test("skips a workspace that links akanjs from its own source", async () => {
    const root = await makeWorkspace({});
    await writeJson(path.join(root, "pkgs/akanjs/package.json"), { name: "akanjs", version: "3.1.1-rc.4" });
    await mkdir(path.join(root, "node_modules"), { recursive: true });
    await symlink(path.join(root, "pkgs/akanjs"), path.join(root, "node_modules/akanjs"), "dir");

    expect(WorkspaceVersionCheck.installedAkanVersion(root)).toBeNull();
    expect(WorkspaceVersionCheck.warning("3.1.0", argv("sync", "demo"), root)).toBeNull();
  });
});
