import type { BackendEnv, PromiseOrObject } from "akanjs/base";
import type { Adaptor, AdaptorCls, LlmOption } from "akanjs/service";
import type { AgentQuotaHook, AgentUsageHook, CrossSiteOption, GuardCls, MiddlewareCls } from "akanjs/signal";
import type { McpServerOption } from "./akanServer";
import type { WebProxyRegistration } from "./proxy";
import { HostBasePathWebProxy, LocaleWebProxy } from "./proxy";

export interface AdaptorOverride {
  role: AdaptorCls;
  adaptor: AdaptorCls;
}

/**
 * App/library server option builder: use objects, signal middleware, adaptor overrides, web proxies, and the
 * server settings an app owns — MCP, the agent relay's access guards, and the LLM the relay speaks to.
 */
export class AkanOption<Env extends BackendEnv = BackendEnv> {
  readonly #getUses: ((env: Env) => Record<string, PromiseOrObject<unknown>>)[];
  readonly #middlewares: MiddlewareCls[] = [];
  readonly #adaptorOverrides: AdaptorOverride[] = [];
  readonly #webProxies: WebProxyRegistration[] = [];
  readonly #getLlms: ((env: Env) => LlmOption)[] = [];
  #getMcp: ((env: Env) => boolean | McpServerOption) | undefined;
  #agentAccess: GuardCls | GuardCls[] | null | undefined;
  #agentUsage: AgentUsageHook | null | undefined;
  #agentQuota: AgentQuotaHook | null | undefined;
  #crossSite: CrossSiteOption | undefined;
  constructor() {
    this.#getUses = [];
  }
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
  /**
   * MCP server settings for the app mounting this option, merged over the `AKAN_MCP_*` environment and under an
   * option the server is constructed with. The app's own `option.ts` is the last lib the server reads, so it wins
   * over every library it depends on. The function form receives the server env, for a setting derived from it —
   * a token verifier built on the app's signing secret, the issuer an authorization server publishes under.
   */
  setMcp(mcpOrFn: boolean | McpServerOption | ((env: Env) => boolean | McpServerOption) = true) {
    this.#getMcp = typeof mcpOrFn === "function" ? mcpOrFn : () => mcpOrFn;
    return this;
  }
  /**
   * Who may spend the LLM key through the `runAgentTurn` relay, named as the guards any other endpoint would
   * name. With none the call is refused — the same answer `None` gives — because the framework has no account
   * model to gate on. Several are ANDed; `null` clears what a library set.
   */
  setAgentAccess(guards: GuardCls | GuardCls[] | null) {
    this.#agentAccess = guards;
    return this;
  }
  /**
   * Called once per relayed turn with the provider's token counts, after the answer is on its way — for a ledger
   * or a bill. `null` clears what a library set.
   */
  setAgentUsage(hook: AgentUsageHook | null) {
    this.#agentUsage = hook;
    return this;
  }
  /** Asked before a turn spends the key; `false` refuses it with `agent.error.quotaExceeded`. */
  setAgentQuota(hook: AgentQuotaHook | null) {
    this.#agentQuota = hook;
    return this;
  }
  /**
   * Which other origins may drive a mutation, on top of the one serving the request and the native shells.
   * Needed only by a browser client hosted somewhere else — a separate admin domain, a partner embed. The gate
   * itself is on by default and `{ enabled: false }` is for an API no browser reaches.
   */
  setCrossSite(crossSite: CrossSiteOption) {
    this.#crossSite = crossSite;
    return this;
  }
  /**
   * Settings for whichever adaptor fills `LlmAdaptorRole`, injected into it as the `llmOption` use.
   *
   * The argument is generic so that whatever an adaptor needs beyond `LlmOption` travels here too: an adaptor an
   * app or a library wrote declares its own interface extending it, reads it with `use<MyLlmOption>()`, and its
   * region or project id rides the same channel the shipped fields do. Entries merge in mount order with the
   * app's last, so a library may name a host and the app the key.
   */
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
  getAgentUsage(): AgentUsageHook | null | undefined {
    return this.#agentUsage;
  }
  getAgentQuota(): AgentQuotaHook | null | undefined {
    return this.#agentQuota;
  }
  getCrossSite(): CrossSiteOption | undefined {
    return this.#crossSite;
  }
  getLlm(env: Env): LlmOption {
    return Object.assign({}, ...this.#getLlms.map((fn) => fn(env)));
  }
}

export function createDefaultAkanOption() {
  return new AkanOption().applyWebProxy(LocaleWebProxy, HostBasePathWebProxy);
}
