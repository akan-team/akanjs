export const barrelFacetDirs = ["ui", "webkit", "srvkit", "common", "plugin"] as const;

const sourceFilePattern = /\.(ts|tsx)$/;
const excludedFilePattern = /(^index\.tsx?$|\.d\.ts$|\.(test|spec)\.(ts|tsx)$|\.css$|\.scss$|\.sass$)/;
//? `ui` exports PascalCase names only, the other facets camelCase names only: a name with a dot, underscore or hyphen
//? (`foo.helper`, `Globe_Dynamic`, `kebab-case`) matches neither and is skipped.
const pascalCasePattern = /^[A-Z][A-Za-z0-9]*$/;
const camelCasePattern = /^[a-z][A-Za-z0-9]*$/;

//? Biome's organizeImports order, or `akan lint` reorders the barrel: A < a < B < b, a digit before a letter, and a
//? run of digits compared by its length first.
const letterRankOf = (char: string) => char.toLowerCase().charCodeAt(0) * 2 + (char === char.toLowerCase() ? 1 : 0);
const digitRunAt = (name: string, idx: number) => /^\d+/.exec(name.slice(idx))?.[0] ?? "";
export const compareExportNames = (a: string, b: string) => {
  for (let idx = 0; idx < a.length && idx < b.length; ) {
    const [runA, runB] = [digitRunAt(a, idx), digitRunAt(b, idx)];
    if (runA && runB && runA !== runB) return runA.length - runB.length || (runA < runB ? -1 : 1);
    if (runA && runB) idx += runA.length;
    else if (runA || runB) return runA ? -1 : 1;
    else if (a.charAt(idx) !== b.charAt(idx)) return letterRankOf(a.charAt(idx)) - letterRankOf(b.charAt(idx));
    else idx++;
  }
  return a.length - b.length;
};

export const facetBarrelNamesOf = (facet: string, files: string[], dirs: string[]) => {
  const nameCasePattern = facet === "ui" ? pascalCasePattern : camelCasePattern;
  return [
    ...files
      .filter((file) => sourceFilePattern.test(file) && !excludedFilePattern.test(file))
      .map((file) => file.replace(sourceFilePattern, "")),
    ...dirs.filter((dir) => !dir.startsWith(".")),
  ]
    .filter((name) => nameCasePattern.test(name))
    .sort(compareExportNames);
};

//? An empty facet gets `export {};`, since writing nothing would keep a barrel that exports a deleted file.
export const facetBarrelOf = (facet: string, files: string[], dirs: string[]) => {
  const names = facetBarrelNamesOf(facet, files, dirs);
  return names.length ? `${names.map((name) => `export * from "./${name}";`).join("\n")}\n` : "export {};\n";
};
