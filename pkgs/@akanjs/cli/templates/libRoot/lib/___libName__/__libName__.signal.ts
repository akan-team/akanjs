import { BiomeForm } from "../../../biomeForm";

interface Dict {
  libName: string;
  LibName: string;
}
export default function getContent(scanInfo: null, dict: Dict) {
  return `import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

${BiomeForm.callArgs("", `export class ${dict.LibName}Internal extends internal`, [`srv.${dict.libName}`, "() => ({})"], " {}")}

${BiomeForm.callArgs("", `export class ${dict.LibName}Endpoint extends endpoint`, [`srv.${dict.libName}`, "() => ({})"], " {}")}
`;
}
