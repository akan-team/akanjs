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

//? The CLI's dist inlines devkit: once installed, only devkit's own sources and the CLI's templates import a subpath.
const importedSubpaths = async (): Promise<string[]> => {
  const repoRoot = path.resolve(packageDir, "../../..");
  const found = new Set<string>();
  const sources = [
    ...new Bun.Glob("pkgs/@akanjs/devkit/**/*.{ts,tsx}").scanSync({ cwd: repoRoot }),
    ...new Bun.Glob("pkgs/@akanjs/cli/templates/**/*").scanSync({ cwd: repoRoot }),
  ];
  for (const relative of sources) {
    if (relative.includes("node_modules/") || relative.includes("/dist/") || /\.(test|spec)\.tsx?$/.test(relative))
      continue;
    const source = await Bun.file(path.join(repoRoot, relative)).text();
    for (const match of source.matchAll(/"@akanjs\/devkit\/([a-zA-Z0-9_./-]+)"/g)) found.add(`./${match[1]}`);
  }
  return [...found].sort();
};

describe("published exports map", () => {
  test("names every public subpath, with no wildcard to reach a file it does not", async () => {
    const manifest = (await Bun.file(path.join(packageDir, "package.json")).json()) as {
      exports: Record<string, unknown>;
    };
    const subpaths = Object.keys(manifest.exports);
    expect(subpaths.filter((subpath) => subpath.includes("*"))).toEqual([]);
    expect(subpaths.length).toBeGreaterThan(20);
    expect(exportsMap.findUnreachable(subpaths)).toEqual([]);
  });

  test("resolves every subpath a published install imports", async () => {
    const subpaths = await importedSubpaths();
    expect(subpaths).toContain("./executors");
    expect(exportsMap.findUnreachable(subpaths)).toEqual([]);
  });

  test("points a directory facet at its index and a nested entry at its file", () => {
    expect(exportsMap.resolve("./executors")).toBe("./executors/index.ts");
    expect(exportsMap.resolve("./frontendBuild")).toBe("./frontendBuild/index.ts");
    expect(exportsMap.resolve("./cloud/cloudApi")).toBe("./cloud/cloudApi.ts");
    expect(exportsMap.resolve("./package.json")).toBe("./package.json");
  });

  test("keeps an entry for each nested file a consumer workspace imports", () => {
    const nested = [
      "cloud/cloudApi",
      "cloud/cloudUpdates",
      "commandDecorators/exitCodeError",
      "mobile/desktopRelease",
      "mobile/serverBundleSecrets",
      "transforms/serverEnvProfile",
      "util/fileEditor",
      "util/selectModel",
      "workspace/getRelatedCnsts",
    ];
    expect(nested.filter((file) => exportsMap.resolve(`./${file}`) !== `./${file}.ts`)).toEqual([]);
  });

  test("every directory facet the root barrel re-exports has a literal entry", async () => {
    const facets = await barrelFacets();
    const missing = facets.filter(
      (subpath) =>
        existsSync(path.join(packageDir, subpath, "index.ts")) && exportsMap.resolve(subpath) !== `${subpath}/index.ts`,
    );
    expect(missing).toEqual([]);
  });

  test("keeps every source out of the package root but its type barrel", () => {
    const loose = [...new Bun.Glob("*.{ts,tsx}").scanSync({ cwd: packageDir })].filter(
      (file) => file !== "index.ts" && !file.endsWith(".test.ts"),
    );
    expect(loose).toEqual([]);
  });
});
