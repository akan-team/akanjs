import type { Me as BaseMe, Self as BaseSelf } from "@libs/shared/common";
import type { InternalArg, SignalContext } from "akanjs/signal";
import type { SerAccount } from "./account";

export class Account implements InternalArg {
  getArg(context: SignalContext) {
    return context.get<SerAccount>("account");
  }
}

export class Self implements InternalArg {
  getArg(context: SignalContext) {
    return context.get<SerAccount<{ self?: BaseSelf }>>("account")?.self ?? null;
  }
}

export class Me implements InternalArg {
  getArg(context: SignalContext) {
    return context.get<SerAccount<{ me?: BaseMe }>>("account")?.me ?? null;
  }
}
