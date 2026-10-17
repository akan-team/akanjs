import { describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import path from "node:path";
import type { PackageJson } from "@akanjs/devkit/types";

//? A published install never reads our overrides, so PackageRunner re-declares every sibling pi package at the version
//? installed here (a floating 0.80.x once broke every global install); this keeps those pins equal to the tree.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const piName = "@earendil-works/pi-coding-agent";
const piScope = "@earendil-works/";
const piDir = `${repoRoot}/node_modules/${piName}`;
const publishedPackages = ["pkgs/@akanjs/devkit/package.json", "pkgs/@akanjs/cli/package.json"];

const readJson = async <T>(file: string) => (await Bun.file(file).json()) as T;

// Each package's dependencies sit beside it in the scope folder, under both Bun's isolated and hoisted layouts.
const installedSiblingPins = async () => {
  const pins: Record<string, string> = {};
  const visit = async (dir: string) => {
    const { dependencies = {} } = await readJson<PackageJson>(`${dir}/package.json`);
    for (const name of Object.keys(dependencies).filter((dep) => dep.startsWith(piScope))) {
      if (pins[name]) continue;
      const siblingDir = path.resolve(realpathSync(dir), "..", name.slice(piScope.length));
      pins[name] = (await readJson<PackageJson>(`${siblingDir}/package.json`)).version ?? "";
      await visit(siblingDir);
    }
  };
  await visit(piDir);
  return pins;
};

describe("pi dependency pins", () => {
  test("the coding agent read here is the one we publish", async () => {
    const installed = await readJson<PackageJson>(`${piDir}/package.json`);
    for (const file of publishedPackages) {
      const { dependencies = {} } = await readJson<PackageJson>(`${repoRoot}/${file}`);
      expect({ file, [piName]: dependencies[piName] }).toEqual({ file, [piName]: installed.version });
    }
  });

  test("every sibling pi package is published at the version installed under the coding agent", async () => {
    const pins = await installedSiblingPins();
    expect(Object.keys(pins).length).toBeGreaterThan(0);
    for (const file of publishedPackages) {
      const { dependencies = {} } = await readJson<PackageJson>(`${repoRoot}/${file}`);
      const declared = Object.fromEntries(Object.keys(pins).map((name) => [name, dependencies[name]]));
      expect({ file, ...declared }).toEqual({ file, ...pins });
    }
  });
});
