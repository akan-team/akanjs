import { type Environment, getEnv, type SLICE_META } from "akanjs/base";
import type { DatabaseSignal } from "akanjs/signal";
import type { SliceMeta } from "./fetchType/appliedReturn.type";

/** Account data made available to services for the current app/environment. */
export type Account<AddData = unknown> = {
  appName: string;
  environment: Environment;
} & AddData;
export const getDefaultAccount = (): Account => {
  const env = getEnv();
  return { appName: env.appName, environment: env.environment };
};

type GetSliceMetaObjFromSignal<Signal> = Signal extends {
  _SliceMetaObj: infer SliceMetaObj extends Record<string, SliceMeta>;
}
  ? SliceMetaObj
  : Signal extends DatabaseSignal
    ? {
        [K in `${Signal["slice"]["baseName"]}${Capitalize<keyof Signal["slice"][typeof SLICE_META] & string>}`]: SliceMeta;
      }
    : Record<never, never>;
export type GetSliceMetaObjFromDatabaseSignals<
  Signals extends readonly unknown[],
  Acc extends Record<string, SliceMeta> = Record<never, never>,
> = Signals extends readonly [infer First, ...infer Rest]
  ? GetSliceMetaObjFromDatabaseSignals<Rest, Acc & GetSliceMetaObjFromSignal<First>>
  : Acc;
