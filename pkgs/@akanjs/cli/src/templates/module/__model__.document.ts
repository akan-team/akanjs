import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  Model: string;
  model: string;
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { beyond, by, from, into, type SchemaOf } from "@akanjs/document";

import * as cnst from "../cnst";

export class ${dict.Model}Filter extends from(cnst.${dict.Model}, (filter) => ({
  query: {},
  sort: {},
})) {}

export class ${dict.Model} extends by(cnst.${dict.Model}) {}

export class ${dict.Model}Model extends into(${dict.Model}, ${dict.Model}Filter, cnst.${dict.model}, () => ({})) {}

export class ${dict.Model}Middleware extends beyond(${dict.Model}Model, ${dict.Model}) {
  onSchema(schema: SchemaOf<${dict.Model}Model, ${dict.Model}>) {
    // schema.index({ status: 1 })
  }
}
`;
}
