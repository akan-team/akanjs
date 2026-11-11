import { capitalize, type FetchPolicy, modelNames, sliceNames } from "akanjs/common";
import { type BaseObject, ConstantRegistry } from "akanjs/constant";
import { type FetchProxy, restoreRemoteError } from "akanjs/fetch";
import type { SerializedSlice } from "akanjs/signal";
import type { ErrorReportOption } from "./actionOption";
import { makeFormDrafts } from "./formDrafts";
import { makeModelListPatches } from "./modelListPatch";
import { makeModelWriteGuard } from "./modelWriteGuard";
import { servedEndpointOf } from "./servedEndpointOf";
import { sliceKeysOf } from "./sliceKeys";

export type ReportingFetchPolicy = Omit<FetchPolicy, "onError"> & ErrorReportOption;

export const modelActionContextOf = (
  refName: string,
  slice: { [key: string]: SerializedSlice },
  fetch: FetchProxy<any>,
) => {
  const className = capitalize(refName);
  const cnst = ConstantRegistry.getDatabase(refName);
  const modelRef = cnst.full;
  const slices = Object.entries(slice).map(([suffix, serializedSlice]) => {
    const keys = sliceKeysOf(refName, suffix);
    return { sliceName: keys.slice, keys, slice: serializedSlice };
  });
  const { modelInsight, modelList, modelListLoading } = sliceNames(refName).state;
  const names = { ...modelNames(refName), Model: className, modelInsight, modelList, modelListLoading };
  // A save while a file is still uploading would store the form without it.
  const isUploadingIn = (state: { [key: string]: any }) =>
    Object.keys(state[names.modelFormUploading] as object).length > 0;
  const defaultKeyOf = (sliceName: string) => capitalize(sliceName).replace(names.Model, names.defaultModel);
  // A back-navigation replays the pre-write RSC payload; this stamp makes `Load.Units` refetch on re-hydration.
  const staleAtOfSlices = () => {
    const staleAt = new Date();
    return Object.fromEntries(slices.map(({ keys }) => [keys.state.modelStaleAt, staleAt]));
  };
  const updatedAtOf = (model: BaseObject): string | null => {
    const updatedAt = (model as unknown as { updatedAt?: { toISOString?: () => string } }).updatedAt;
    return typeof updatedAt?.toISOString === "function" ? updatedAt.toISOString() : null;
  };
  const servedFetch = <T>(key: string) => {
    const fn = servedEndpointOf<(...args: any[]) => Promise<T>>(fetch, key);
    if (fn) return fn;
    throw restoreRemoteError({ error: "base.error.endpointClosed", data: { endpoint: key } }, 404);
  };
  return {
    refName,
    fetch,
    cnst,
    modelRef,
    slices,
    names,
    isUploadingIn,
    defaultKeyOf,
    staleAtOfSlices,
    updatedAtOf,
    servedFetch,
    ...makeModelWriteGuard(names),
    ...makeFormDrafts(refName, names),
    ...makeModelListPatches({ cnst, names, slices }),
  };
};

export type ModelActionContext = ReturnType<typeof modelActionContextOf>;
export type SliceEntry = ModelActionContext["slices"][number];
