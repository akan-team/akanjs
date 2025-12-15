import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = [...scanInfo.database.entries()]
    .filter(
      ([_, fileTypes]) =>
        fileTypes.has("template") ||
        fileTypes.has("unit") ||
        fileTypes.has("util") ||
        fileTypes.has("view") ||
        fileTypes.has("zone")
    )
    .map(([key]) => key);
  const scalarModules = [...scanInfo.scalar.entries()]
    .filter(
      ([_, fileTypes]) =>
        fileTypes.has("template") ||
        fileTypes.has("unit") ||
        fileTypes.has("util") ||
        fileTypes.has("view") ||
        fileTypes.has("zone")
    )
    .map(([key]) => key);
  const serviceModules = [...scanInfo.service.entries()]
    .filter(
      ([_, fileTypes]) =>
        fileTypes.has("template") ||
        fileTypes.has("unit") ||
        fileTypes.has("util") ||
        fileTypes.has("view") ||
        fileTypes.has("zone")
    )
    .map(([key]) => key);
  return `
export * as cnst from "./lib/cnst";
export { msg, Revert, usePage, fetch, sig, registerClient } from "./lib/useClient";
export { st, RootStore } from "./lib/st";
export * as store from "./lib/st";
${scalarModules.map((module) => `export { ${capitalize(module)} } from "./lib/__scalar/${module}";`).join("\n")}
${serviceModules.map((module) => `export { ${capitalize(module)} } from "./lib/_${module}";`).join("\n")}
${databaseModules.map((module) => `export { ${capitalize(module)} } from "./lib/${module}";`).join("\n")}
`;
}
