"use client";
import { ID } from "akanjs/base";
import { cn } from "akanjs/client";
import { modelNames } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";

import { agentAttrs } from "../agentAttrs";

interface ViewWrapperProps {
  className?: string;
  children: ReactNode;
  slice: SliceMeta;
  modelId: string;
  modal?: string | null;
  resets?: string[] | null;
}

export default function ViewWrapper({ children, slice, modelId, className, modal, resets }: ViewWrapperProps) {
  const { refName: modelName } = slice;
  const names = modelNames(modelName);
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const viewModel = st
    .tool(names.viewModel, { taint: "exempt" })
    .desc(`Open one ${modelName} in the detail view.`)
    .arg("modelId", ID)
    .exec((id) => {
      void storeDo[names.viewModel](id, { modal });
      resets?.forEach((reset) => {
        void storeDo[modelNames(reset).resetModel]();
      });
    });
  return (
    <div
      className={cn("cursor-pointer", className)}
      onClick={(e) => {
        e.stopPropagation();
        void viewModel(modelId);
      }}
      {...agentAttrs(viewModel)}
    >
      {children}
    </div>
  );
}
