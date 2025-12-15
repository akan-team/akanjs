"use client";
import { clsx } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import { st } from "@akanjs/store";
import type { ReactNode } from "react";

interface EditWrapperProps {
  className?: string;
  children: ReactNode;
  sliceName: string;
  modelId: string;
  modal?: string | null;
  resets?: string[] | null;
}

export default function EditWrapper({ children, sliceName, modelId, className, modal, resets }: EditWrapperProps) {
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const modelName = refName;
  const names = {
    editModel: `edit${capitalize(modelName)}`,
  };
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  return (
    <div
      className={clsx("cursor-pointer", className)}
      onClick={(e) => {
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
