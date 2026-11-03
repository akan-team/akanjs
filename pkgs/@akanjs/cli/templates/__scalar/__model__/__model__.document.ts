import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../../biomeForm";

interface Dict {
  model: string;
  Model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `import { by } from "akanjs/document";

import * as cnst from "./${dict.model}.constant";

${BiomeForm.callArgs("", `export class ${dict.Model} extends by`, [`cnst.${dict.Model}`], " {}")}
`;
}
