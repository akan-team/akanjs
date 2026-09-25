import { clsx, usePage } from "akanjs/client";
import type { SliceMeta } from "akanjs/fetch";
import type { ReactNode } from "react";
import { AiOutlineEdit } from "react-icons/ai";

import EditModal from "./EditModal";
import EditWrapper from "./EditWrapper";

interface EditProps {
  type?: "icon" | "button";
  className?: string;
  wrapperClassName?: string;
  children: ReactNode;
  slice: SliceMeta;
  modelId: string;
  modal?: string | null;
  renderTitle?: ((model: { id: string }) => string | ReactNode) | string;
}

export default function Edit({
  className,
  wrapperClassName,
  type = "button",
  children,
  slice,
  modelId,
  modal,
  renderTitle,
}: EditProps) {
  const { l } = usePage();
  return (
    <div className={clsx("inline", wrapperClassName)}>
      <EditWrapper
        className={clsx("flex w-full items-center justify-center gap-2", className)}
        slice={slice}
        modelId={modelId}
        modal={modal}
      >
        <AiOutlineEdit /> {type === "button" ? l("base.edit") : null}
      </EditWrapper>
      <EditModal renderTitle={renderTitle} slice={slice} id={modelId}>
        {children}
      </EditModal>
    </div>
  );
}
