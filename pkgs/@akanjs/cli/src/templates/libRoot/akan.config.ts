interface Dict {
  libName: string;
}
export default function getContent(scanInfo: null, dict: Dict) {
  return `
import type { LibConfig } from "@akanjs/config";

const config: LibConfig = {};

export default config;
  `;
}
