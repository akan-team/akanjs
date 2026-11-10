import { AgentAccounts, AgentMeter, AgentRelayPolicy } from "akanjs/service";
import { AgentRelayAccess } from "../signal/guards";
import type { AkanOption } from "./akanOption";

export class AgentHooks {
  static apply(option: AkanOption) {
    const access = option.getAgentAccess();
    if (access !== undefined) AgentRelayAccess.use(access);
    const policy = option.getAgentRequestPolicy();
    if (policy !== undefined) AgentRelayPolicy.use(policy);
    const [usage, quota] = [option.getAgentUsage(), option.getAgentQuota()];
    if (usage !== undefined || quota !== undefined) AgentMeter.use({ usage, quota });
    const resolver = option.getAgentAccountResolver();
    if (resolver !== undefined) AgentAccounts.use(resolver);
  }
}
