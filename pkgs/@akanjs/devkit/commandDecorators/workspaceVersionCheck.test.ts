import { describe, expect, test } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeJson } from "../test/testHelpers";
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

  describe("refusal", () => {
    test("refuses another major.minor, naming both versions, akan update and the variable that overrides it", async () => {
      const root = await makeWorkspace({ akanjs: "3.1.4" });

      const refusal = WorkspaceVersionCheck.refusal("3.2.0", argv("sync", "demo"), root, {});

      expect(refusal).toContain("@akanjs/cli 3.2.0, but this workspace has akanjs 3.1.4, another major.minor");
      expect(refusal).toContain("`akan sync` is refused");
      expect(refusal).toContain("Move the workspace and this CLI to one release together: akan update\n");
      expect(refusal).toContain("Or run the matching CLI once: bunx -p @akanjs/cli@3.1.4 akan sync demo");
      expect(refusal).toEndWith("Or set AKAN_ALLOW_VERSION_MISMATCH=1 to run it anyway.");
      expect(WorkspaceVersionCheck.refusal("4.0.0-rc.1", argv("sync"), root, {})).toContain("akan update --tag rc");
    });

    test("tells a CLI older than the workspace to install the matching one, not to run akan update", async () => {
      const refusal = WorkspaceVersionCheck.refusal(
        "3.1.4",
        argv("sync", "demo"),
        await makeWorkspace({ akanjs: "3.2.0" }),
        {},
      );

      expect(refusal).toContain("Install the CLI this workspace was moved to: bun add -g @akanjs/cli@3.2.0");
      expect(refusal).not.toContain("akan update");
    });

    test("passes the same major.minor, prereleases of it included, leaving the warning", async () => {
      for (const [cli, akanjs] of [
        ["3.2.0-rc.5", "3.2.0-rc.3"],
        ["3.2.1", "3.2.0"],
        ["3.2.0", "3.2.0-rc.9"],
      ] as const) {
        const root = await makeWorkspace({ akanjs });
        expect(WorkspaceVersionCheck.refusal(cli, argv("sync"), root, {})).toBeNull();
        expect(WorkspaceVersionCheck.warning(cli, argv("sync"), root)).toContain(`akanjs ${akanjs}`);
      }
    });

    test("never refuses update, create-workspace, help or version, nor with the override set", async () => {
      const root = await makeWorkspace({ akanjs: "3.1.4" });
      for (const args of [["update"], ["create-workspace", "next"], ["--version"], ["sync", "--help"]])
        expect(WorkspaceVersionCheck.refusal("3.2.0", argv(...args), root, {})).toBeNull();
      for (const value of ["1", "true"])
        expect(
          WorkspaceVersionCheck.refusal("3.2.0", argv("sync"), root, { AKAN_ALLOW_VERSION_MISMATCH: value }),
        ).toBeNull();
      expect(
        WorkspaceVersionCheck.refusal("3.2.0", argv("sync"), root, { AKAN_ALLOW_VERSION_MISMATCH: "0" }),
      ).not.toBeNull();
    });

    test("never refuses a workspace that links akanjs from its own source", async () => {
      const root = await makeWorkspace({});
      await writeJson(path.join(root, "pkgs/akanjs/package.json"), { name: "akanjs", version: "2.0.0" });
      await mkdir(path.join(root, "node_modules"), { recursive: true });
      await symlink(path.join(root, "pkgs/akanjs"), path.join(root, "node_modules/akanjs"), "dir");

      expect(WorkspaceVersionCheck.refusal("3.2.0", argv("sync", "demo"), root, {})).toBeNull();
    });

    test("counts a command as writing unless it is marked read-only, for the values it was given", () => {
      expect(WorkspaceVersionCheck.readsOnly({ type: "public" }, {})).toBe(false);
      expect(WorkspaceVersionCheck.readsOnly({ type: "public", readOnly: true }, {})).toBe(true);
      const lint = { type: "public", readOnly: ({ fix }: { [name: string]: unknown }) => fix === false } as const;
      expect(WorkspaceVersionCheck.readsOnly(lint, { fix: true })).toBe(false);
      expect(WorkspaceVersionCheck.readsOnly(lint, { fix: false })).toBe(true);
    });
  });
});
