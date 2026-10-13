import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { treeFiles } from "../tree-files.ts";

let root = "";
const sorted = (list: string[]) => list.toSorted((a, b) => a.localeCompare(b));
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = "";
});

const IGNORE = [
  "**/.env",
  "**/env.client.local.ts",
  "**/env.server.local.ts",
  "**/env.server.type.ts",
  "apps/*/lib/cnst.ts",
  "apps/*/secrets/**",
  "**/kubeconfig.yaml",
  "**/*-secret.yaml",
  "**/bunkan-id",
  "infra/master/jenkins/credentials.sh",
  "dump",
];
const TRACKED = [
  ".gitignore",
  ".env.template",
  "apps/board/env/env.client.ts",
  "apps/board/env/env.server.ts",
  "apps/board/page/index.tsx",
];
const UNTRACKED = [".env.local", "src/new.ts"];
const IGNORED = [
  ".env",
  "apps/board/env/env.client.local.ts",
  "apps/board/env/env.server.local.ts",
  "apps/board/env/env.server.type.ts",
  "apps/board/lib/cnst.ts",
  "apps/board/secrets/firebase.json",
  "infra/master/kubeconfig.yaml",
  "infra/master/bunkan-id",
  "infra/master/jenkins/credentials.sh",
  "infra/app/values/akan-secret.yaml",
  "dump/db.wt",
];

/** A work tree like the monorepo's: what git tracks, what it does not know, and what it ignores. */
function workTree(): string {
  root = mkdtempSync(join(tmpdir(), "akan-native-tree-files-"));
  for (const file of [...TRACKED, ...UNTRACKED, ...IGNORED, "node_modules/x/index.js"]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), file === ".gitignore" ? `${IGNORE.join("\n")}\n` : "");
  }
  symlinkSync(join(root, "src"), join(root, "linked"));
  for (const args of [
    ["init", "-q"],
    ["add", "--", ...TRACKED],
  ]) {
    const p = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (p.exitCode !== 0) throw new Error(p.stderr.toString());
  }
  return root;
}

describe("the files the VM sync copies", () => {
  test("another tree: nothing git ignores but a client env, no untracked credential, the env files as stubs", () => {
    const { files, stubs } = treeFiles(workTree(), { guarded: true });
    expect(sorted(files)).toEqual(
      sorted([
        ".env.template",
        ".gitignore",
        "apps/board/env/env.client.local.ts",
        "apps/board/env/env.client.ts",
        "apps/board/env/env.server.ts",
        "apps/board/page/index.tsx",
        "src/new.ts",
      ]),
    );
    expect(sorted(stubs)).toEqual(sorted([".env", "apps/board/env/env.server.local.ts"]));
  });

  test("this package's own tree leaves out what git ignores too, and makes no stubs", () => {
    const { files, stubs } = treeFiles(workTree(), { guarded: false });
    expect(files).toContain(".env.local");
    expect(files).not.toContain("infra/master/kubeconfig.yaml");
    expect(files).not.toContain("dump/db.wt");
    expect(stubs).toEqual([]);
  });

  test("keep takes back whole what would be left out, and exclude leaves out more", () => {
    const { files } = treeFiles(workTree(), { guarded: true, keep: "kubeconfig.yaml, secrets", exclude: "src" });
    expect(files).toContain("infra/master/kubeconfig.yaml");
    expect(files).toContain("apps/board/secrets/firebase.json");
    expect(files).not.toContain("infra/master/bunkan-id");
    expect(files).not.toContain("src/new.ts");
  });

  test("a tree git does not know is refused rather than copied whole", () => {
    root = mkdtempSync(join(tmpdir(), "akan-native-tree-files-"));
    writeFileSync(join(root, ".env"), "");
    expect(() => treeFiles(root, { guarded: true })).toThrow("git ls-files");
  });
});
