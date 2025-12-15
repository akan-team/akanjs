import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  [key: string]: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict = {}) {
  return `
import { Middleware, useGlobals } from "@akanjs/server";

import type { LibOptions } from "./__lib/lib.service";

export type ModulesOptions = LibOptions & {
  //
};

export const registerGlobalModule = (options: ModulesOptions) => {
  return useGlobals({
    uses: {},
    useAsyncs: {},
  });
};

export const registerGlobalMiddlewares = (options: ModulesOptions) => {
  return [] as Middleware[];
};

  `;
}
