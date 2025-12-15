"use client";

import { flip, offset, UseVirtualFloatingOptions } from "@udecode/plate-floating";
import {
  FloatingLinkUrlInput,
  LinkFloatingToolbarState,
  LinkOpenButton,
  useFloatingLinkEdit,
  useFloatingLinkEditState,
  useFloatingLinkInsert,
  useFloatingLinkInsertState,
} from "@udecode/plate-link";
import React from "react";
import { BiLinkAlt, BiLinkExternal, BiText, BiUnlink } from "react-icons/bi";

import { inputVariants } from "./Input";

export interface LinkFloatingToolbarProps {
  state?: LinkFloatingToolbarState;
}

const floatingOptions: UseVirtualFloatingOptions = {
  placement: "bottom-start",
  middleware: [
    offset(12),
    flip({
      padding: 12,
      fallbackPlacements: ["bottom-end", "top-start", "top-end"],
    }),
  ],
};

export const LinkFloatingToolbar = ({ state }: LinkFloatingToolbarProps) => {
  const insertState = useFloatingLinkInsertState({
    ...state,
    floatingOptions: {
      ...floatingOptions,
      ...state?.floatingOptions,
    },
  });
  const { props: insertProps, ref: insertRef, hidden, textInputProps } = useFloatingLinkInsert(insertState);

  const editState = useFloatingLinkEditState({
    ...state,
    floatingOptions: {
      ...floatingOptions,
      ...state?.floatingOptions,
    },
  });
  const { props: editProps, ref: editRef, editButtonProps, unlinkButtonProps } = useFloatingLinkEdit(editState);

  if (hidden) return null;

  const input = (
    <div className="flex w-[330px] flex-col">
      <div className="flex items-center">
        <div className="text-muted-foreground flex items-center pl-3">
          <BiLinkAlt />
        </div>

        <FloatingLinkUrlInput className={inputVariants({ variant: "ghost", h: "sm" })} placeholder="Paste link" />
      </div>

      <div className="mx-auto h-1 w-[96%] border-b border-black/20" />
      <div className="flex items-center">
        <div className="text-muted-foreground flex items-center pl-3">
          <BiText />
        </div>
        <input
          className={inputVariants({ variant: "ghost", h: "sm" })}
          placeholder="Text to display"
          {...textInputProps}
        />
      </div>
    </div>
  );

  const editContent = editState.isEditing ? (
    input
  ) : (
    <div className="box-content flex h-9 items-center gap-1">
      <button type="button" className="btn btn-ghost btn-sm" {...editButtonProps}>
        Edit link
      </button>
      <div className="h-full w-1 border-r border-black/20" />
      <LinkOpenButton className="btn btn-ghost btn-sm">
        <BiLinkExternal />
      </LinkOpenButton>
      <div className="h-full w-1 border-r border-black/20" />
      <button type="button" className="btn btn-ghost btn-sm" {...unlinkButtonProps}>
        <BiUnlink />
      </button>
    </div>
  );

  const popupClassName = "w-auto p-1 rounded-md border border-black/20 bg-base-100 shadow-md outline-hidden";

  return (
    <>
      <div ref={insertRef} className={popupClassName} {...(insertProps as object)}>
        {input}
      </div>
      <div ref={editRef} className={popupClassName} {...(editProps as object)}>
        {editContent}
      </div>
    </>
  );
};
