import { getRequest, InternalParamPipe } from "@akanjs/nest";
import { type Account as SerAccount } from "@akanjs/signal";
import { ExecutionContext } from "@nestjs/common";
import { Me as BaseMe, Self as BaseSelf } from "@shared/base";

export class Account implements InternalParamPipe {
  getParam(context: ExecutionContext) {
    const { account } = getRequest(context) as { account: SerAccount };
    return account;
  }
}

export class Self implements InternalParamPipe {
  getParam(context: ExecutionContext) {
    const { account } = getRequest(context) as { account: SerAccount<{ self?: BaseSelf }> };
    const self = account.self;
    return self ?? null;
  }
}

export class Me implements InternalParamPipe {
  getParam(context: ExecutionContext) {
    const { account } = getRequest(context) as { account: SerAccount<{ me?: BaseMe }> };
    const me = account.me;
    return me ?? null;
  }
}
