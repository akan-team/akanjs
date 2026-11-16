import type { AppInfo, LibInfo } from "akanjs";

const hasSignal = (scanInfo: AppInfo | LibInfo, model: string): boolean =>
  !!(scanInfo.database.get(model) ?? scanInfo.service.get(model))?.has("signal") ||
  [...scanInfo.getLibInfos().values()].some((libInfo) => hasSignal(libInfo, model));

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo || !hasSignal(scanInfo, dict.model)) return null;
  const libs = [...scanInfo.getLibInfos().values()].filter((libInfo) => hasSignal(libInfo, dict.model));
  return `
${libs.map((libInfo) => `import "@libs/${libInfo.name}/lib/__client/${dict.model}.fetch";\n`).join("")}import { FetchClient } from "akanjs/fetch";
import * as cnst from "../cnst";
import { fetch, sig } from "../usePage";
import { getSerializedSignalOf } from "../sig" with { type: "macro" };
import type * as signal from "../sig";

Object.assign(sig, FetchClient.build<typeof signal>(cnst, getSerializedSignalOf("${dict.model}"), { base: fetch }).sig);
`;
}
