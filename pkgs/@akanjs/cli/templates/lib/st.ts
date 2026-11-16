import type { AppInfo, LibInfo } from "akanjs";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = [...scanInfo.database.entries()]
    .filter(([_, fileTypes]) => fileTypes.has("store"))
    .map(([key]) => key);
  const serviceModules = [...scanInfo.service.entries()]
    .filter(([_, fileTypes]) => fileTypes.has("store"))
    .map(([key]) => key);
  const libs = scanInfo.getLibs();
  return `
import { ${libs.length === 0 ? "RootStore as base, " : ""}StoreRegistry } from "akanjs/store";
${libs.map((lib) => `import { RootStore as ${lib} } from "@libs/${lib}/client";`).join("\n")}

${databaseModules.map((module) => `import { ${capitalize(module)}Store } from "./${module}/${module}.store";`).join("\n")}
${serviceModules.map((module) => `import { ${capitalize(module)}Store } from "./_${module}/${module}.store";`).join("\n")}

${databaseModules.map((module) => `export { ${capitalize(module)}Store } from "./${module}/${module}.store";`).join("\n")}
${serviceModules.map((module) => `export { ${capitalize(module)}Store } from "./_${module}/${module}.store";`).join("\n")}

${databaseModules.map((module) => `export const ${module} = StoreRegistry.register(${capitalize(module)}Store);`).join("\n")}
${serviceModules.map((module) => `export const ${module} = StoreRegistry.register(${capitalize(module)}Store);`).join("\n")}

export class RootStore extends StoreRegistry.merge("${scanInfo.name}" as const, ${[...(libs.length === 0 ? ["base"] : libs), ...databaseModules, ...serviceModules].join(",\n  ")}) {}
  
export const st = StoreRegistry.build(RootStore);
`;
}
