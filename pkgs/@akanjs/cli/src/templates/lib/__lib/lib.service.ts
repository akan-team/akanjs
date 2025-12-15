import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const libs = scanInfo.getLibs();
  const libInfos = [...scanInfo.getLibInfos().values()];
  const extendedModels = Object.fromEntries(
    [...scanInfo.file.service.databases]
      .map(
        (modelName) =>
          [
            modelName,
            libInfos.filter((libInfo) => libInfo.file.service.databases.has(modelName)).map((libInfo) => libInfo.name),
          ] as [string, string[]]
      )
      .filter(([_, libNames]) => libNames.length > 0)
  );

  return `
${libs.length ? `import { serve, Srv } from "@akanjs/service";` : `import type { BackendEnv } from "@akanjs/base";`}
${libs.map((lib) => `import { option as ${lib}Option, srv as ${lib} } from "@${lib}/server";`).join("\n")}

import * as db from "../db";
import type * as srv from "../srv";

${libs.map((lib) => `export { srv as ${lib} } from "@${lib}/server";`).join("\n")}

${Object.entries(extendedModels)
  .map(([modelName, extendedModels]) => {
    const ModelName = capitalize(modelName);
    return `export const ${modelName} = {
  services: [${extendedModels.map((libName) => `${libName}.${ModelName}Service`).join(", ")}] as const,
}`;
  })
  .join("\n")}

export const libAllSrvs = { ${libs.map((lib) => `...${lib}.allSrvs`).join(", ")} };

export type LibOptions = ${libs.length ? libs.map((lib) => `${lib}Option.ModulesOptions`).join(" & ") : "BackendEnv"};
`;
}
