import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

  test("refuses app settings and a default export that is not an object", async () => {
    await withWorkspace({ "akan.config.ts": 'export default { docker: { image: "x" } };\n' }, async (workspace) => {
      expect(AkanWorkspaceConfig.from(workspace)).rejects.toThrow("declares `docker`, which it does not take");
    });
    await withWorkspace({ "akan.config.ts": "export default () => ({});\n" }, async (workspace) => {
      expect(AkanWorkspaceConfig.from(workspace)).rejects.toThrow("must default-export a WorkspaceConfig object");
    });
  });
});
