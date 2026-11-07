"use client";
import { type DynamicRecord, deepObjectify, modelNames } from "akanjs/common";
import type { ClientEdit, ServerEdit, SliceMeta } from "akanjs/fetch";
import type { CreateOption } from "akanjs/store";
import type { ReactNode } from "react";

import { Empty } from "../Empty";
import { Loading } from "../Loading";
import { Model } from "../Model";
import type { DraftProp } from "../Model/draftScope";
import Stream from "./Stream";

interface DefaultProps {
  type?: "modal" | "form" | "empty";
  className?: string;
  modalClassName?: string;
  checkSubmit?: boolean;
  slice: SliceMeta;
  modal?: string;
  /** Custom fallback shown while an unawaited `edit` is pending. */
  loading?: ReactNode;
  children?: ReactNode;
  onSubmit?: string;
  onCancel?: string;
  submitText?: string;
  submitClassName?: string;
  submitOption?: CreateOption<any>;
  renderSubmit?: boolean;
  /** Draft recovery for this form. `false` turns it off; a string names the scope explicitly. */
  draft?: DraftProp;
}

export interface EditProps<T extends string, Full extends { id: string }> extends DefaultProps {
  edit: ClientEdit<T, Full> | Partial<Full> | Promise<Partial<Full>>;
}

interface RenderProps<T extends string, Full extends { id: string }> extends DefaultProps {
  edit: ServerEdit<T, Full> | Partial<Full> | Promise<Partial<Full>>;
}

function Render<T extends string, Full extends { id: string }>({
  className,
  checkSubmit,
  modalClassName,
  type,
  edit,
  modal,
  slice,
  children,
  onSubmit,
  onCancel,
  submitText,
  submitClassName,
  submitOption,
  renderSubmit,
  draft,
}: RenderProps<T, Full>) {
  const editType: "edit" | "new" =
    (edit as ServerEdit<string, Full>).refName &&
    ((edit as DynamicRecord)[modelNames((edit as ServerEdit<string, Full>).refName).modelObj] as Full)
      ? "edit"
      : "new";
  const modelId =
    editType === "edit"
      ? ((edit as DynamicRecord)[modelNames((edit as ServerEdit<string, Full>).refName).modelObj] as Full).id
      : undefined;
  return (
    <Model.EditModal
      type={type}
      id={modelId}
      checkSubmit={checkSubmit}
      className={className}
      modalClassName={modalClassName}
      slice={slice}
      edit={
        editType === "edit"
          ? (edit as ServerEdit<string, Full>)
          : deepObjectify(edit as Partial<Full>, { serializable: true })
      }
      modal={modal}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitText={submitText}
      submitClassName={submitClassName}
      submitOption={submitOption}
      renderSubmit={renderSubmit}
      draft={draft}
    >
      {children}
    </Model.EditModal>
  );
}

export default function Edit_Client<T extends string, Full extends { id: string }>(props: EditProps<T, Full>) {
  return (
    <Stream of={props.edit} fallback={props.loading === undefined ? <Loading.Skeleton active /> : props.loading}>
      {(serverEdit) => (serverEdit ? <Render {...props} edit={serverEdit} /> : <Empty />)}
    </Stream>
  );
}
