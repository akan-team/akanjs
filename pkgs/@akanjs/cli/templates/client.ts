import type { AppInfo, LibInfo } from "akanjs";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const uiModules = (modules: Map<string, Set<string>>) =>
    [...modules.entries()]
      .filter(([_, fileTypes]) => ["template", "unit", "util", "view", "zone"].some((type) => fileTypes.has(type)))
      .map(([key]) => key);
  const databaseModules = uiModules(scanInfo.database);
  const scalarModules = uiModules(scanInfo.scalar);
  const serviceModules = uiModules(scanInfo.service);
  return `
export * as cnst from "./lib/cnst";
export { msg, Err, usePage } from "./lib/page";
export { fetch, sig } from "./lib/useClient";
export { st, RootStore } from "./lib/st";
export * as store from "./lib/st";
${scalarModules.map((module) => `export { ${capitalize(module)} } from "./lib/__scalar/${module}";`).join("\n")}
${serviceModules.map((module) => `export { ${capitalize(module)} } from "./lib/_${module}";`).join("\n")}
${databaseModules.map((module) => `export { ${capitalize(module)} } from "./lib/${module}";`).join("\n")}
`;
}
