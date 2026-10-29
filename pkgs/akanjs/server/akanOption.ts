import type { BackendEnv, PromiseOrObject } from "akanjs/base";
import type { Adaptor, AdaptorCls, LlmOption } from "akanjs/service";
import type {
  AgentQuotaHook,
  AgentRequestPolicy,
  AgentUsageHook,
  CrossSiteOption,
  GuardCls,
  MiddlewareCls,
  RateLimitSetting,
} from "akanjs/signal";
import type { McpServerOption } from "./akanServer";
import type { WebProxyRegistration } from "./proxy";
import { HostBasePathWebProxy, LocaleWebProxy } from "./proxy";

export interface AdaptorOverride {
  role: AdaptorCls;
  adaptor: AdaptorCls;
}

export class AkanOption<Env extends BackendEnv = BackendEnv> {
  readonly #getUses: ((env: Env) => Record<string, PromiseOrObject<unknown>>)[] = [];
  readonly #middlewares: MiddlewareCls[] = [];
  readonly #adaptorOverrides: AdaptorOverride[] = [];
  readonly #webProxies: WebProxyRegistration[] = [];
  readonly #getLlms: ((env: Env) => LlmOption)[] = [];
  #getMcp: ((env: Env) => boolean | McpServerOption) | undefined;
  #agentAccess: GuardCls | GuardCls[] | null | undefined;
  #agentRequestPolicy: AgentRequestPolicy | null | undefined;
  #agentUsage: AgentUsageHook | null | undefined;
  #agentQuota: AgentQuotaHook | null | undefined;
  #crossSite: CrossSiteOption | undefined;
  #getRateLimit: ((env: Env) => RateLimitSetting | false) | undefined;
  use(fnOrObject: ((env: Env) => Record<string, PromiseOrObject<unknown>>) | Record<string, PromiseOrObject<unknown>>) {
    if (typeof fnOrObject === "function")
      this.#getUses.push(fnOrObject as (env: Env) => Record<string, PromiseOrObject<unknown>>);
    else this.#getUses.push(() => fnOrObject);
    return this;
  }
  applyMiddleware(...middlewares: MiddlewareCls[]) {
    this.#middlewares.push(...middlewares);
    return this;
  }
  /** Rebinds a predefined adaptor role (e.g. `LlmAdaptorRole`) to the app's own implementation. Last writer wins. */
  applyAdaptor<T extends Adaptor>(role: AdaptorCls<T>, adaptor: AdaptorCls<T>) {
    this.#adaptorOverrides.push({ role: role as AdaptorCls, adaptor: adaptor as AdaptorCls });
    return this;
  }
  applyWebProxy(...proxies: WebProxyRegistration[]) {
    this.#webProxies.push(...proxies);
    return this;
  }
  /** Merged over the `AKAN_MCP_*` env and under the constructor option; the app's `option.ts` wins over its libs'. */
  setMcp(mcpOrFn: boolean | McpServerOption | ((env: Env) => boolean | McpServerOption) = true) {
    this.#getMcp = typeof mcpOrFn === "function" ? mcpOrFn : () => mcpOrFn;
    return this;
  }
  /** Guards for the `runAgentTurn` relay: with none every call is refused, several are ANDed, `null` clears a lib's. */
  setAgentAccess(guards: GuardCls | GuardCls[] | null) {
    this.#agentAccess = guards;
    return this;
  }
  /**
   * Sees each relayed turn after the access guard, before the quota and the model, and returns the request to send: a
   * server-fixed lead to `instructions`, an allowlist of tools, caps. A thrown `Err` refuses it; `null` clears a lib's.
   */
  setAgentRequestPolicy(policy: AgentRequestPolicy | null) {
    this.#agentRequestPolicy = policy;
    return this;
  }
  /** Called once per relayed turn with the provider's token counts, after the answer is sent; `null` clears a lib's. */
  setAgentUsage(hook: AgentUsageHook | null) {
    this.#agentUsage = hook;
    return this;
  }
  /** Asked before a turn spends the key; `false` refuses it with `agent.error.quotaExceeded`. */
  setAgentQuota(hook: AgentQuotaHook | null) {
    this.#agentQuota = hook;
    return this;
  }
  /** Extra origins that may drive a mutation beyond the serving one and native shells; the gate is on by default. */
  setCrossSite(crossSite: CrossSiteOption) {
    this.#crossSite = crossSite;
    return this;
  }
  /**
   * Endpoint budgets: a default for endpoints that declare none, overrides by endpoint key, and who `by: "account"`
   * counts. Merged in mount order, the app's last; `AKAN_RATE_LIMIT=off` still turns them all off.
   */
  setRateLimit(settingOrFn: RateLimitSetting | false | ((env: Env) => RateLimitSetting | false)) {
    this.#getRateLimit = typeof settingOrFn === "function" ? settingOrFn : () => settingOrFn;
    return this;
  }
  /** Injected into the `LlmAdaptorRole` adaptor as the `llmOption` use; merged in mount order, the app's last. */
  setLlm<Option extends LlmOption>(llmOrFn: Option | ((env: Env) => Option)) {
    if (typeof llmOrFn === "function") this.#getLlms.push(llmOrFn);
    else this.#getLlms.push(() => llmOrFn);
    return this;
  }
  /** Every entry in declaration order, duplicates kept: the boot stage rejects a key claimed twice. */
  getUses(env: Env): [string, PromiseOrObject<unknown>][] {
    return this.#getUses.flatMap((fn) => Object.entries(fn(env)));
  }
  getMiddlewares(): MiddlewareCls[] {
    return this.#middlewares;
  }
  getAdaptorOverrides(): AdaptorOverride[] {
    return this.#adaptorOverrides;
  }
  getWebProxies(): WebProxyRegistration[] {
    return this.#webProxies;
  }
  getMcp(env: Env): boolean | McpServerOption | undefined {
    return this.#getMcp?.(env);
  }
  getAgentAccess(): GuardCls | GuardCls[] | null | undefined {
    return this.#agentAccess;
  }
  getAgentRequestPolicy(): AgentRequestPolicy | null | undefined {
    return this.#agentRequestPolicy;
  }
  getAgentUsage(): AgentUsageHook | null | undefined {
    return this.#agentUsage;
  }
  getAgentQuota(): AgentQuotaHook | null | undefined {
    return this.#agentQuota;
  }
  getCrossSite(): CrossSiteOption | undefined {
    return this.#crossSite;
  }
  getRateLimit(env: Env): RateLimitSetting | false | undefined {
    return this.#getRateLimit?.(env);
  }
  getLlm(env: Env): LlmOption {
    return Object.assign({}, ...this.#getLlms.map((fn) => fn(env)));
  }
}

export function createDefaultAkanOption() {
  return new AkanOption().applyWebProxy(LocaleWebProxy, HostBasePathWebProxy);
}
