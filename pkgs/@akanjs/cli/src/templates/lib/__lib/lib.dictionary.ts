import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const scanResult = scanInfo.getScanResult();
  const libs = scanResult.libDeps;
  const libInfos = scanInfo.getLibInfos();
  const extendedModels = Object.fromEntries(
    [...scanInfo.file.dictionary.databases]
      .map(
        (modelName) =>
          [
            modelName,
            [...libInfos.values()]
              .filter((libInfo) => libInfo.file.dictionary.databases.has(modelName))
              .map((libInfo) => libInfo.name),
          ] as [string, string[]]
      )
      .filter(([_, libNames]) => libNames.length > 0)
  );
  return `
${libs.length === 0 ? `import * as base from "@akanjs/dictionary";` : ""}
${libs.map((lib) => `import { dict as ${lib} } from "@${lib}/server";`).join("\n")}

${Object.entries(extendedModels)
  .map(([modelName, extendedModels]) => {
    return `export const ${modelName} = {
  dictionaries: [${extendedModels.map((libName) => `${libName}.${modelName}.dictionary`).join(", ")}] as const,
};`;
  })
  .join("\n")}

export const allLibs = [${libs.length === 0 ? "base.dictionary" : libs.map((lib) => `${lib}.dictionary`).join(", ")}] as const;
`;
}
