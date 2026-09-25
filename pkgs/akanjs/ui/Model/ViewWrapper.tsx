"use client";
import { ID } from "akanjs/base";
import { cn } from "akanjs/client";
import { capitalize } from "akanjs/common";
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
  const { refName, sliceName } = slice;
  const modelName = refName;
  const names = {
    viewModel: `view${capitalize(modelName)}`,
  };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const viewModel = st
    .tool(names.viewModel)
    .desc(`Open one ${modelName} in the detail view.`)
    .arg("modelId", ID)
    .exec((id) => {
      void storeDo[names.viewModel](id, { modal });
      resets?.forEach((reset) => {
        void storeDo[`reset${capitalize(reset)}`]();
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
