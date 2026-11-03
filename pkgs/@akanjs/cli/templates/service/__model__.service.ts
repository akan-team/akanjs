import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

interface Dict {
  Model: string;
  model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `import { serve } from "akanjs/service";

${BiomeForm.callArgs("", `export class ${dict.Model}Service extends serve`, [`"${dict.model}" as const`, "({ use, service, env, signal }) => ({})"], " {}")}
`;
}
