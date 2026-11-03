import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `import { store } from "akanjs/store";

import { sig } from "../useClient";

${BiomeForm.call("", `export class ${dict.Model}Store extends store`, [`sig.${dict.model}`, "() => ({\n  // state\n})"], " {")}
  // action
}
`;
}
