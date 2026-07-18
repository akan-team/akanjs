import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  Model: string;
  model: string;
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { by, from, into } from "akanjs/document";

import * as cnst from "../cnst";

export class ${dict.Model}Filter extends from(cnst.${dict.Model}, (filter) => ({
  query: {},
  sort: {},
})) {}

export class ${dict.Model} extends by(cnst.${dict.Model}) {}

export class ${dict.Model}Model extends into(${dict.Model}, ${dict.Model}Filter, cnst.${dict.model}, () => ({})) {}
`;
}
