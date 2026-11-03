import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

interface Dict {
  Model: string;
  model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  const { Model, model } = dict;
  return `import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

${BiomeForm.callArgs("", `export class ${Model}Internal extends internal`, [`srv.${model}`, "() => ({})"], " {}")}

${BiomeForm.callArgs("", `export class ${Model}Endpoint extends endpoint`, [`srv.${model}`, "({ query, mutation }) => ({})"], " {}")}
`;
}
