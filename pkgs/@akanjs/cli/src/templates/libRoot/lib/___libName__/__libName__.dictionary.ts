interface Dict {
  libName: string;
  LibName: string;
}
export default function getContent(scanInfo: null, dict: Dict) {
  return `
import { serviceDictionary } from "@akanjs/dictionary";

import type { ${dict.LibName}Endpoint } from "./${dict.libName}.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<${dict.LibName}Endpoint>((fn) => ({}))
  .translate({});
`;
}
