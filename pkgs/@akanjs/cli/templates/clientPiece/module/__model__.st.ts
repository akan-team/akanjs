import type { AppInfo, LibInfo } from "akanjs";

interface PieceOwner {
  scope: string;
  module: string;
}

//? An extended lib store is registered by its own piece first: `store()` copies the lib store's actions as it extends it.
export default function getContent(
  scanInfo: AppInfo | LibInfo | null,
  dict: { [key: string]: string } = {},
  options: { [key: string]: unknown } = {},
) {
  const isDatabase = !!scanInfo?.database.has(dict.model);
  const files = isDatabase ? scanInfo?.database.get(dict.model) : scanInfo?.service.get(dict.model);
  if (!scanInfo || !files?.has("store")) return null;
  const libs = isDatabase
    ? [...scanInfo.getLibInfos().values()].filter((libInfo) => libInfo.file.store.databases.has(dict.model))
    : [];
  const storePath = `../${isDatabase ? "" : "_"}${dict.model}/${dict.model}.store`;
  //? `store()` reads another module's descriptor while the class is defined: the upload setters, the file module's.
  const descriptorsFirst = (dict.descriptorsFirst ?? "").split(",").filter(Boolean);
  const fetched = [...descriptorsFirst, ...(files.has("signal") ? [dict.model] : [])];
  //? `store()` reads its model from the registry while the class is defined, signal or not.
  const registration = options.registration as PieceOwner | undefined;
  const own = `${scanInfo.type}s/${scanInfo.name}`;
  const registrationOf = ({ scope, module }: PieceOwner) =>
    scope === own ? `./${module}.cnst` : `@${scope}/lib/__client/${module}.cnst`;
  const after = [
    ...(registration ? ["cnst0"] : []),
    ...fetched.map((_, index) => `fetch${index}`),
    ...libs.map((_, index) => `lib${index}`),
  ];
  return `
${after.length ? 'import { loadedAfter } from "akanjs/base";\n' : ""}import { StoreRegistry } from "akanjs/store";
${registration ? `import { loaded as cnst0 } from "${registrationOf(registration)}";\n` : ""}${fetched.map((module, index) => `import { loaded as fetch${index} } from "./${module}.fetch";\n`).join("")}${libs.map((libInfo, index) => `import { ${dict.model} as lib${index} } from "@libs/${libInfo.name}/lib/__client/${dict.model}.st";\n`).join("")}import { ${dict.Model}Store } from "${storePath}";

${after.length ? `loadedAfter(${after.join(", ")});\n` : ""}export const ${dict.model} = StoreRegistry.register(${dict.Model}Store);
StoreRegistry.build(StoreRegistry.merge("${dict.model}" as const, ${dict.model}));
`;
}
