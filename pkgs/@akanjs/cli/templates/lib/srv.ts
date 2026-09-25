import type { AppInfo, LibInfo } from "akanjs";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = [...scanInfo.database.entries()]
    .filter(([_, files]) => files.has("service"))
    .map(([module]) => module);
  const serviceModules = [...scanInfo.service.entries()]
    .filter(([_, files]) => files.has("service"))
    .map(([module]) => module);
  const libs = scanInfo.getLibs();
  return `
import { ServiceModel } from "akanjs/service";
${libs.length ? libs.map((lib) => `import { option as ${lib} } from "@libs/${lib}/server";`).join("\n") : 'import type { BackendEnv } from "akanjs/base";'}

import * as cnst from "./cnst";
import * as db from "./db";

${databaseModules.map((module) => `import { ${capitalize(module)}Service } from "./${module}/${module}.service";`).join("\n")}
${serviceModules.map((module) => `import { ${capitalize(module)}Service } from "./_${module}/${module}.service";`).join("\n")}

${libs.map((lib) => `export { srv as ${lib} } from "@libs/${lib}/server";`).join("\n")}

${databaseModules.map((module) => `export { ${capitalize(module)}Service } from "./${module}/${module}.service";`).join("\n")}
${serviceModules.map((module) => `export { ${capitalize(module)}Service } from "./_${module}/${module}.service";`).join("\n")}

${databaseModules.map((module) => `export const ${module} = ServiceModel.fromModel(${capitalize(module)}Service, cnst.${module}, db.${module});`).join("\n")}
${serviceModules.map((module) => `export const ${module} = ServiceModel.from(${capitalize(module)}Service);`).join("\n")}

export type LibOptions = ${libs.length ? libs.map((lib) => `${lib}.ModulesOptions`).join(" & ") : "BackendEnv"};
`;
}
