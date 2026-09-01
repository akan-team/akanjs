"use client";
import { ID } from "akanjs/base";
import { cn, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";

import { agentAttrs } from "../agentAttrs";
import { Popconfirm } from "../Popconfirm";

interface RemoveWrapperProps {
  className?: string;
  children: ReactNode;
  slice: SliceMeta;
  modelId: string;
  name: string;
  modal?: string | null;
}

export default function RemoveWrapper({ children, slice, name, modelId, className, modal }: RemoveWrapperProps) {
  const { l } = usePage();
  const { refName, sliceName } = slice;
  const modelName = refName;
  const names = {
    removeModel: `remove${capitalize(modelName)}`,
  };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  // The `remove` prefix turns on the approval card by default, which is the agent's half of the Popconfirm
  // this draws for a person.
  const removeModel = st
    .tool(names.removeModel)
    .desc(`Remove one ${modelName}.`)
    .arg("modelId", ID)
    .exec((id) => storeDo[names.removeModel](id, { modal }));
  return (
    <Popconfirm
      title={l("base.removeModel", { model: l(`${modelName}.modelName` as "base.new") })}
      description={<div>{l("base.sureToRemove", { model: l(`${modelName}.modelName` as "base.new"), name })}</div>}
      onConfirm={() => {
        void removeModel(modelId);
      }}
    >
      <div className={cn("cursor-pointer", className)} {...agentAttrs(removeModel)}>
        {children}
      </div>
    </Popconfirm>
  );
}
