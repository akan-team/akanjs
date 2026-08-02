import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { PackageExportsMap } from "@akanjs/devkit/packageExportsMap";

// Guards the published shape of this package, which the monorepo cannot exercise on its own.
//
// Inside the monorepo Bun resolves `@akanjs/devkit/executors` through the root tsconfig `paths`
// (`@akanjs/devkit/*` -> `pkgs/@akanjs/devkit/*`), and that resolver probes extensions and directory
// indexes. A published consumer has no such mapping: it goes through this package's `exports` map,
// whose targets are matched *exactly*. So `"./*": "./*"` type-checked, built, and passed every test
// here while every subpath import failed at runtime for anyone installing the tarball:
//
//   error: Cannot find module '@akanjs/devkit/executors' from
//     '<consumer>/node_modules/@akanjs/devkit/incrementalBuilder/incrementalBuilder.proc.ts'
//
// `PackageRunner.verifyDistPackage` runs the same check against the built dist tree of every
// publishable package at release time; these tests keep this package honest on every run.

const packageDir = import.meta.dir;
const exportsMap = await PackageExportsMap.from(packageDir);

/** Every facet the root barrel re-exports, as the subpath a consumer would import. */
const barrelFacets = async (): Promise<string[]> => {
  const barrel = await Bun.file(path.join(packageDir, "index.ts")).text();
  return [...barrel.matchAll(/^export (?:type )?\* from "\.\/([^"]+)";$/gm)].map((match) => `./${match[1]}`);
};

/** Every `@akanjs/devkit/<subpath>` specifier written anywhere in the two packages that use them. */
const importedSubpaths = async (): Promise<string[]> => {
  const repoRoot = path.resolve(packageDir, "../../..");
  const glob = new Bun.Glob("pkgs/@akanjs/{cli,devkit}/**/*.{ts,tsx}");
  const found = new Set<string>();
  for await (const relative of glob.scan({ cwd: repoRoot })) {
    if (relative.includes("node_modules/") || relative.includes("/dist/")) continue;
    const source = await Bun.file(path.join(repoRoot, relative)).text();
    for (const match of source.matchAll(/"@akanjs\/devkit\/([a-zA-Z0-9_./-]+)"/g)) found.add(`./${match[1]}`);
  }
  return [...found].sort();
};

describe("published exports map", () => {
  test("resolves every facet the root barrel re-exports", async () => {
    const facets = await barrelFacets();
    expect(facets.length).toBeGreaterThan(30);
    expect(exportsMap.findUnreachable(facets)).toEqual([]);
  });

  test("resolves every subpath the monorepo actually imports", async () => {
    const subpaths = await importedSubpaths();
    expect(subpaths.length).toBeGreaterThan(20);
    expect(exportsMap.findUnreachable(subpaths)).toEqual([]);
  });

  test("covers both facet shapes and keeps explicit extensions intact", () => {
    // A single wildcard cannot serve all three: `./*` -> `./*.ts` reaches bare files, directory
    // facets need their own literal entry, and `./*.ts` -> `./*.ts` keeps an already-suffixed
    // specifier from becoming `./cloud/cloudApi.ts.ts`.
    expect(exportsMap.resolve("./executors")).toBe("./executors.ts");
    expect(exportsMap.resolve("./frontendBuild")).toBe("./frontendBuild/index.ts");
    expect(exportsMap.resolve("./cloud/cloudApi.ts")).toBe("./cloud/cloudApi.ts");
    expect(exportsMap.resolve("./package.json")).toBe("./package.json");
  });

  test("every directory facet has a literal entry, since the wildcard cannot probe index.ts", async () => {
    const facets = await barrelFacets();
    const missing = facets.filter(
      (subpath) =>
        existsSync(path.join(packageDir, subpath, "index.ts")) && exportsMap.resolve(subpath) !== `${subpath}/index.ts`,
    );
    expect(missing).toEqual([]);
  });
});
