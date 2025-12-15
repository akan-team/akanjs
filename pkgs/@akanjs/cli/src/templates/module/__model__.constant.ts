import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { via } from "@akanjs/constant";

export class ${dict.Model}Input extends via((field) => ({
  field: field(String).optional(),
})) {}

export class ${dict.Model}Object extends via(${dict.Model}Input, (field) => ({})) {}

export class Light${dict.Model} extends via(${dict.Model}Object, [] as const, (resolve) => ({})) {}

export class ${dict.Model} extends via(${dict.Model}Object, Light${dict.Model}, (resolve) => ({})) {}

export class ${dict.Model}Insight extends via(${dict.Model}, (field) => ({})) {}
`;
}
