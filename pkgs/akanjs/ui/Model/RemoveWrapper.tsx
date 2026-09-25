"use client";
import { clsx, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";

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
  return (
    <Popconfirm
      title={l("base.removeModel", { model: l(`${modelName}.modelName` as "base.new") })}
      description={<div>{l("base.sureToRemove", { model: l(`${modelName}.modelName` as "base.new"), name })}</div>}
      onConfirm={() => {
        void storeDo[names.removeModel](modelId, { modal });
      }}
    >
      <div className={clsx("cursor-pointer", className)}>{children}</div>
    </Popconfirm>
  );
}
