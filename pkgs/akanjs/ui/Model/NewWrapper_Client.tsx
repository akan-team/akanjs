"use client";
import type { GetStateObject } from "akanjs/base";
import { clsx } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { ConstantRegistry } from "akanjs/constant";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";

interface NewWrapperProps<Full = any> {
  className?: string;
  children: ReactNode;
  slice: SliceMeta;
  partial?: Partial<Full>;
  setDefault?: boolean;
  modal?: string | null;
  resets?: string[] | null;
}

export const NewWrapper_Client = <Full,>({
  children,
  slice,
  partial,
  setDefault,
  className,
  modal,
  resets,
}: NewWrapperProps<Full>) => {
  const { refName, sliceName } = slice;
  const modelName = refName;
  const names = {
    newModel: `new${capitalize(modelName)}`,
    crystalizeModel: `crystalize${capitalize(modelName)}`,
    modelModal: `${modelName}Modal`,
  };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const storeUse = st.use as { [key: string]: () => unknown };
  const modelModal = storeUse[names.modelModal]() as string | null;
  const disabled = modelModal === "edit";
  return (
    <div
      className={clsx({ "cursor-pointer": !disabled, "pointer-events-none": disabled }, className)}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        const cnst = ConstantRegistry.getDatabase(modelName);
        const crystal = new cnst.full().set(partial as unknown as GetStateObject<Full>) as unknown as Full;
        void storeDo[names.newModel](crystal, { modal, setDefault, sliceName });
        resets?.forEach((reset) => {
          void storeDo[`reset${capitalize(reset)}`]();
        });
      }}
    >
      {children}
    </div>
  );
};
