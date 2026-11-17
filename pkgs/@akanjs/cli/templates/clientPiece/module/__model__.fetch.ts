import type { AppInfo, LibInfo } from "akanjs";

const hasSignal = (scanInfo: AppInfo | LibInfo, model: string): boolean =>
  !!(scanInfo.database.get(model) ?? scanInfo.service.get(model))?.has("signal") ||
  [...scanInfo.getLibInfos().values()].some((libInfo) => hasSignal(libInfo, model));

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo || !hasSignal(scanInfo, dict.model)) return null;
  const libs = [...scanInfo.getLibInfos().values()].filter((libInfo) => hasSignal(libInfo, dict.model));
  const after = libs.map((_, index) => `lib${index}`);
  return `
${after.length ? 'import { loadedAfter } from "akanjs/base";\n' : ""}import { FetchClient } from "akanjs/fetch";
${libs.map((libInfo, index) => `import { loaded as lib${index} } from "@libs/${libInfo.name}/lib/__client/${dict.model}.fetch";\n`).join("")}import * as cnst from "../cnst";
import { fetch, sig } from "../usePage";
import { getSerializedSignalOf } from "../sig" with { type: "macro" };
import type * as signal from "../sig";

${after.length ? `loadedAfter(${after.join(", ")});\n` : ""}export const loaded = FetchClient.build<typeof signal>(cnst, getSerializedSignalOf("${dict.model}"), { base: fetch }).sig;
Object.assign(sig, loaded);
`;
}
