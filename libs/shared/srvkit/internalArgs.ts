import type { InternalArg, SignalContext } from "akanjs/signal";
import { Err } from "../lib/dict";
import { isAgentCall } from "./agentCall";
import { accountOf } from "./callerAccount";
import { SignupToken } from "./signupToken";

export class Account implements InternalArg {
  getArg(context: SignalContext) {
    return accountOf(context);
  }
}

export class Self implements InternalArg {
  getArg(context: SignalContext) {
    return accountOf(context)?.self ?? null;
  }
}

export class Me implements InternalArg {
  getArg(context: SignalContext) {
    return accountOf(context)?.me ?? null;
  }
}

/** `.with(AgentCall)` hands the endpoint `true` when a model is driving the call, as `isAgentCall` judges it. */
export class AgentCall implements InternalArg<boolean> {
  getArg(context: SignalContext): boolean {
    return isAgentCall(context);
  }
}

/** The prepare user whose signup token the call carries in its `signupToken` argument; 401 without a valid one. */
export class SignupUserId implements InternalArg<Promise<string>> {
  async getArg(context: SignalContext): Promise<string> {
    const userId = await SignupToken.userIdOf(context);
    if (!userId) throw new Err("user.error.invalidSignupToken", undefined, { statusCode: 401 });
    return userId;
  }
}
