import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = scanInfo.getDatabaseModules();
  const scalarModules = scanInfo.getScalarModules();

  return `
import { by, dbOf, scalarDbOf } from "@akanjs/document";

import * as cnst from "./cnst";

${databaseModules.map((module) => `import * as ${module}Db from "./${module}/${module}.document";`).join("\n")}
${scalarModules.map((module) => `import { ${capitalize(module)} } from "./__scalar/${module}/${module}.document";`).join("\n")}

${databaseModules.map((module) => `class ${capitalize(module)}Input extends by(cnst.${capitalize(module)}Input) {}`).join("\n")}
export type { ${databaseModules.map((module) => `${capitalize(module)}Input`).join(", ")} };

export type * from "./__lib/lib.document";

${databaseModules.map((module) => `export type * from "./${module}/${module}.document";`).join("\n")}
${scalarModules.map((module) => `export type * from "./__scalar/${module}/${module}.document";`).join("\n")}

${databaseModules
  .map((module) => {
    const names = { Module: module.charAt(0).toUpperCase() + module.slice(1) };
    return `export const ${module} = dbOf("${module}" as const, ${names.Module}Input, ${module}Db.${names.Module}, ${module}Db.${names.Module}Model, ${module}Db.${names.Module}Middleware, cnst.${names.Module}, cnst.${names.Module}Insight, ${module}Db.${names.Module}Filter);`;
  })
  .join("\n")}
${scalarModules.map((module) => `export const ${module} = scalarDbOf("${module}" as const, ${capitalize(module)});`).join("\n")}
`;
}
