import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const libs = scanInfo.getLibs();
  const libInfos = [...scanInfo.getLibInfos().values()];
  const extendedModels = Object.fromEntries(
    [...scanInfo.file.store.databases]
      .map(
        (modelName) =>
          [
            modelName,
            libInfos.filter((libInfo) => libInfo.file.store.databases.has(modelName)).map((libInfo) => libInfo.name),
          ] as [string, string[]]
      )
      .filter(([_, libNames]) => libNames.length > 0)
  );
  return `
import * as base from "@akanjs/store";
${libs.map((lib) => `import { store as ${lib} } from "@${lib}/client";`).join("\n")}

${Object.entries(extendedModels)
  .map(([modelName, extendedModels]) => {
    const ModelName = capitalize(modelName);
    return `export const ${modelName} = {
  stores: [${extendedModels.map((libName) => `${libName}.${ModelName}Store`).join(", ")}] as const,
}`;
  })
  .join("\n")}

export const libStores = [${[...libs, "base"].map((lib) => `${lib}.RootStore`).join(", ")}] as const;
`;
}
