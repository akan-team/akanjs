"use client";
import type { ReactNode } from "react";

import { Dialog } from "./Dialog";

export interface ModalProps {
  /** Additional classes for the modal surface. */
  className?: string;
  /** Optional modal title. */
  title?: string | ReactNode;
  /** Optional action area, usually footer buttons. */
  action?: ReactNode;
  /** Controlled open state. */
  open: boolean;
  /** Called when the modal requests closing. */
  onCancel: () => void;
  /** Additional classes for the content body. */
  bodyClassName?: string;
  children?: ReactNode;
  /** Ask for close confirmation before dismissing. */
  confirmClose?: boolean;
}

export const Modal = ({
  className,
  title,
  action,
  open,
  onCancel,
  bodyClassName,
  children,
  confirmClose = false,
}: ModalProps) => {
  return (
    <Dialog open={open}>
      <Dialog.Modal className={className} onCancel={onCancel} bodyClassName={bodyClassName} confirmClose={confirmClose}>
        {title ? <Dialog.Title>{title}</Dialog.Title> : null}
        <Dialog.Content>{children}</Dialog.Content>
        {action ? <Dialog.Action>{action}</Dialog.Action> : null}
      </Dialog.Modal>
    </Dialog>
  );
};
