import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../../../biomeForm";

interface Dict {
  appName: string;
  AppName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

${BiomeForm.call("", `export class ${dict.AppName}Internal extends internal`, [`srv.${dict.appName}`, "() => ({})"], " {}")}

${BiomeForm.call("", `export class ${dict.AppName}Endpoint extends endpoint`, [`srv.${dict.appName}`, "() => ({})"], " {}")}
`;
}
