import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = scanInfo.getDatabaseModules();
  const scalarModules = scanInfo.getScalarModules();
  const libInfos = scanInfo.getLibInfos();
  const extendedModelMap = new Map<string, string[]>(
    [...scanInfo.file.constant.databases]
      .map(
        (modelName) =>
          [
            modelName,
            [...libInfos.values()]
              .filter((libInfo) => libInfo.file.constant.databases.has(modelName))
              .map((libInfo) => libInfo.name),
          ] as [string, string[]]
      )
      .filter(([_, libNames]) => libNames.length > 0)
  );
  return `
import { cnstOf, scalarCnstOf } from "@akanjs/constant";

${databaseModules.map((module) => `import * as ${module}Cnst from "./${module}/${module}.constant";`).join("\n")}
${scalarModules.map((module) => `import { ${capitalize(module)} } from "./__scalar/${module}/${module}.constant";`).join("\n")}

export * from "./__lib/lib.constant";
${databaseModules.map((module) => `export * from "./${module}/${module}.constant";`).join("\n")}
${scalarModules.map((module) => `export * from "./__scalar/${module}/${module}.constant";`).join("\n")}

${databaseModules
  .map((module) => {
    const names = { Module: capitalize(module) };
    return `export const ${module} = cnstOf("${module}" as const, ${module}Cnst.${names.Module}Input, ${module}Cnst.${names.Module}Object, ${module}Cnst.${names.Module}, ${module}Cnst.Light${names.Module}, ${module}Cnst.${names.Module}Insight${extendedModelMap.has(module) ? ", { overwrite: true }" : ""});`;
  })
  .join("\n")}
${scalarModules.map((module) => `export const ${module} = scalarCnstOf("${module}" as const, ${capitalize(module)});`).join("\n")}
`;
}
