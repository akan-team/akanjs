"use client";
import type { DataList } from "akanjs/base";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";
import { Model } from "../Model";
import { sliceNamesOf } from "../sliceNamesOf";

interface UnlistedEditModalProps {
  slice: SliceMeta;
  renderTitle: (model: any) => string | ReactNode;
  renderTemplate?: (props: any) => ReactNode | null;
}

//? Rows draw an editor only for the records they list, and a view opened from a link can be of one they do not.
export default function UnlistedEditModal({ slice, renderTitle, renderTemplate }: UnlistedEditModalProps) {
  const storeUse = st.use as unknown as { [key: string]: (option?: { agent: false }) => unknown };
  const storeSel = st.sel as <Ret>(selector: (state: unknown) => Ret) => Ret;
  const { names, namesOfSlice } = sliceNamesOf(slice.refName, slice.sliceName);
  const formId = storeSel(
    (state) => (state as { [key: string]: { id: string | null } })[`${slice.refName}Form`]?.id ?? null,
  );
  const modelList = storeUse[namesOfSlice.modelList]({ agent: false }) as DataList<{ id: string }>;
  const modelListLoading = storeUse[namesOfSlice.modelListLoading]({ agent: false }) as string | boolean;
  if (!formId || (!modelListLoading && modelList.has(formId))) return null;
  const Template = renderTemplate;
  return (
    <Model.EditModal key={formId} id={formId} slice={slice} renderTitle={renderTitle}>
      {Template ? <Template {...{ [names.modelId]: formId }} /> : null}
    </Model.EditModal>
  );
}
