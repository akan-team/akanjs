import type { AppInfo, LibInfo } from "akanjs";

const signalModulesOf = (scanInfo: AppInfo | LibInfo): string[] => [
  ...[...scanInfo.getLibInfos().values()].flatMap(signalModulesOf),
  ...[...scanInfo.database.entries(), ...scanInfo.service.entries()]
    .filter(([_, files]) => files.has("signal"))
    .map(([module]) => module),
];

//? Libs' modules come first, so the pieces apply in the order of the scope's whole signal.
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (!scanInfo) return null;
  const modules = [...new Set(signalModulesOf(scanInfo))];
  return `
import { loadedAfter } from "akanjs/base";
import { loaded as base } from "./_base.fetch";
${modules.map((module, index) => `import { loaded as module${index} } from "./${module}.fetch";`).join("\n")}
import { fetch as pageFetch, sig as pageSig } from "../usePage";

loadedAfter(${["base", ...modules.map((_, index) => `module${index}`)].join(", ")});
export const fetch = pageFetch;
export const sig = pageSig;
export { Err, msg, runtime, usePage } from "../usePage";
`;
}
