import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  model: string;
  Model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { by } from "@akanjs/document";

import * as cnst from "./${dict.model}.constant";

export class ${dict.Model} extends by(cnst.${dict.Model}) {}
`;
}
