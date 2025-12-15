interface Dict {
  libName: string;
  LibName: string;
}
export default function getContent(scanInfo: null, dict: Dict) {
  return `
import { serve } from "@akanjs/service";

// import type * as srv from "../srv";

export class ${dict.LibName}Service extends serve("${dict.libName}" as const, { serverMode: "batch" }, () => ({})) {}
  `;
}
