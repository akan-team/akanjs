import type { AppInfo, LibInfo } from "@akanjs/devkit";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const libs = scanInfo.getLibs();
  const libInfos = [...scanInfo.getLibInfos().values()];
  const extendedModels = Object.fromEntries(
    [...scanInfo.file.signal.databases]
      .map(
        (modelName) =>
          [
            modelName,
            libInfos.filter((libInfo) => libInfo.file.signal.databases.has(modelName)).map((libInfo) => libInfo.name),
          ] as [string, string[]]
      )
      .filter(([_, libNames]) => libNames.length > 0)
  );
  return `
${libs.length > 0 ? "" : `import { fetch as baseFetch } from "@akanjs/signal";`}
${libs.map((lib) => `import { sig as ${lib} } from "@${lib}/server";`).join("\n")}

${Object.entries(extendedModels)
  .map(([modelName, extendedModels]) => {
    const ModelName = capitalize(modelName);
    return `export const ${modelName} = {
  internals: [${extendedModels.map((libName) => `${libName}.${ModelName}Internal`).join(", ")}] as const,
  slices: [${extendedModels.map((libName) => `${libName}.${ModelName}Slice`).join(", ")}] as const,
  endpoints: [${extendedModels.map((libName) => `${libName}.${ModelName}Endpoint`).join(", ")}] as const,
}`;
  })
  .join("\n")}

export const root = ${libs.length ? libs[0] : "baseFetch"};
export const libFetches = [${libs.length ? libs.map((lib) => `${lib}.fetch`).join(", ") : "baseFetch"}] as const;
`;
}
