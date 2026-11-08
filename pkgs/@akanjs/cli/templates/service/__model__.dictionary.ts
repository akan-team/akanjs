import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  Model: string;
  model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  const { Model } = dict;
  return `import { serviceDictionary } from "akanjs/dictionary";

import type { ${Model}Endpoint } from "../sig";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<${Model}Endpoint>((fn) => ({}))
  .error({})
  .translate({});
`;
}
