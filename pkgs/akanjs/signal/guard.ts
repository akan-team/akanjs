import type { Cls, PromiseOrObject } from "akanjs/base";
import type { SignalContext } from "./signalContext";

export interface Guard {
  canPass(context: SignalContext): PromiseOrObject<boolean>;
}

/**
 * `account` reads only the caller, so a listing may evaluate it with no arguments; `resource` needs the call's
 * arguments and fails closed without them. Required on a hand-written guard: unmarked, every listing would show it.
 */
export type GuardScope = "account" | "resource";

/** `static agents = false` marks a guard that admits no model: the MCP catalogue refuses every endpoint it guards. */
export type GuardCls<Name extends string = string> = Cls<
  Guard,
  { readonly name: Name; readonly scope: GuardScope; readonly agents?: boolean }
>;

export const refusesAgents = (guards: readonly GuardCls[] | undefined): boolean =>
  !!guards?.some((GuardCls) => GuardCls.agents === false);

/** Starts as `scope = "account"`, the side that errs hidden, and refuses until `canPass` is overridden. */
export const guard = <T extends string>(name: T): GuardCls<T> => {
  return class Guard {
    static name = name;
    static scope: GuardScope = "account";
    canPass(context: SignalContext): PromiseOrObject<boolean> {
      return false;
    }
  };
};

// Guards are side-effect free and safe to re-run, so one instance per class serves every call. Built on first use:
// a guard may be declared long before the container it reads from is up.
const instances = new WeakMap<GuardCls, Guard>();
export const guardOf = (GuardCls: GuardCls): Guard => {
  const cached = instances.get(GuardCls);
  if (cached) return cached;
  const guard = new GuardCls();
  instances.set(GuardCls, guard);
  return guard;
};
