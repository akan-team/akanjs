import type { Base } from "@akanjs/signal";

import { serve } from "./serviceDecorators";
import { serviceInfo } from "./serviceInfo";
import { ServiceModule } from "./serviceModule";

export class BaseService extends serve("base" as const, ({ generate, signal }) => ({
  onCleanup: generate<(() => Promise<void>) | undefined>((env) => env.onCleanup ?? undefined),
  baseSignal: signal<Base>(),
})) {
  publishPing() {
    this.baseSignal.pubsubPing("ping");
  }
  async cleanup() {
    if (!this.onCleanup) throw new Error("onCleanup is not defined");
    await this.onCleanup();
  }
}

export const allSrvs = serviceInfo.registerServices({ BaseService });
export const srv = {
  base: new ServiceModule("base", { BaseService }),
};
