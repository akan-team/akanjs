import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = [...scanInfo.database.entries()]
    .filter(([_, files]) => files.has("service"))
    .map(([module]) => module);
  const serviceModules = [...scanInfo.service.entries()]
    .filter(([_, files]) => files.has("service"))
    .map(([module]) => module);
  return `
import { GetServices, ServiceModule, serviceInfo } from "@akanjs/service";

import * as cnst from "./cnst";
import { libAllSrvs } from "./__lib/lib.service";
${databaseModules.map((module) => `import { ${capitalize(module)}Service } from "./${module}/${module}.service";`).join("\n")}
${serviceModules.map((module) => `import { ${capitalize(module)}Service } from "./_${module}/${module}.service";`).join("\n")}

export * from "./__lib/lib.service";
${databaseModules.map((module) => `export { ${capitalize(module)}Service } from "./${module}/${module}.service";`).join("\n")}
${serviceModules.map((module) => `export { ${capitalize(module)}Service } from "./_${module}/${module}.service";`).join("\n")}

export const srvs = serviceInfo.registerServices({
  ${[...databaseModules, ...serviceModules].map((module) => `${capitalize(module)}Service`).join(",\n  ")}
});
export const allSrvs = { ...libAllSrvs, ...srvs } as const;
${databaseModules.map((module) => `export const ${module} = new ServiceModule("${module}" as const, { ${capitalize(module)}Service }, cnst.${module});`).join("\n")}
${serviceModules.map((module) => `export const ${module} = new ServiceModule("${module}" as const, { ${capitalize(module)}Service });`).join("\n")}
`;
}
