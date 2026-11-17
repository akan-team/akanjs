import type { AppInfo, LibInfo } from "akanjs";

interface PieceOwner {
  scope: string;
  module: string;
}

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

//? Each lib's piece of the same model registers first, so the class this scope declares is the one `cnst` hands out.
export default function getContent(
  scanInfo: AppInfo | LibInfo | null,
  dict: { [key: string]: string } = {},
  options: { [key: string]: unknown } = {},
) {
  const { model, Model = capitalize(dict.model ?? "") } = dict;
  const scalar = !!scanInfo?.getScalarModules().includes(model);
  if (!scanInfo || !model || (!scalar && !scanInfo.getDatabaseModules().includes(model))) return null;
  const own = `${scanInfo.type}s/${scanInfo.name}`;
  const { libs = [], named = [] } = options as { libs?: PieceOwner[]; named?: PieceOwner[] };
  const specifierOf = ({ scope, module }: PieceOwner) =>
    scope === own ? `./${module}.cnst` : `@${scope}/lib/__client/${module}.cnst`;
  const before = [
    ...libs.map((owner, index) => ({ owner, name: `lib${index}` })),
    ...named.map((owner, index) => ({ owner, name: `named${index}` })),
  ];
  const register = scalar
    ? `ConstantRegistry.buildScalar("${model}" as const, cnst.${Model}, cnst, "${scanInfo.name}")`
    : `ConstantRegistry.buildModel("${model}" as const, cnst.${Model}Input, cnst.${Model}Object, cnst.${Model}, cnst.Light${Model}, cnst.${Model}Insight, cnst, "${scanInfo.name}")`;
  return `
${before.length ? 'import { loadedAfter } from "akanjs/base";\n' : ""}import { ConstantRegistry } from "akanjs/constant";
${before.map(({ owner, name }) => `import { ${owner.module} as ${name} } from "${specifierOf(owner)}";\n`).join("")}import * as cnst from "../${scalar ? `__scalar/${model}` : model}/${model}.constant";

${before.length ? `loadedAfter(${before.map(({ name }) => name).join(", ")});\n` : ""}export const ${model} = ${register};
export { ${model} as loaded };
`;
}
