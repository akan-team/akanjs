import type { AppInfo, LibInfo } from "akanjs";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

//? Every descriptor first: a store method may pick an endpoint by a name known only when it runs.
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = [...scanInfo.database.entries()]
    .filter(([_, fileTypes]) => fileTypes.has("store"))
    .map(([key]) => key);
  const serviceModules = [...scanInfo.service.entries()]
    .filter(([_, fileTypes]) => fileTypes.has("store"))
    .map(([key]) => key);
  const modules = [...databaseModules, ...serviceModules];
  const libs = scanInfo.getLibs();
  return `
import { loadedAfter } from "akanjs/base";
import { ${libs.length === 0 ? "RootStore as base, " : ""}StoreRegistry } from "akanjs/store";
${libs.map((lib) => `import { RootStore as ${lib} } from "@libs/${lib}/lib/__client/_st";`).join("\n")}

import { sig } from "./_useClient";
${modules.map((module) => `import { ${module} } from "./${module}.st";`).join("\n")}

${databaseModules.map((module) => `export { ${capitalize(module)}Store } from "../${module}/${module}.store";`).join("\n")}
${serviceModules.map((module) => `export { ${capitalize(module)}Store } from "../_${module}/${module}.store";`).join("\n")}
${modules.length > 0 ? `export { ${modules.join(", ")} };` : ""}

loadedAfter(sig);
export class RootStore extends StoreRegistry.merge("${scanInfo.name}" as const, ${[...(libs.length === 0 ? ["base"] : libs), ...modules].join(",\n  ")}) {}

export const st = StoreRegistry.build(RootStore);
`;
}
