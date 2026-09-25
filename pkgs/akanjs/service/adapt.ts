import { type Cls, INJECT_META } from "akanjs/base";
import { Logger } from "akanjs/common";
import { type ExtractInjectInfoObject, type InjectBuilder, type InjectInfo, injectionBuilder } from "./injectInfo";

export interface Adaptor {
  readonly logger: Logger;
  onInit(): Promise<void>;
  onDestroy(): Promise<void>;
}

export type AdaptorCls<
  Methods = any,
  // biome-ignore lint/complexity/noBannedTypes: `{}` keeps un-injected adaptor classes assignable.
  InjectMap extends Record<string, InjectInfo> = {},
> = Cls<
  Methods & ExtractInjectInfoObject<InjectMap> & Adaptor,
  { readonly [INJECT_META]: InjectMap; readonly refName: string }
>;

export function adapt<Name extends string>(name: Name): AdaptorCls;

export function adapt<Name extends string, Injection extends InjectBuilder<"use" | "env" | "memory" | "plug">>(
  name: Name,
  injectBuilder: Injection,
  // biome-ignore lint/complexity/noBannedTypes: `{}` preserves adaptor method inference for generated class types.
): AdaptorCls<{}, ReturnType<Injection>>;

export function adapt(name: string, injectBuilder?: InjectBuilder) {
  const injectInfoMap = injectBuilder?.(injectionBuilder(name)) ?? {};
  class Adaptor {
    readonly logger = new Logger(name);
    static readonly [INJECT_META] = injectInfoMap;
    static readonly refName = name;
    async onInit() {
      //
    }
    async onDestroy() {
      //
    }
  }
  return Adaptor;
}

export function dangerouslyAdapt<Name extends string, Injection extends InjectBuilder>(
  name: Name,
  injectBuilder: Injection,
  // biome-ignore lint/complexity/noBannedTypes: `{}` preserves adaptor method inference for generated class types.
): AdaptorCls<{}, ReturnType<Injection>>;
export function dangerouslyAdapt(name: string, injectBuilder?: InjectBuilder) {
  return adapt(name, injectBuilder as InjectBuilder<"use" | "env" | "memory" | "plug">);
}
