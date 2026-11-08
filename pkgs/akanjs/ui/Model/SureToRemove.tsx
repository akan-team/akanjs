"use client";
import { ID } from "akanjs/base";
import { cn, msg, router, usePage } from "akanjs/client";
import { modelNames } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { type ReactNode, useState } from "react";
import { AiOutlineDelete } from "react-icons/ai";

import { agentAttrs } from "../agentAttrs";
import { buttonRecipe } from "../Button";
import { Modal } from "../Modal";
import { inputRecipe } from "../recipe";

interface SureToRemoveProps {
  className?: string;
  modelId: string;
  name: string;
  slice: SliceMeta;
  redirect?: string;
  typeNameToRemove?: boolean;
  /** Element that opens the confirmation. Defaults to the framework's delete label. */
  trigger?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
}
export default function SureToRemove({
  className,
  modelId,
  name,
  slice,
  redirect,
  typeNameToRemove,
  trigger,
  title,
  description,
  confirmLabel,
}: SureToRemoveProps) {
  const { l } = usePage();
  const [repeatName, setRepeatName] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const { refName: modelName } = slice;
  const names = modelNames(modelName);

  const removeModel = async (id: string) => {
    await storeDo[names.removeModel](id);
    msg.success("base.removeSuccess", { data: { model: l(`${modelName}.modelName` as "base.new") } });
    setModalOpen(false);
    if (!redirect) return;
    if (redirect === "back") router.back();
    else router.push(redirect);
  };
  // `typeNameToRemove` gates a person behind retyping the name; a one-click approval card is no such gate, so no tool.
  const removeTool = st
    .tool(typeNameToRemove ? null : names.removeModel)
    .desc(`Remove one ${modelName}.`)
    .arg("modelId", ID)
    .exec((id) => removeModel(id));
  return (
    <>
      <div
        className={cn(trigger ? "contents" : "inline size-full", className)}
        {...agentAttrs(removeTool)}
        onClick={(e) => {
          e.stopPropagation();
          setModalOpen(true);
        }}
      >
        {trigger ?? (
          <div className="flex size-full cursor-pointer flex-nowrap items-center justify-center gap-2 whitespace-nowrap text-destructive">
            <AiOutlineDelete /> {l("base.remove")}
          </div>
        )}
      </div>
      <Modal
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
        }}
        title={
          title ?? (
            <div className="font-bold text-destructive text-lg">
              {l("base.removeModel", { model: l(`${modelName}.modelName` as "base.new") })}
            </div>
          )
        }
        bodyClassName="border-destructive"
        action={
          <button
            type="button"
            className={buttonRecipe({ variant: "destructive" }, "w-full")}
            disabled={typeNameToRemove && repeatName !== name}
            onClick={async () => {
              await removeModel(modelId);
            }}
          >
            {confirmLabel ?? l("base.removeModel", { model: l(`${modelName}.modelName` as "base.new") })}
          </button>
        }
      >
        {description ?? (
          <div className="py-4">
            {l("base.sureToRemove", { model: l(`${modelName}.modelName` as "base.new"), name })}
            <br />
            {l("base.irreversibleOps")}
            {typeNameToRemove ? (
              <>
                <br />
                {l("base.typeNameToRemove", { model: l(`${modelName}.modelName` as "base.new"), name })}
              </>
            ) : null}
          </div>
        )}
        {typeNameToRemove ? (
          <input
            className={inputRecipe({}, "text-center")}
            placeholder={`${l(`${modelName}.modelName` as "base.new")} name`}
            value={repeatName}
            onChange={(e) => {
              setRepeatName(e.target.value);
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}
