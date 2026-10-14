"use client";

import type { ReactNode } from "react";

import { Dialog } from "./Dialog";
import type { ModalSurfaceProps } from "./Dialog/modalSurface";
import { createOverridable } from "./UiOverride";

export interface ModalProps extends ModalSurfaceProps {
  className?: string;
  trigger?: ReactNode;
  title?: string | ReactNode;
  action?: ReactNode;
  /** The dismiss control. `false` draws none. */
  closeButton?: ReactNode | false;
  open?: boolean;
  onCancel?: () => void;
  bodyClassName?: string;
  children?: ReactNode;
  confirmClose?: boolean;
}

export const DefaultModal = ({
  className,
  trigger,
  title,
  action,
  closeButton,
  open,
  onCancel,
  bodyClassName,
  children,
  confirmClose = false,
  presentation,
  placement,
}: ModalProps) => {
  return (
    <Dialog open={open}>
      {trigger ? <Dialog.Trigger>{trigger}</Dialog.Trigger> : null}
      <Dialog.Modal
        className={className}
        onCancel={onCancel}
        bodyClassName={bodyClassName}
        confirmClose={confirmClose}
        closeButton={closeButton}
        presentation={presentation}
        placement={placement}
      >
        {title ? <Dialog.Title>{title}</Dialog.Title> : null}
        <Dialog.Content>{children}</Dialog.Content>
        {action ? <Dialog.Action>{action}</Dialog.Action> : null}
      </Dialog.Modal>
    </Dialog>
  );
};

export const Modal = createOverridable("Modal", DefaultModal);
