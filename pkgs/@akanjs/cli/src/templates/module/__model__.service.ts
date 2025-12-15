import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  Model: string;
  model: string;
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { serve } from "@akanjs/service";

import * as cnst from "../cnst";
import * as db from "../db";

export class ${dict.Model}Service extends serve(db.${dict.model}, () => ({})) {}
`;
}
