import type { Base } from "akanjs/signal";
import { serve } from "./serve";
import { ServiceModel } from "./serviceModule";

export class BaseService extends serve("base" as const, ({ env, signal, memory }) => ({
  onCleanup: env(({ onCleanup }: { onCleanup?: () => Promise<void> }) => onCleanup),
  baseSignal: signal<Base>(),
})) {
  publishPing() {
    this.baseSignal.pubsubPing("ping");
  }
}

export const srv = { base: new ServiceModel(BaseService) };
