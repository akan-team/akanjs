// eslint-disable-next-line @akanjs/lint/useClientByFile
import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const databaseModules = [...scanInfo.database.entries()]
    .filter(([_, fileTypes]) => fileTypes.has("store"))
    .map(([key]) => key);
  const serviceModules = [...scanInfo.service.entries()]
    .filter(([_, fileTypes]) => fileTypes.has("store"))
    .map(([key]) => key);
  return `
"use client";
import { st as baseSt, StoreOf } from "@akanjs/store";
import { MixStore, storeInfo } from "@akanjs/store";

import { libStores } from "./__lib/lib.store";
${databaseModules.map((module) => `import { ${capitalize(module)}Store } from "./${module}/${module}.store";`).join("\n")}
${serviceModules.map((module) => `import { ${capitalize(module)}Store } from "./_${module}/${module}.store";`).join("\n")}

${databaseModules.map((module) => `export { ${capitalize(module)}Store } from "./${module}/${module}.store";`).join("\n")}
${serviceModules.map((module) => `export { ${capitalize(module)}Store } from "./_${module}/${module}.store";`).join("\n")}

${databaseModules.map((module) => `export const ${module} = storeInfo.register("${module}" as const, ${capitalize(module)}Store);`).join("\n")}
${serviceModules.map((module) => `export const ${module} = storeInfo.register("${module}" as const, ${capitalize(module)}Store);`).join("\n")}

export class RootStore extends MixStore(...libStores, ${[...databaseModules, ...serviceModules].join(",\n  ")}) {}
  
export const st = baseSt as StoreOf<RootStore>;
`;
}
