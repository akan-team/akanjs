import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  const isDatabase = !!scanInfo?.database.has(dict.model);
  const files = isDatabase ? scanInfo?.database.get(dict.model) : scanInfo?.service.get(dict.model);
  if (!files?.has("store")) return null;
  const storePath = `../${isDatabase ? "" : "_"}${dict.model}/${dict.model}.store`;
  return `
${files.has("signal") ? `import "./${dict.model}.fetch";\n` : ""}import { StoreRegistry } from "akanjs/store";
import { ${dict.Model}Store } from "${storePath}";

export const ${dict.model} = StoreRegistry.register(${dict.Model}Store);
StoreRegistry.build(StoreRegistry.merge("${dict.model}" as const, ${dict.model}));
`;
}
