"use client";
import * as RadixDialog from "@radix-ui/react-dialog";
import { ReactNode } from "react";
import { BiX } from "react-icons/bi";

import { Dialog } from "./Dialog";

interface ModalProps {
  className?: string;
  title?: string | ReactNode;
  action?: ReactNode;
  open: boolean;
  onCancel: () => void;
  bodyClassName?: string;
  children?: any;
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

interface WindowProps {
  open: boolean;
  onCancel: () => void;
  title: ReactNode;
  children: ReactNode;
}

export const Window = ({ open, onCancel, title, children }: WindowProps) => {
  if (!open) return null;

  return (
    <RadixDialog.Root open={open}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-black/40" />
        <RadixDialog.Content
          className="animate-fadeIn fixed top-1/2 left-1/2 z-[2] w-[90%] min-w-auto -translate-x-1/2 -translate-y-1/2 rounded-[10px] border-[3px] border-black text-black backdrop-blur-lg md:w-fit"
          style={{
            background: `rgba(255, 255, 255, 0.3)`,
            width: "406px",
          }}
        >
          <RadixDialog.Title className="height-[36px] relative overflow-hidden rounded-t-[6px] border-b-2 border-black bg-white/60 text-center">
            <div className="m-0 text-[22px]">{title}</div>
            <RadixDialog.Close
              onClick={() => {
                onCancel();
              }}
              className="absolute top-0 right-0 flex h-[34px] w-[40px] cursor-pointer items-center justify-center border-l-2 border-black"
            >
              <BiX className="text-[32px]" />
            </RadixDialog.Close>
          </RadixDialog.Title>
          <RadixDialog.Description className="overflow-y-hidden rounded-b-[10px] p-2">
            {children}
          </RadixDialog.Description>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};
Modal.Window = Window;
