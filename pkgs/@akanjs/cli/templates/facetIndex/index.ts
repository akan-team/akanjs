import type { SysExecutor } from "@akanjs/devkit/executors";
import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  [key: string]: string;
}

interface Options {
  exec?: SysExecutor;
  facet?: string;
}

const sourceFilePattern = /\.(ts|tsx)$/;
const excludedFilePattern = /(^index\.tsx?$|\.d\.ts$|\.(test|spec)\.(ts|tsx)$|\.css$|\.scss$|\.sass$)/;
// `ui` exports PascalCase names only; `common`/`srvkit`/`webkit` export camelCase names only. Names with
// dots, underscores, or hyphens (e.g. `foo.helper`, `Globe_Dynamic`, `kebab-case`) match neither and are skipped.
const pascalCasePattern = /^[A-Z][A-Za-z0-9]*$/;
const camelCasePattern = /^[a-z][A-Za-z0-9]*$/;
const nameCasePatternForFacet = (facet: string) => (facet === "ui" ? pascalCasePattern : camelCasePattern);
//? Biome's organizeImports order, or `akan lint` reorders the barrel: A < a < B < b, a digit before a letter, and a
//? run of digits compared by its length first. DevGeneratedIndexSync sorts the same way; the env template imports it.
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

export default async function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict = {}, options: Options = {}) {
  const { exec, facet } = options;
  if (!exec || !facet || !(await exec.exists(facet))) return null;

  const nameCasePattern = nameCasePatternForFacet(facet);
  const { files, dirs } = await exec.getFilesAndDirs(facet);
  const exportNames = [
    ...files
      .filter((filename) => sourceFilePattern.test(filename) && !excludedFilePattern.test(filename))
      .map((filename) => filename.replace(sourceFilePattern, "")),
    ...dirs.filter((dirname) => !dirname.startsWith(".")),
  ]
    .filter((name) => nameCasePattern.test(name))
    .sort(compareExportNames);

  //? Not null: a null result writes nothing, so a barrel still exporting a deleted file would outlive the file.
  const content = exportNames.length
    ? `${exportNames.map((name) => `export * from "./${name}";`).join("\n")}\n`
    : "export {};\n";
  return { filename: "index.ts", content };
}
