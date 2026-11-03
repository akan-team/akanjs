interface Dict {
  libName: string;
}
export default function getContent(scanInfo: null, dict: Dict) {
  return `import type { LibConfig } from "akanjs";

const config: LibConfig = {};

export default config;
`;
}
