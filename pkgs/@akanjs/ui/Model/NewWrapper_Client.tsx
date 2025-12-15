"use client";
import { clsx } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import { constantInfo } from "@akanjs/constant";
import { st } from "@akanjs/store";
import type { ReactNode } from "react";

interface NewWrapperProps<Full = any> {
  className?: string;
  children: ReactNode;
  sliceName: string;
  partial?: Partial<Full>;
  setDefault?: boolean;
  modal?: string | null;
  resets?: string[] | null;
}

export const NewWrapper_Client = <Full,>({
  children,
  sliceName,
  partial,
  setDefault,
  className,
  modal,
  resets,
}: NewWrapperProps<Full>) => {
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const modelName = refName;
  const names = {
    newModel: `new${capitalize(modelName)}`,
    crystalizeModel: `crystalize${capitalize(modelName)}`,
    modelModal: `${modelName}Modal`,
  };
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const storeUse = st.use as { [key: string]: () => unknown };
  const cnst = constantInfo.getDatabase(modelName);
  const crystalizeModel = cnst.crystalize as (model: Full) => Full;
  const modelModal = storeUse[names.modelModal]() as string | null;
  const disabled = modelModal === "edit";
  return (
    <div
      className={clsx({ "cursor-pointer": !disabled, "pointer-events-none": disabled }, className)}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        const crystal = crystalizeModel(partial as Full);
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
