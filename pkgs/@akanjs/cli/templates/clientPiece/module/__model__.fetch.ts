import type { AppInfo, LibInfo } from "akanjs";

interface PieceOwner {
  scope: string;
  module: string;
}

const hasSignal = (scanInfo: AppInfo | LibInfo, model: string): boolean =>
  !!(scanInfo.database.get(model) ?? scanInfo.service.get(model))?.has("signal") ||
  [...scanInfo.getLibInfos().values()].some((libInfo) => hasSignal(libInfo, model));

export default function getContent(
  scanInfo: AppInfo | LibInfo | null,
  dict: { [key: string]: string } = {},
  options: { [key: string]: unknown } = {},
) {
  if (!scanInfo || !hasSignal(scanInfo, dict.model)) return null;
  const libs = [...scanInfo.getLibInfos().values()].filter((libInfo) => hasSignal(libInfo, dict.model));
  const constants = options.constants as PieceOwner[] | undefined;
  const own = `${scanInfo.type}s/${scanInfo.name}`;
  const specifierOf = ({ scope, module }: PieceOwner) =>
    scope === own ? `./${module}.cnst` : `@${scope}/lib/__client/${module}.cnst`;
  const after = [...libs.map((_, index) => `lib${index}`), ...(constants ?? []).map((_, index) => `cnst${index}`)];
  return `
${after.length ? 'import { loadedAfter } from "akanjs/base";\n' : ""}import { FetchClient } from "akanjs/fetch";
${libs.map((libInfo, index) => `import { loaded as lib${index} } from "@libs/${libInfo.name}/lib/__client/${dict.model}.fetch";\n`).join("")}${constants ? constants.map((owner, index) => `import { ${owner.module} as cnst${index} } from "${specifierOf(owner)}";\n`).join("") : 'import * as cnst from "../cnst";\n'}import { fetch, sig } from "../usePage";
import { getSerializedSignalOf } from "../sig" with { type: "macro" };
import type * as signal from "../sig";

${after.length ? `loadedAfter(${after.join(", ")});\n` : ""}export const loaded = FetchClient.build<typeof signal>(${constants ? "{}" : "cnst"}, getSerializedSignalOf("${dict.model}"), { base: fetch }).sig;
Object.assign(sig, loaded);
`;
}
