import type { AppInfo, LibInfo } from "akanjs";

//? `fetch` and `sig` are declared, not re-exported: the barrel rewrite maps a re-export to `./usePage`, skipping these.
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  const signalModules = scanInfo
    ? [...scanInfo.database.entries(), ...scanInfo.service.entries()]
        .filter(([_, files]) => files.has("signal"))
        .map(([module]) => module)
    : [];
  return `
import "./__client/_base.fetch";
${signalModules.map((module) => `import "./__client/${module}.fetch";`).join("\n")}
import { fetch as pageFetch, sig as pageSig } from "./usePage";

export const fetch = pageFetch;
export const sig = pageSig;
export { Err, msg, runtime, usePage } from "./usePage";
`;
}
