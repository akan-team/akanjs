import type { AppInfo, LibInfo } from "akanjs";
import { BiomeForm } from "../biomeForm";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  const { Model } = dict;
  return `import { via } from "akanjs/constant";

${BiomeForm.callArgs("", `export class ${Model}Input extends via`, ["(field) => ({\n  name: field(String),\n})"], " {}")}

${BiomeForm.callArgs("", `export class ${Model}Object extends via`, [`${Model}Input`, "(field) => ({})"], " {}")}

${BiomeForm.callArgs("", `export class Light${Model} extends via`, [`${Model}Object`, '["name"] as const', "(resolve) => ({})"], " {}")}

${BiomeForm.callArgs("", `export class ${Model} extends via`, [`${Model}Object`, `Light${Model}`, "(resolve) => ({})"], " {}")}

${BiomeForm.callArgs("", `export class ${Model}Insight extends via`, [Model, "(field) => ({})"], " {}")}
`;
}
