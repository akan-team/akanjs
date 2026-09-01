"use client";
import { ID } from "akanjs/base";
import { cn, msg, router, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { type ReactNode, useMemo, useState } from "react";

import { agentAttrs } from "../agentAttrs";
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
  const removeModel = async (id: string, { onError }: { onError?: (e: string) => void } = {}) => {
    await storeDo[names.removeModel](id, { onError, modal });
    msg.success("base.removeSuccess", { data: { model: l(`${modelName}.modelName` as "base.new") } });
    setModalOpen(false);
    if (!redirect) return;
    if (redirect === "back") router.back();
    else router.push(redirect);
  };
  // The confirmation this draws is a modal; the agent's is the approval card the `remove` prefix turns on. Both
  // land on the same removal, and the id rides in the argument so a per-row copy of this stays interchangeable.
  const removeTool = st
    .tool(names.removeModel)
    .desc(`Remove one ${modelName}.`)
    .arg("modelId", ID)
    .exec((id) => removeModel(id));
  return (
    <>
      <div
        className={cn("cursor-pointer", className)}
        {...agentAttrs(removeTool)}
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
          <div className="font-bold text-destructive text-lg">
            {l("base.removeModel", { model: l(`${modelName}.modelName` as "base.new") })}
          </div>
        }
        action={
          <Button
            variant="warning"
            className="w-full"
            onClick={async (e, { onError }) => {
              await removeModel(modelId, { onError });
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
