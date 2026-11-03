import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../../../biomeForm";

interface Dict {
  appName: string;
  AppName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `import { serve } from "akanjs/service";

${BiomeForm.call("", `export class ${dict.AppName}Service extends serve`, [`"${dict.appName}" as const`, '{ serverMode: "batch" }', "() => ({})"], " {}")}
`;
}
