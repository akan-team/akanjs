"use client";
import { ID } from "akanjs/base";
import { cn } from "akanjs/client";
import { modelNames } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";

import { agentAttrs } from "../agentAttrs";
import { type DraftProp, editDraftScope } from "./draftScope";

interface EditWrapperProps {
  className?: string;
  children: ReactNode;
  slice: SliceMeta;
  modelId: string;
  modal?: string | null;
  disabled?: boolean;
  resets?: string[] | null;
  /** Draft recovery for the form this opens. `false` turns it off; a string names the scope explicitly. */
  draft?: DraftProp;
}

export default function EditWrapper({
  children,
  slice,
  modelId,
  className,
  modal,
  disabled,
  resets,
  draft,
}: EditWrapperProps) {
  const { refName: modelName } = slice;
  const names = modelNames(modelName);
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  // Every row registers this name; the id rides in the argument, not the closure, so the copies are interchangeable.
  const editModel = st
    .tool(disabled ? null : names.editModel)
    .desc(`Open one ${modelName} in the edit form.`)
    .arg("modelId", ID)
    .exec((id) => {
      void storeDo[names.editModel](id, { modal, draftScope: editDraftScope(draft, id) });
      resets?.forEach((reset) => {
        void storeDo[modelNames(reset).resetModel]();
      });
    });
  return (
    <div
      className={cn("cursor-pointer", className)}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        void editModel(modelId);
      }}
      {...agentAttrs(editModel)}
    >
      {children}
    </div>
  );
}
