import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = import.meta.dir;
const facets = [...new Bun.Glob("*/index.{ts,tsx}").scanSync({ cwd: root })].map((barrel) => path.dirname(barrel));
const testFile = /\.(test|spec)\.tsx?$|\.fixture\.tsx?$|\/__fixtures__\//;
const barrelOf = (target: string) => target.replace(/\.tsx?$/, "").replace(/\/index$/, "");

const ownBarrelImports = (facet: string) => {
  const barrel = path.join(root, facet);
  const found: string[] = [];
  for (const rel of new Bun.Glob(`${facet}/**/*.{ts,tsx}`).scanSync({ cwd: root })) {
    if (/^[^/]+\/index\.tsx?$/.test(rel) || testFile.test(rel)) continue;
    const file = path.join(root, rel);
    for (const { fileName: spec } of ts.preProcessFile(readFileSync(file, "utf8"), true, true).importedFiles) {
      const target = spec.startsWith(".") ? barrelOf(path.resolve(path.dirname(file), spec)) : barrelOf(spec);
      if (target === barrel || target === `akanjs/${facet}`) found.push(`${rel} imports ${spec}`);
    }
  }
  return found;
};

describe("akanjs facets", () => {
  //? #350: a value import through a file's own barrel is a load-order cycle, and a type import hides its source.
  test("import their siblings by path, never through their own barrel", () => {
    expect(facets.length).toBeGreaterThan(5);
    expect(facets.flatMap(ownBarrelImports)).toEqual([]);
  });
});
