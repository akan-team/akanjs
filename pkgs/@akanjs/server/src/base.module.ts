import type { BackendEnv } from "@akanjs/base";
import { allSrvs, BaseService } from "@akanjs/service";
import { BaseSignal } from "@akanjs/signal";

import { serviceModuleOf } from "./module";

export const registerBaseModule = (option: BackendEnv) => {
  return serviceModuleOf(
    {
      signal: BaseSignal,
      service: BaseService,
    },
    allSrvs
  );
};
