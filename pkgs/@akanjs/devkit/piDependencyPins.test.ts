import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { PackageJson } from "@akanjs/devkit/types";

//? PackageRunner re-declares pi's sibling pins because neither our `overrides` nor pi's own ranges reach a
//? consumer's install. The source of truth is pi's `dependencies`: since 1.3.0 it pins every sibling exactly, where
//? 0.86.1 floated `^0.86.1` and only the (now removed) `npm-shrinkwrap.json` held the resolved version.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const piName = "@earendil-works/pi-coding-agent";
const piDir = `${repoRoot}/node_modules/${piName}`;
const publishedPackages = ["pkgs/@akanjs/devkit/package.json", "pkgs/@akanjs/cli/package.json"];

const readJson = async <T>(file: string) => (await Bun.file(file).json()) as T;

const siblingEntries = async () => {
  const { dependencies = {} } = await readJson<PackageJson>(`${piDir}/package.json`);
  return Object.entries(dependencies).filter(([name]) => /^@earendil-works\/[^/]+$/.test(name));
};

describe("pi dependency pins", () => {
  test("the package read here belongs to the coding agent we publish", async () => {
    const installed = await readJson<PackageJson>(`${piDir}/package.json`);
    for (const file of publishedPackages) {
      const { dependencies = {} } = await readJson<PackageJson>(`${repoRoot}/${file}`);
      expect({ file, [piName]: dependencies[piName] }).toEqual({ file, [piName]: installed.version });
    }
  });

  test("the coding agent pins each sibling exactly", async () => {
    const siblings = await siblingEntries();
    expect(siblings.length).toBeGreaterThan(0);
    const floating = siblings.filter(([, version]) => !/^\d+\.\d+\.\d+/.test(version));
    expect(floating).toEqual([]);
  });

  test("every sibling pi package is published at the version the coding agent pins", async () => {
    const siblings = await siblingEntries();
    for (const file of publishedPackages) {
      const { dependencies = {} } = await readJson<PackageJson>(`${repoRoot}/${file}`);
      const declared = Object.fromEntries(siblings.map(([name]) => [name, dependencies[name]]));
      expect({ file, ...declared }).toEqual({ file, ...Object.fromEntries(siblings) });
    }
  });
});
