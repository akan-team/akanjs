import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../../biomeForm";

interface Dict {
  model: string;
  Model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `import { via } from "akanjs/constant";

${BiomeForm.call("", `export class ${dict.Model} extends via`, ["(field) => ({\n  field: field(String),\n})"], " {}")}
`;
}
