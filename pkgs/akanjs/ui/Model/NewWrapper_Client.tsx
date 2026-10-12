"use client";
import type { GetStateObject } from "akanjs/base";
import { cn, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { ConstantRegistry } from "akanjs/constant";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";

import { agentAttrs } from "../agentAttrs";
import { type DraftProp, newDraftScope } from "./draftScope";
import { NewFormOrigin } from "./newFormOrigin";

interface NewWrapperProps<Full = any> {
  className?: string;
  children: ReactNode;
  slice: SliceMeta;
  partial?: Partial<Full>;
  setDefault?: boolean;
  modal?: string | null;
  resets?: string[] | null;
  namespace?: string;
  draft?: DraftProp;
}

export const NewWrapper_Client = <Full,>({
  children,
  slice,
  partial,
  setDefault,
  className,
  modal,
  resets,
  namespace,
  draft,
}: NewWrapperProps<Full>) => {
  const { path } = usePage();
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
  // The slice is the natural key; only a second trigger on the same screen (its own `partial`) needs a namespace.
  const newModel = st
    .tool(`${sliceName.replace(modelName, names.newModel)}${namespace ? `In${capitalize(namespace)}` : ""}`, {
      guard: () => (disabled ? `A ${modelName} form is already open.` : true),
    })
    .desc(`Open the form that creates a ${modelName}.`)
    .exec(() => {
      const cnst = ConstantRegistry.getDatabase(modelName);
      const crystal = new cnst.full().set(partial as unknown as GetStateObject<Full>) as unknown as Full;
      const draftScope = newDraftScope(draft, {
        seed: partial,
        modal: modal ?? "edit",
        sliceName,
        routePath: path,
      });
      NewFormOrigin.set(modelName, sliceName);
      void storeDo[names.newModel](crystal, { modal, setDefault, sliceName, draftScope });
      resets?.forEach((reset) => {
        void storeDo[`reset${capitalize(reset)}`]();
      });
    });
  return (
    <div
      className={cn(!disabled && "cursor-pointer", disabled && "pointer-events-none", className)}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        void newModel();
      }}
      {...agentAttrs(newModel)}
    >
      {children}
    </div>
  );
};
