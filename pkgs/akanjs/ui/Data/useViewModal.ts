"use client";
import { router } from "akanjs/client";
import { modelNames, stateSetterName } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { usePageLocation } from "akanjs/webkit";
import { useEffect, useRef, useState } from "react";

import { seedOpen } from "../../store/openSeq";

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

export const useViewModal = (slice: SliceMeta, { inUrl }: { inUrl: boolean }) => {
  const storeUse = st.use as unknown as { [key: string]: (option?: { agent: false }) => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: unknown[]) => Promise<void> | void };
  const { refName } = slice;
  const names = modelNames(refName);
  const setModelModal = stateSetterName(names.modelModal);
  const { searchParams } = usePageLocation() as { searchParams: SearchParams };
  const model = storeUse[names.model]({ agent: false }) as { id: string } | null;
  const modelModal = storeUse[names.modelModal]({ agent: false }) as string | null;
  const modelLoading = storeUse[names.modelLoading]({ agent: false }) as string | boolean;
  const [editedFrom, setEditedFrom] = useState<string | null>(null);
  //? An edit opened from the view goes back to it once closed, so until then the URL keeps naming the view.
  const isReturning = !!editedFrom && (modelModal === "edit" || (modelModal === null && model?.id === editedFrom));
  const urlId = inUrl && firstOf(searchParams.action) === "view" ? (firstOf(searchParams.modelId) ?? null) : null;
  const storeId =
    modelModal === "view"
      ? typeof modelLoading === "string" && modelLoading
        ? modelLoading
        : (model?.id ?? null)
      : isReturning
        ? editedFrom
        : null;
  useEffect(() => {
    if (!editedFrom || modelModal === "edit") return;
    setEditedFrom(null);
    if (isReturning) seedOpen(st, names.model, "view", { [names.modelModal]: "view" });
  }, [modelModal]);
  //? Two-way, so a side is followed only when it moved since the last agreement: the URL on mount and on a Link or
  //? back, the store when a row's view button or close changed it.
  const agreed = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!inUrl) return;
    if (urlId === storeId) {
      agreed.current = urlId;
      return;
    }
    if (agreed.current === undefined || urlId !== agreed.current) {
      agreed.current = urlId;
      if (!urlId) void storeDo[names.resetModel]();
      //? The action has already shown the error; closing writes the failed id out of the URL.
      else void Promise.resolve(storeDo[names.viewModel](urlId)).catch(() => storeDo[names.resetModel]());
      return;
    }
    agreed.current = storeId;
    void router.replace(hrefWithView(searchParams, storeId), { shallow: true, scrollToTop: false });
  }, [inUrl, urlId, storeId]);
  const editInView = (id: string) => {
    setEditedFrom(id);
    //? A form that failed to load never opened, so the view it was asked from comes back.
    void Promise.resolve(storeDo[names.editModel](id)).catch(() => storeDo[setModelModal]("view"));
  };
  return { editInView };
};
