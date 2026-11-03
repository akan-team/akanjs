import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  [key: string]: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict = {}) {
  return `import { AkanOption } from "akanjs/server";

import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  //
};

export const option = new AkanOption<ModulesOptions>();
`;
}
