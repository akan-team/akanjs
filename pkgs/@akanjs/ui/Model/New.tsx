import { clsx, usePage } from "@akanjs/client";
import type { ReactNode } from "react";
import { AiOutlinePlus } from "react-icons/ai";

import EditModal from "./EditModal";
import NewWrapper from "./NewWrapper";

interface NewProps<Full = any> {
  type?: "icon" | "button";
  className?: string;
  wrapperClassName?: string;
  children: ReactNode;
  sliceName: string;
  modal?: string | null;
  partial?: Partial<Full> | (() => Partial<Full>);
  renderTitle?: ((model: { id: string }) => string | ReactNode) | string;
}

export default function New({
  className,
  wrapperClassName,
  type = "button",
  children,
  sliceName,
  modal,
  partial,
  renderTitle,
}: NewProps) {
  const { l } = usePage();
  return (
    <div className={clsx("inline", wrapperClassName)}>
      <NewWrapper
        className={clsx("flex w-full items-center justify-center gap-2", className)}
        sliceName={sliceName}
        modal={modal}
        partial={partial}
      >
        <AiOutlinePlus /> {type === "button" ? l("base.new") : null}
      </NewWrapper>
      <EditModal renderTitle={renderTitle} sliceName={sliceName}>
        {children}
      </EditModal>
    </div>
  );
}
