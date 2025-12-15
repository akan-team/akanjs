import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const libs = scanInfo.getLibs();
  const libInfos = [...scanInfo.getLibInfos().values()];
  const extendedModels = Object.fromEntries(
    [...scanInfo.file.document.databases]
      .map(
        (modelName) =>
          [
            modelName,
            libInfos.filter((libInfo) => libInfo.file.document.databases.has(modelName)).map((libInfo) => libInfo.name),
          ] as [string, string[]]
      )
      .filter(([_, libNames]) => libNames.length > 0)
  );
  return `
${libs.map((lib) => `import { db as ${lib} } from "@${lib}/server";`).join("\n")}
${libs.map((lib) => `export { db as ${lib} } from "@${lib}/server";`).join("\n")}

${Object.entries(extendedModels)
  .map(
    ([modelName, extendedModels]) =>
      `export const ${modelName} = {
  inputs: [${extendedModels.map((libName) => `${libName}.${modelName}.Input`).join(", ")}] as const,
  docs: [${extendedModels.map((libName) => `${libName}.${modelName}.Doc`).join(", ")}] as const,
  models: [${extendedModels.map((libName) => `${libName}.${modelName}.Model`).join(", ")}] as const,
  filters: [${extendedModels.map((libName) => `${libName}.${modelName}.Filter`).join(", ")}] as const,
}`
  )
  .join("\n")}
export const allLibs = [${libs.join(", ")}] as const;
`;
}
