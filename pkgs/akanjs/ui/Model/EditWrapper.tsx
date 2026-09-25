"use client";
import { ID } from "akanjs/base";
import { cn } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";

import { agentAttrs } from "../agentAttrs";

interface EditWrapperProps {
  className?: string;
  children: ReactNode;
  slice: SliceMeta;
  modelId: string;
  modal?: string | null;
  disabled?: boolean;
  resets?: string[] | null;
}

export default function EditWrapper({
  children,
  slice,
  modelId,
  className,
  modal,
  disabled,
  resets,
}: EditWrapperProps) {
  const { refName, sliceName } = slice;
  const modelName = refName;
  const names = {
    editModel: `edit${capitalize(modelName)}`,
  };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  // A list mounts one of these per row, and every one of them registers this name. That is interchangeable
  // rather than a collision because the id rides in the argument instead of the closure, which is what `shared`
  // declares — a tool closing over its own row would let last-wins edit the wrong one.
  const editModel = st
    .tool(disabled ? null : names.editModel)
    .desc(`Open one ${modelName} in the edit form.`)
    .arg("modelId", ID)
    .exec((id) => {
      void storeDo[names.editModel](id, { modal });
      resets?.forEach((reset) => {
        void storeDo[`reset${capitalize(reset)}`]();
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
