"use client";
import { clsx, msg, router, usePage } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import { st } from "@akanjs/store";
import { useMemo, useState } from "react";
import { AiOutlineDelete } from "react-icons/ai";

import { Modal } from "../Modal";

interface SureToRemoveProps {
  className?: string;
  modelId: string;
  name: string;
  sliceName: string;
  redirect?: string;
  typeNameToRemove?: boolean;
}
export default function SureToRemove({
  className,
  modelId,
  name,
  sliceName,
  redirect,
  typeNameToRemove,
}: SureToRemoveProps) {
  const { l } = usePage();
  const [repeatName, setRepeatName] = useState("");
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
    <div
      className="inline size-full"
      onClick={(e) => {
        e.stopPropagation();
        setModalOpen(true);
      }}
    >
      <div
        className={clsx(
          "text-error flex size-full cursor-pointer flex-nowrap items-center justify-center gap-2 whitespace-nowrap",
          className
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
          <div className="text-error text-lg font-bold">
            {l("base.removeModel", { model: l(`${modelName}.modelName` as "base.new") })}
          </div>
        }
        bodyClassName="border-error"
        action={
          <button
            className="btn btn-error w-full"
            disabled={typeNameToRemove && repeatName !== name}
            onClick={async () => {
              await storeDo[names.removeModel](modelId);
              msg.success("base.removeSuccess", { data: { model: l(`${modelName}.modelName` as "base.new") } });
              setModalOpen(false);
              if (!redirect) return;
              if (redirect === "back") router.back();
              else router.push(redirect);
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
            className="input w-full text-center"
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
