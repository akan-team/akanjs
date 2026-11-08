import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveStaticPath, staysInTree } from "./staticPath";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

const makeTree = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "akan-static-"));
  roots.push(root);
  const base = path.join(root, "public");
  fs.mkdirSync(path.join(base, "img"), { recursive: true });
  await writeFile(path.join(base, "img", "logo.png"), "png");
  await writeFile(path.join(root, "secret.txt"), "not yours");
  fs.mkdirSync(`${base}-secrets`, { recursive: true });
  await writeFile(path.join(`${base}-secrets`, "keys.txt"), "not yours either");
  return { root, base };
};

describe("resolveStaticPath", () => {
  test("resolves a file inside the tree", async () => {
    const { base } = await makeTree();
    expect(resolveStaticPath(base, "/img/logo.png")).toBe(path.join(base, "img", "logo.png"));
    expect(resolveStaticPath(base, "/img/missing.png")).toBe(path.join(base, "img", "missing.png"));
  });

  test("refuses traversal, encoded traversal, and a NUL byte", async () => {
    const { base } = await makeTree();
    expect(resolveStaticPath(base, "/../secret.txt")).toBeNull();
    expect(resolveStaticPath(base, "/%2e%2e/secret.txt")).toBeNull();
    expect(resolveStaticPath(base, "/img/../../secret.txt")).toBeNull();
    expect(resolveStaticPath(base, "/img/logo.png\0.txt")).toBeNull();
    expect(resolveStaticPath(base, "/%")).toBeNull();
  });

  test("refuses a sibling directory whose name only starts with the base's", async () => {
    const { base } = await makeTree();
    expect(resolveStaticPath(base, "/../public-secrets/keys.txt")).toBeNull();
  });

  test("serves a lib asset through the link akan sync makes out of the tree", async () => {
    const { root, base } = await makeTree();
    fs.mkdirSync(path.join(root, "libs", "kaiden", "public"), { recursive: true });
    await writeFile(path.join(root, "libs", "kaiden", "public", "model.glb"), "glb");
    fs.mkdirSync(path.join(base, "libs"), { recursive: true });
    await symlink(
      path.relative(path.join(base, "libs"), path.join(root, "libs", "kaiden", "public")),
      path.join(base, "libs", "kaiden"),
      "dir",
    );

    const resolved = resolveStaticPath(base, "/libs/kaiden/model.glb");
    expect(resolved).toBe(path.join(base, "libs", "kaiden", "model.glb"));
    expect(fs.readFileSync(resolved as string, "utf8")).toBe("glb");
  });

  test("refuses a symlink that leads out of the tree", async () => {
    const { root, base } = await makeTree();
    await symlink(root, path.join(base, "outside"), "dir");
    await symlink(path.join(root, "secret.txt"), path.join(base, "img", "secret.txt"));

    expect(resolveStaticPath(base, "/outside/secret.txt")).toBeNull();
    expect(resolveStaticPath(base, "/img/secret.txt")).toBeNull();
    expect(staysInTree(base, path.join(base, "outside", "secret.txt"))).toBe(false);
  });

  test("refuses a libs/ link that is not a lib's public directory", async () => {
    const { root, base } = await makeTree();
    fs.mkdirSync(path.join(base, "libs"), { recursive: true });
    await symlink(root, path.join(base, "libs", "kaiden"), "dir");
    fs.mkdirSync(path.join(root, "libs", "other", "public"), { recursive: true });
    await writeFile(path.join(root, "libs", "other", "public", "a.txt"), "a");
    await symlink(path.join(root, "libs", "other", "public"), path.join(base, "libs", "renamed"), "dir");

    expect(resolveStaticPath(base, "/libs/kaiden/secret.txt")).toBeNull();
    expect(resolveStaticPath(base, "/libs/renamed/a.txt")).toBeNull();
  });

  test("follows a symlink that stays inside the tree", async () => {
    const { base } = await makeTree();
    await symlink(path.join(base, "img"), path.join(base, "images"), "dir");
    expect(resolveStaticPath(base, "/images/logo.png")).toBe(path.join(base, "images", "logo.png"));
  });

  test("the base directory itself resolves to the base", async () => {
    const { base } = await makeTree();
    expect(resolveStaticPath(base, "/")).toBe(base);
    expect(resolveStaticPath(base, "")).toBe(base);
  });
});
