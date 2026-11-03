import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

interface Dict {
  Model: string;
  model: string;
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  const { Model, model } = dict;
  return `import { by, from, into } from "akanjs/document";

import * as cnst from "../cnst";

${BiomeForm.callArgs("", `export class ${Model}Filter extends from`, [`cnst.${Model}`, "(filter) => ({\n  query: {},\n  sort: {},\n})"], " {}")}

${BiomeForm.callArgs("", `export class ${Model} extends by`, [`cnst.${Model}`], " {}")}

${BiomeForm.callArgs("", `export class ${Model}Model extends into`, [Model, `${Model}Filter`, `cnst.${model}`, "() => ({})"], " {}")}
`;
}
