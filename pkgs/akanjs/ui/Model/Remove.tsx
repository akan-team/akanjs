"use client";
import { clsx, msg, router, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { type ReactNode, useMemo, useState } from "react";

import { Button } from "../Button";
import { Modal } from "../Modal";

interface RemoveProps {
  className?: string;
  name?: string;
  modelId: string;
  slice: SliceMeta;
  modal?: string | null;
  redirect?: string;
  children: ReactNode;
}
export default function Remove({ className, name, modelId, slice, modal, redirect, children }: RemoveProps) {
  const { l } = usePage();
  const [modalOpen, setModalOpen] = useState(false);
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const { refName, sliceName } = slice;
  const modelName = refName;
  const names = useMemo(
    () => ({
      removeModel: `remove${capitalize(modelName)}`,
    }),
    [],
  );
  return (
    <>
      <div
        className={clsx("cursor-pointer", className)}
        onClick={(e) => {
          e.stopPropagation();
          setModalOpen(true);
        }}
      >
        {children}
      </div>
      <Modal
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
        }}
        title={
          <div className="font-bold text-error text-lg">
            {l("base.removeModel", { model: l(`${modelName}.modelName` as "base.new") })}
          </div>
        }
        action={
          <Button
            className="btn btn-warning w-full"
            onClick={async (e, { onError }) => {
              await storeDo[names.removeModel](modelId, { onError, modal });
              msg.success("base.removeSuccess", { data: { model: l(`${modelName}.modelName` as "base.new") } });
              setModalOpen(false);
              if (!redirect) return;
              if (redirect === "back") router.back();
              else router.push(redirect);
            }}
          >
            {l("base.yesRemove", { model: l(`${modelName}.modelName` as "base.new") })}
          </Button>
        }
      >
        <div className="flex w-full items-center justify-center">
          {l("base.sureToRemove", { model: l(`${modelName}.modelName` as "base.new"), name: name ?? "" })}
        </div>
      </Modal>
    </>
  );
}
