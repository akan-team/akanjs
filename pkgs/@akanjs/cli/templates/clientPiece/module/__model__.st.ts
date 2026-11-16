import type { AppInfo, LibInfo } from "akanjs";

//? An extended lib store is registered by its own piece first: `store()` copies the lib store's actions as it extends it.
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  const isDatabase = !!scanInfo?.database.has(dict.model);
  const files = isDatabase ? scanInfo?.database.get(dict.model) : scanInfo?.service.get(dict.model);
  if (!scanInfo || !files?.has("store")) return null;
  const libs = isDatabase
    ? [...scanInfo.getLibInfos().values()].filter((libInfo) => libInfo.file.store.databases.has(dict.model))
    : [];
  const storePath = `../${isDatabase ? "" : "_"}${dict.model}/${dict.model}.store`;
  return `
${files.has("signal") ? `import "./${dict.model}.fetch";\n` : ""}${libs.map((libInfo) => `import "@libs/${libInfo.name}/lib/__client/${dict.model}.st";\n`).join("")}import { StoreRegistry } from "akanjs/store";
import { ${dict.Model}Store } from "${storePath}";

export const ${dict.model} = StoreRegistry.register(${dict.Model}Store);
StoreRegistry.build(StoreRegistry.merge("${dict.model}" as const, ${dict.model}));
`;
}
