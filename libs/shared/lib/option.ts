import { generateHost } from "@akanjs/nest";
import { Middleware, useGlobals } from "@akanjs/server";
import { getSsoProviders } from "@shared/nest";

import type { LibOptions } from "./__lib/lib.service";

export interface AccountInfo {
  accountId: string;
  password: string;
}

export type ModulesOptions = LibOptions & {
  rootAdminInfo: AccountInfo;
};

export const registerGlobalModule = (options: ModulesOptions) => {
  return useGlobals({
    uses: { rootAdminInfo: options.rootAdminInfo },
    useAsyncs: {},
    providers: [...getSsoProviders(generateHost(options), options.security.sso)],
  });
};

export const registerGlobalMiddlewares = (options: ModulesOptions) => {
  return [] as Middleware[];
};
