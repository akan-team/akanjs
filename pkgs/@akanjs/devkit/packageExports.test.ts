import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { PackageExportsMap } from "@akanjs/devkit/workspace/packageExportsMap";

//? The monorepo resolves subpaths through tsconfig `paths`, which probe extensions; a published consumer goes through
//? the exports map, matched exactly — so `"./*": "./*"` passed every test here and broke every installed subpath.

const packageDir = import.meta.dir;
const exportsMap = await PackageExportsMap.from(packageDir);

const barrelFacets = async (): Promise<string[]> => {
  const barrel = await Bun.file(path.join(packageDir, "index.ts")).text();
  return [...barrel.matchAll(/^export (?:type )?\* from "\.\/([^"]+)";$/gm)].map((match) => `./${match[1]}`);
};

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
    // One wildcard cannot serve bare files, directory facets and already-suffixed specifiers (no `.ts.ts`) at once.
    expect(exportsMap.resolve("./executors")).toBe("./executors/index.ts");
    expect(exportsMap.resolve("./fileSys")).toBe("./util/fileSys.ts");
    expect(exportsMap.resolve("./workspaceLayout.ts")).toBe("./workspace/workspaceLayout.ts");
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

  test("points every literal entry at a file, so a subpath the root once held still loads from its folder", async () => {
    const manifest = (await Bun.file(path.join(packageDir, "package.json")).json()) as {
      exports: Record<string, unknown>;
    };
    const literals = Object.keys(manifest.exports).filter((subpath) => !subpath.includes("*"));
    expect(literals.length).toBeGreaterThan(100);
    expect(exportsMap.findUnreachable(literals)).toEqual([]);
  });

  test("keeps every source out of the package root but its type barrel", () => {
    const loose = [...new Bun.Glob("*.{ts,tsx}").scanSync({ cwd: packageDir })].filter(
      (file) => file !== "index.ts" && !file.endsWith(".test.ts"),
    );
    expect(loose).toEqual([]);
  });
});
