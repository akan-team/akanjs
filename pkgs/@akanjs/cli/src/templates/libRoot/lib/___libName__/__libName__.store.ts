interface Dict {
  libName: string;
  LibName: string;
}
export default function getContent(scanInfo: null, dict: Dict) {
  return `
import { store } from "@akanjs/store";

export class ${dict.LibName}Store extends store("${dict.libName}" as const, {
  // state
}) {
  // action
}
  `;
}
