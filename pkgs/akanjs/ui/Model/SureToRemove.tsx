"use client";
import { ID } from "akanjs/base";
import { cn, msg, router, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { useMemo, useState } from "react";
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
}
export default function SureToRemove({
  className,
  modelId,
  name,
  slice,
  redirect,
  typeNameToRemove,
}: SureToRemoveProps) {
  const { l } = usePage();
  const [repeatName, setRepeatName] = useState("");
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

  const removeModel = async (id: string) => {
    await storeDo[names.removeModel](id);
    msg.success("base.removeSuccess", { data: { model: l(`${modelName}.modelName` as "base.new") } });
    setModalOpen(false);
    if (!redirect) return;
    if (redirect === "back") router.back();
    else router.push(redirect);
  };
  // `typeNameToRemove` makes a person retype the name before the button unlocks. An approval card is one click,
  // so it is not that gate — the lever is withheld rather than offered at a friction the screen does not have.
  const removeTool = st
    .tool(typeNameToRemove ? null : names.removeModel)
    .desc(`Remove one ${modelName}.`)
    .arg("modelId", ID)
    .exec((id) => removeModel(id));
  return (
    <div
      className="inline size-full"
      {...agentAttrs(removeTool)}
      onClick={(e) => {
        e.stopPropagation();
        setModalOpen(true);
      }}
    >
      <div
        className={cn(
          "flex size-full cursor-pointer flex-nowrap items-center justify-center gap-2 whitespace-nowrap text-destructive",
          className,
        )}
      >
        <AiOutlineDelete /> {l("base.remove")}
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
        bodyClassName="border-destructive"
        action={
          <button
            className={buttonRecipe({ variant: "destructive" }, "w-full")}
            disabled={typeNameToRemove && repeatName !== name}
            onClick={async () => {
              await removeModel(modelId);
            }}
          >
            {l("base.removeModel", { model: l(`${modelName}.modelName` as "base.new") })}
          </button>
        }
      >
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
    </div>
  );
}
