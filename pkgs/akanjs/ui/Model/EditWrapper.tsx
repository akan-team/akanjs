"use client";
import { clsx } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";

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
  return (
    <div
      className={clsx("cursor-pointer", className)}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        void storeDo[names.editModel](modelId, { modal });
        resets?.forEach((reset) => {
          void storeDo[`reset${capitalize(reset)}`]();
        });
      }}
    >
      {children}
    </div>
  );
}
