import type { AppInfo, LibInfo } from "akanjs";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = scanInfo.getDatabaseModules();
  const scalarModules = scanInfo.getScalarModules();
  const libs = scanInfo.getLibs();
  const libInfos = scanInfo.getLibInfos();
  return `
import { ConstantRegistry } from "akanjs/constant";
${scalarModules.map((module) => `import * as ${module}Cnst from "./__scalar/${module}/${module}.constant";`).join("\n")}
${databaseModules.map((module) => `import * as ${module}Cnst from "./${module}/${module}.constant";`).join("\n")}

${libs.map((lib) => `export { cnst as ${lib} } from "@libs/${lib}";`).join("\n")}

${scalarModules.map((module) => `export * from "./__scalar/${module}/${module}.constant";`).join("\n")}
${databaseModules.map((module) => `export * from "./${module}/${module}.constant";`).join("\n")}

${databaseModules
  .map((module) => {
    const names = { Module: capitalize(module) };
    return `export const ${module} = ConstantRegistry.buildModel("${module}" as const, ${module}Cnst.${names.Module}Input, ${module}Cnst.${names.Module}Object, ${module}Cnst.${names.Module}, ${module}Cnst.Light${names.Module}, ${module}Cnst.${names.Module}Insight, ${module}Cnst, "${scanInfo.name}");`;
  })
  .join("\n")}
${scalarModules.map((module) => `export const ${module} = ConstantRegistry.buildScalar("${module}" as const, ${module}Cnst.${capitalize(module)}, ${module}Cnst, "${scanInfo.name}");`).join("\n")}
`;
}
