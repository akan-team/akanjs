"use client";

import type { ReactNode } from "react";

import { Dialog } from "./Dialog";
import type { ModalPlacement, ModalPresentation } from "./Dialog/modalSurface";
import { createOverridable } from "./UiOverride";

export interface ModalProps {
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
  /** `auto` is a full-screen sheet below `md`; the default stays a centred dialog. */
  presentation?: ModalPresentation;
  /** `right` is a full-height side sheet from `md` up. */
  placement?: ModalPlacement;
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
