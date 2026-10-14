import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GlobalConfig } from "../cloud/globalConfig";
import { WorkspaceExecutor } from "../executors";
import { AkanWorkspaceConfig } from "./akanWorkspaceConfig";

const withWorkspace = async (files: Record<string, string>, run: (workspace: WorkspaceExecutor) => Promise<void>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "akan-workspace-config-"));
  try {
    for (const [relative, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      fs.writeFileSync(path.join(root, relative), content);
    }
    await run(WorkspaceExecutor.fromRoot({ workspaceRoot: root, repoName: "repo" }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

describe("AkanWorkspaceConfig", () => {
  test("a workspace without a root akan.config.ts has an empty one", async () => {
    await withWorkspace({}, async (workspace) => {
      const config = await AkanWorkspaceConfig.from(workspace);
      expect(config.file).toBeNull();
      expect(config.subspace).toBeNull();
      expect(config.pipeline).toBeNull();
    });
  });

  test("reads subspace and pipeline, and the root file is never taken for an app", async () => {
    await withWorkspace(
      {
        "akan.config.ts":
          'export default { subspace: { subspaces: [{ name: "a", repo: "a.git", apps: ["web"] }] }, pipeline: { before: [] } };\n',
        "apps/web/akan.config.ts": "export default {};\n",
      },
      async (workspace) => {
        const config = await workspace.getConfig();
        expect(config.file).toBe(path.join(workspace.workspaceRoot, "akan.config.ts"));
        expect(config.subspace?.subspaces.map((subspace) => subspace.name)).toEqual(["a"]);
        expect(config.pipeline).toEqual({ before: [] });
        expect(await workspace.getApps()).toEqual(["web"]);
      },
    );
  });

  test("cloud.host names the cloud the CLI talks to without --host, https unless it is this computer", async () => {
    const hostOf = (cloud: unknown) => new AkanWorkspaceConfig(null, { cloud }).cloudHost;
    expect(hostOf(undefined)).toBeNull();
    expect(hostOf({})).toBeNull();
    expect(hostOf({ host: "https://cloud.example.com/" })).toBe("https://cloud.example.com");
    expect(hostOf({ host: "https://example.com/control//" })).toBe("https://example.com/control");
    expect(hostOf({ host: "http://localhost:8283" })).toBe("http://localhost:8283");
    expect(() => hostOf({ host: "http://cloud.example.com" })).toThrow("https only");
    expect(() => hostOf({ host: "cloud.example.com" })).toThrow("is not a URL");
    expect(() => hostOf({ host: "https://cloud.example.com?x=1" })).toThrow("is not a URL");
    expect(() => hostOf({ host: "https://cloud.example.com", token: "x" })).toThrow("keys it does not take: token");

    const workspace = (cloudHost: string | null) => ({ getConfig: async () => ({ cloudHost }) });
    expect(await GlobalConfig.hostFor(workspace("https://control.example.com"), "https://given.example.com")).toBe(
      "https://given.example.com",
    );
    expect(await GlobalConfig.hostFor(workspace("https://control.example.com"), null)).toBe(
      "https://control.example.com",
    );
    expect(await GlobalConfig.hostFor(workspace(null))).toBe(GlobalConfig.akanCloudHost);
  });

  test("refuses app settings and a default export that is not an object", async () => {
    await withWorkspace({ "akan.config.ts": 'export default { docker: { image: "x" } };\n' }, async (workspace) => {
      await expect(AkanWorkspaceConfig.from(workspace)).rejects.toThrow("declares `docker`, which it does not take");
    });
    await withWorkspace({ "akan.config.ts": "export default () => ({});\n" }, async (workspace) => {
      await expect(AkanWorkspaceConfig.from(workspace)).rejects.toThrow("must default-export a WorkspaceConfig object");
    });
  });
});
