import { type Cls, INJECT_META } from "akanjs/base";
import { Logger } from "akanjs/common";
import { type ExtractInjectInfoObject, type InjectBuilder, type InjectInfo, injectionBuilder } from "akanjs/service";
import type { SignalContext } from "./signalContext";

export type InterceptorCls<Methods = {}, InjectMap extends { [key: string]: InjectInfo } = {}> = Cls<
  Methods &
    ExtractInjectInfoObject<InjectMap> & {
      readonly logger: Logger;
      onInit(): Promise<void>;
      onDestroy(): Promise<void>;
      intercept(context: SignalContext): AsyncGenerator<unknown> | Promise<unknown>;
    },
  { readonly [INJECT_META]: InjectMap; readonly refName: string }
>;

export function intercept<Name extends string>(name: Name): InterceptorCls;

export function intercept<Name extends string, Injection extends InjectBuilder<"use" | "env" | "memory">>(
  refName: Name,
  injectBuilder: Injection,
): InterceptorCls<{}, ReturnType<Injection>>;

export function intercept(refName: string, injectBuilder?: InjectBuilder) {
  const injectInfoMap = injectBuilder?.(injectionBuilder(refName)) ?? {};
  return class Interceptor {
    static readonly refName = refName;
    static readonly [INJECT_META] = injectInfoMap;

    readonly logger = new Logger(refName);
    intercept(context: SignalContext): AsyncGenerator | Promise<(res: Response) => Promise<Response>> {
      return Promise.resolve((res: Response) => Promise.resolve(res));
    }
    async onInit() {
      //
    }
    async onDestroy() {
      //
    }
  };
}
