import type { AppInfo, LibInfo } from "akanjs";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = scanInfo.getDatabaseModules();
  const scalarModules = scanInfo.getScalarModules();
  const libs = scanInfo.getLibs();
  return `
import { ${databaseModules.length ? "by, " : ""}DatabaseRegistry } from "akanjs/document";
${scalarModules.map((module) => `import { ${capitalize(module)} } from "./__scalar/${module}/${module}.document";`).join("\n")}
${databaseModules.length ? `import * as cnst from "./cnst";` : ""}
${databaseModules.map((module) => `import * as ${module}Db from "./${module}/${module}.document";`).join("\n")}

${libs.map((lib) => `export { db as ${lib} } from "@libs/${lib}/server";`).join("\n")}

${databaseModules.map((module) => `class ${capitalize(module)}Input extends by(cnst.${capitalize(module)}Input) {}`).join("\n")}
${databaseModules.length ? `export type { ${databaseModules.map((module) => `${capitalize(module)}Input`).join(", ")} };` : ""}

${scalarModules.map((module) => `export type * from "./__scalar/${module}/${module}.document";`).join("\n")}
${databaseModules.map((module) => `export type * from "./${module}/${module}.document";`).join("\n")}

${databaseModules
  .map((module) => {
    const names = { Module: module.charAt(0).toUpperCase() + module.slice(1) };
    return `export const ${module} = DatabaseRegistry.buildModel("${module}" as const, ${names.Module}Input, ${module}Db.${names.Module}, ${module}Db.${names.Module}Model, cnst.${names.Module}, cnst.${names.Module}Insight, ${module}Db.${names.Module}Filter);`;
  })
  .join("\n")}
${scalarModules.map((module) => `export const ${module} = DatabaseRegistry.buildScalar("${module}" as const, ${capitalize(module)});`).join("\n")}
`;
}
