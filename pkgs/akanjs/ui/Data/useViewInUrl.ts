"use client";
import { router } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { usePageLocation } from "akanjs/webkit";
import { useEffect, useRef } from "react";

type SearchParams = Record<string, string | string[] | undefined>;
const firstOf = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const hrefWithView = (searchParams: SearchParams, modelId: string | null) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "modelId" || (key === "action" && firstOf(value) === "view")) continue;
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  if (modelId) {
    params.set("action", "view");
    params.set("modelId", modelId);
  }
  const search = params.toString();
  return `${router.getPath()}${search ? `?${search}` : ""}`;
};

//? Two-way, so a side is followed only when it moved since the last agreement: the URL on mount and on a Link or
//? back, the store when a row's view button or close changed it.
export const useViewInUrl = (slice: SliceMeta, enabled: boolean) => {
  const storeUse = st.use as unknown as { [key: string]: (option?: { agent: false }) => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: unknown[]) => Promise<void> | void };
  const { refName } = slice;
  const names = { view: `view${capitalize(refName)}`, reset: `reset${capitalize(refName)}` };
  const { searchParams } = usePageLocation() as { searchParams: SearchParams };
  const model = storeUse[refName]({ agent: false }) as { id: string } | null;
  const modelModal = storeUse[`${refName}Modal`]({ agent: false }) as string | null;
  const modelLoading = storeUse[`${refName}Loading`]({ agent: false }) as string | boolean;
  const urlId = enabled && firstOf(searchParams.action) === "view" ? (firstOf(searchParams.modelId) ?? null) : null;
  const storeId =
    modelModal === "view"
      ? typeof modelLoading === "string" && modelLoading
        ? modelLoading
        : (model?.id ?? null)
      : null;
  const agreed = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    if (urlId === storeId) {
      agreed.current = urlId;
      return;
    }
    if (agreed.current === undefined || urlId !== agreed.current) {
      agreed.current = urlId;
      if (!urlId) void storeDo[names.reset]();
      //? The action has already shown the error; closing writes the failed id out of the URL.
      else void Promise.resolve(storeDo[names.view](urlId)).catch(() => storeDo[names.reset]());
      return;
    }
    agreed.current = storeId;
    void router.replace(hrefWithView(searchParams, storeId), { shallow: true, scrollToTop: false });
  }, [enabled, urlId, storeId]);
};
