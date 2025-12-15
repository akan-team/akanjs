"use client";
import { clsx, msg, router, usePage } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import { st } from "@akanjs/store";
import { ReactNode, useMemo, useState } from "react";

import { Button } from "../Button";
import { Modal } from "../Modal";

interface RemoveProps {
  className?: string;
  name?: string;
  modelId: string;
  sliceName: string;
  modal?: string | null;
  redirect?: string;
  children: ReactNode;
}
export default function Remove({ className, name, modelId, sliceName, modal, redirect, children }: RemoveProps) {
  const { l } = usePage();
  const [modalOpen, setModalOpen] = useState(false);
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const modelName = refName;
  const names = useMemo(
    () => ({
      removeModel: `remove${capitalize(modelName)}`,
    }),
    []
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
          <div className="text-error text-lg font-bold">
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
