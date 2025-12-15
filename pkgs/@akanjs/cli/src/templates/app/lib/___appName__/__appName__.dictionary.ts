import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
  AppName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { serviceDictionary } from "@akanjs/dictionary";

import type { ${dict.AppName}Endpoint } from "./${dict.appName}.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<${dict.AppName}Endpoint>((fn) => ({}))
  .translate({});
`;
}
