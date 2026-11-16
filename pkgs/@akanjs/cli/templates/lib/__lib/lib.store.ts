import type { AppInfo, LibInfo } from "akanjs";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const libInfos = [...scanInfo.getLibInfos().values()];
  const extendedModels = Object.fromEntries(
    [...scanInfo.file.store.databases]
      .map(
        (modelName) =>
          [
            modelName,
            libInfos.filter((libInfo) => libInfo.file.store.databases.has(modelName)).map((libInfo) => libInfo.name),
          ] as [string, string[]],
      )
      .filter(([_, libNames]) => libNames.length > 0),
  );
  return `
import * as base from "akanjs/store";
${Object.entries(extendedModels)
  .flatMap(([modelName, libNames]) =>
    libNames.map(
      (libName) =>
        `import { ${capitalize(modelName)}Store as ${libName}${capitalize(modelName)}Store } from "@libs/${libName}/lib/${modelName}/${modelName}.store";`,
    ),
  )
  .join("\n")}

${Object.entries(extendedModels)
  .map(([modelName, extendedModels]) => {
    const ModelName = capitalize(modelName);
    //? `store()` copies only a registered lib store's own actions, and an app store file can be imported before the lib's runtime.
    const registered = (libName: string) =>
      `base.StoreRegistry.get("${modelName}") === ${libName}${ModelName}Store ? ${libName}${ModelName}Store : base.StoreRegistry.register(${libName}${ModelName}Store)`;
    return `export const ${modelName} = {
  stores: [${extendedModels.map(registered).join(", ")}] as const,
}`;
  })
  .join("\n")}
`;
}
