"use client";
import { type DataAction, usePage } from "akanjs/client";
import { modelNames } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { Fragment } from "react";
import { AiOutlineDelete, AiOutlineEdit } from "react-icons/ai";
import { buttonRecipe } from "../Button";
import { Popconfirm } from "../Popconfirm";

interface ViewActionsProps {
  model: { id: string };
  slice: SliceMeta;
  actions: DataAction[];
  onEdit: (id: string) => void;
}
export default function ViewActions({ model, slice, actions, onEdit }: ViewActionsProps) {
  const { l } = usePage();
  const storeDo = st.do as unknown as { [key: string]: (...args: unknown[]) => Promise<void> };
  const names = modelNames(slice.refName);
  const remove = () => {
    //? The action has already shown the error; the view stays open on the record it failed to remove.
    void storeDo[names.removeModel](model.id).then(
      () => storeDo[names.resetModel](),
      () => null,
    );
  };
  return (
    <>
      {actions.map((action, idx) =>
        action === "edit" ? (
          <button
            key="edit"
            type="button"
            className={buttonRecipe({ variant: "outline", size: "sm" })}
            onClick={() => {
              onEdit(model.id);
            }}
          >
            <AiOutlineEdit /> {l("base.edit")}
          </button>
        ) : action === "remove" ? (
          <Popconfirm key="remove" title={l("base.removeMsg")} onConfirm={remove}>
            <button
              type="button"
              className={buttonRecipe({ variant: "outline", size: "sm" }, "text-destructive hover:text-destructive")}
            >
              <AiOutlineDelete /> {l("base.remove")}
            </button>
          </Popconfirm>
        ) : (
          <Fragment key={idx}>{action}</Fragment>
        ),
      )}
    </>
  );
}
