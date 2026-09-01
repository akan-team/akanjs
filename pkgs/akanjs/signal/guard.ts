import type { Cls, PromiseOrObject } from "akanjs/base";
import type { SignalContext } from "./signalContext";

export interface Guard {
  canPass(context: SignalContext): PromiseOrObject<boolean>;
}

/**
 * What a guard needs in order to answer. `account` reads the caller and nothing else, so it can be evaluated
 * with no arguments — which is what lets a catalogue hide what the caller certainly cannot use. `resource` needs
 * the call's arguments and fails closed without them, so evaluating one early would erase legitimate entries.
 *
 * Required, with no default. Exposure is decided by a guard rather than by an opt-in, so an unmarked guard would
 * silently take the `resource` path and list its endpoint to every caller — the whole guarded surface's names,
 * refused only at call time. There is no safe guess here, so the author states it.
 */
export type GuardScope = "account" | "resource";

export type GuardCls<Name extends string = string> = Cls<Guard, { readonly name: Name; readonly scope: GuardScope }>;

/** Creates a named guard base class for signal access checks. */
export const guard = <T extends string>(name: T): GuardCls<T> => {
  return class Guard {
    static name = name;
    static scope: GuardScope = "account";
    canPass(context: SignalContext): PromiseOrObject<boolean> {
      return true;
    }
  };
};

/**
 * Guards read everything from the context they are handed and are already required to be side-effect free and
 * safe to re-run — `SignalResolver.revalidateWsRooms` re-runs them outside of any request — so one instance per
 * class serves every call instead of one per guard per request. Built on first use, not at registration: a guard
 * may be declared long before the container it reads from is up.
 */
const instances = new WeakMap<GuardCls, Guard>();
export const guardOf = (GuardCls: GuardCls): Guard => {
  const cached = instances.get(GuardCls);
  if (cached) return cached;
  const guard = new GuardCls();
  instances.set(GuardCls, guard);
  return guard;
};
