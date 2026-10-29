import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProductionLockfile } from "./productionLockfile";

// js-tokens 3.0.2 is locked although 4.0.0 satisfies the range: a re-resolve would move it.
const workspaceLock = `{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {
    "": {
      "name": "repo",
      "dependencies": {
        "loose-envify": "^1.4.0",
        "ms": "^2.0.0",
      },
    },
  },
  "packages": {
    "js-tokens": ["js-tokens@3.0.2", "", {}, "sha512-RjTcuD4xjtthQkaWH7dFlH85L+QaVtSoOyGdZ3g6HFhS9dFNDfLyqgm2NFe2X6cQpeFmt0452FJjFG5UameExg=="],

    "loose-envify": ["loose-envify@1.4.0", "", { "dependencies": { "js-tokens": "^3.0.0 || ^4.0.0" }, "bin": { "loose-envify": "cli.js" } }, "sha512-lyuxPGr/Wfhrlem2CL/UcnUc1zcqKAImBDzukY7Y5F/yQiNdko6+fRLevlw1HgMySw7f611UIY408EtxRSoK3Q=="],

    "ms": ["ms@2.0.0", "", {}, "sha512-Tpp60P6IUJDTuOq/5Z8cdskzJujfwqfOTkrwIwj7IRISpnkJnT6SyJ4PCPnGMoFjC9ddhal5KVIYtAt97ix05A=="],
  }
}
`;

const productionPackageJson = {
  name: "portal",
  description: "portal",
  version: "1.0.0",
  dependencies: { "loose-envify": "^1.4.0" },
};

const withWorkspace = async (lock: string | null, run: (root: string) => Promise<void>) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-production-lock-test-"));
  try {
    if (lock !== null) await writeFile(path.join(root, "bun.lock"), lock);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

describe("ProductionLockfile", () => {
  test("keeps the workspace's locked versions and drops what the production package.json does not reach", async () => {
    await withWorkspace(workspaceLock, async (root) => {
      const lock = await ProductionLockfile.prune(root, productionPackageJson);
      expect(lock).toContain('"loose-envify": ["loose-envify@1.4.0"');
      expect(lock).toContain('"js-tokens": ["js-tokens@3.0.2"');
      expect(lock).not.toContain("ms@2.0.0");
      expect(lock).not.toContain('"ms": "^2.0.0"');
    });
  });

  test("a bun install --frozen-lockfile of the pruned lockfile changes nothing", async () => {
    await withWorkspace(workspaceLock, async (root) => {
      const lock = await ProductionLockfile.prune(root, productionPackageJson);
      await writeFile(path.join(root, "package.json"), JSON.stringify(productionPackageJson, null, 2));
      await writeFile(path.join(root, "bun.lock"), lock);
      const install = Bun.spawn([process.execPath, "install", "--lockfile-only", "--frozen-lockfile"], {
        cwd: root,
        stdout: "ignore",
        stderr: "pipe",
      });
      expect(await install.exited).toBe(0);
      expect(await Bun.file(path.join(root, "bun.lock")).text()).toBe(lock);
    });
  });

  test("refuses a workspace without a bun.lock, so the build can fall back to an unlocked install", async () => {
    await withWorkspace(null, async (root) => {
      await expect(ProductionLockfile.prune(root, productionPackageJson)).rejects.toThrow(
        "the workspace root has no bun.lock",
      );
    });
  });
});
