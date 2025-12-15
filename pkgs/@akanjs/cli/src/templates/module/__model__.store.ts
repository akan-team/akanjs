import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { store } from "@akanjs/store";

import { sig } from "../useClient";

export class ${dict.Model}Store extends store(sig.${dict.model}, {
  // state
}) {
  // action
}
`;
}
