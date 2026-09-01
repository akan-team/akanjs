"use client";
import type { ReactNode } from "react";

import { Dialog } from "./Dialog";

export interface LegacyModalProps {
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

/**
 * Previous akanjs modal skin: spring open/close and a drag-to-dismiss sheet on touch. Kept for screens
 * built around that motion. New work uses {@link Modal}, which takes the same props with no animation,
 * and unlike this one resolves through the `Modal` override slot.
 */
export const LegacyModal = ({
  className,
  title,
  action,
  open,
  onCancel,
  bodyClassName,
  children,
  confirmClose = false,
}: LegacyModalProps) => {
  return (
    <Dialog open={open}>
      <Dialog.LegacyModal
        className={className}
        onCancel={onCancel}
        bodyClassName={bodyClassName}
        confirmClose={confirmClose}
      >
        {title ? <Dialog.Title>{title}</Dialog.Title> : null}
        <Dialog.Content>{children}</Dialog.Content>
        {action ? <Dialog.Action>{action}</Dialog.Action> : null}
      </Dialog.LegacyModal>
    </Dialog>
  );
};
