import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const libs = scanInfo.getLibs();
  const databaseModules = [...scanInfo.database.entries()].filter(([_, files]) => files.has("service"));
  const serviceModules = [...scanInfo.service.entries()].filter(([_, files]) => files.has("service"));
  const scalarModules = [...scanInfo.scalar.entries()];
  return `
import { databaseModuleOf, scalarModulesOf, serviceModuleOf, type Module, type Middleware } from "@akanjs/server";
${libs.map((lib) => `import { registerModules as register${capitalize(lib)}Modules, registerMiddlewares as register${capitalize(lib)}Middlewares } from "@${lib}/server";`).join("\n")}
  
import * as cnst from "./lib/cnst";
import * as db from "./lib/db";
import * as srv from "./lib/srv";
import { allSrvs } from "./lib/srv";
import * as sig from "./lib/sig";
import { type ModulesOptions, registerGlobalModule, registerGlobalMiddlewares } from "./lib/option";

// database modules
${databaseModules
  .map(([model]) => {
    const Model = capitalize(model);
    return `const register${Model}Module = () => databaseModuleOf({ constant: cnst.${model}, database: db.${model}, signal: sig.${Model}Signal, service: srv.${Model}Service }, allSrvs);`;
  })
  .join("\n")}

// service modules
${serviceModules
  .map(([model, moduleInfo]) => {
    const Model = capitalize(model);
    return `const register${Model}Module = () => serviceModuleOf({ service: srv.${Model}Service${moduleInfo.has("signal") ? `, signal: sig.${Model}Signal` : ""} }, allSrvs);`;
  })
  .join("\n")}

// scalar modules
const registerScalarModule = () => scalarModulesOf({ constants: [${scalarModules.map(([model]) => `cnst.${capitalize(model)}`).join(", ")}] }, allSrvs);

export const registerModules = (options: ModulesOptions, isChild?: boolean) => {
  const modules = [
${libs.map((lib) => `    ...(!isChild ? register${capitalize(lib)}Modules(options, true) : []),`).join("\n")}
    registerGlobalModule(options),
    registerScalarModule(),
${serviceModules.map(([model]) => `    register${capitalize(model)}Module(),`).join("\n")}
${databaseModules.map(([model]) => `    register${capitalize(model)}Module(),`).join("\n")}
  ] as Module[];
  return modules;
};

export const registerMiddlewares = (options: ModulesOptions, isChild?: boolean) => {
  const middlewares = [
${libs.map((lib) => `    ...(!isChild ? register${capitalize(lib)}Middlewares(options, true) : []),`).join("\n")}
    ...registerGlobalMiddlewares(options),
  ] as Middleware[];
  return middlewares;
};

export { env } from "./env/env.server.testing";
export * as db from "./lib/db";
export * as srv from "./lib/srv";
export * as sig from "./lib/sig";
export * as option from "./lib/option";
export * as cnst from "./lib/cnst";
export { fetch } from "./lib/sig";
export * as dict from "./lib/dict";
`;
}
