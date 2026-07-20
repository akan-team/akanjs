import type { SysExecutor } from "@akanjs/devkit";
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
    .sort();

  if (exportNames.length === 0) return null;
  return {
    filename: "index.ts",
    content: `${exportNames.map((name) => `export * from "./${name}";`).join("\n")}\n`,
  };
}
