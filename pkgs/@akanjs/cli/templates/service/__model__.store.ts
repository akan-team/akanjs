import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

interface Dict {
  Model: string;
  model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `import { store } from "akanjs/store";

${BiomeForm.call("", `export class ${dict.Model}Store extends store`, [`"${dict.model}" as const`, "() => ({\n  // state\n})"], " {")}
  // action
}
`;
}
