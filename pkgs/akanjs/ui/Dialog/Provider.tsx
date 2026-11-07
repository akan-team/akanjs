"use client";
import { cn } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { st } from "akanjs/store";
import { type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { sharedContext } from "../../client/sharedContext";
import { agentAttrs } from "../agentAttrs";

export interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  openDialog: () => void;
  closeDialog: () => void;
  /** The drawing surface's own dismissal, where `confirmClose` and `onCancel` live; flipping `open` skips both. */
  registerDismiss: (dismiss: (() => void) | null) => void;
  title: ReactNode;
  setTitle: (title: ReactNode) => void;
  action: ReactNode;
  setAction: (action: ReactNode) => void;
}

export const DialogContext = sharedContext<DialogContextType>("dialog", {
  open: false,
  setOpen: (open: boolean) => null,
  openDialog: () => null,
  closeDialog: () => null,
  registerDismiss: (dismiss: (() => void) | null) => null,
  title: null,
  setTitle: (title: ReactNode) => null,
  action: null,
  setAction: (action: ReactNode) => null,
});

export interface ProviderProps {
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  /** Names this dialog for the in-page agent; without it the dialog publishes nothing. */
  namespace?: string;
  children?: ReactNode;
}
export const Provider = ({
  className,
  defaultOpen = false,
  open = defaultOpen,
  namespace,
  children,
}: ProviderProps) => {
  const [openState, setOpenState] = useState(defaultOpen);
  const dismissRef = useRef<(() => void) | null>(null);
  const registerDismiss = useCallback((dismiss: (() => void) | null) => {
    dismissRef.current = dismiss;
  }, []);
  const [title, setTitle] = useState<ReactNode>(null);
  const [action, setAction] = useState<ReactNode>(null);
  const suffix = namespace ? capitalize(namespace) : "";
  useEffect(() => {
    setOpenState(open);
  }, [open]);
  st.expose(namespace ? `dialogIn${suffix}` : null, Boolean)
    .desc("Whether this dialog is showing.")
    .value(openState);
  const openDialog = st
    .tool(namespace ? `openDialogIn${suffix}` : null)
    .desc(`Open the ${namespace ?? ""} dialog.`)
    .exec(() => {
      setOpenState(true);
    });
  const closeDialog = st
    .tool(namespace ? `closeDialogIn${suffix}` : null)
    .desc(`Close the ${namespace ?? ""} dialog.`)
    .exec(() => {
      // The surface's own dismissal, the X button's path; flipping the state is for a dialog with no modal.
      if (dismissRef.current) dismissRef.current();
      else setOpenState(false);
    });
  return (
    <DialogContext.Provider
      value={{
        open: openState,
        setOpen: setOpenState,
        openDialog,
        closeDialog,
        registerDismiss,
        title,
        setTitle,
        action,
        setAction,
      }}
    >
      <div data-open={openState} className={cn("group/dialog", className)}>
        {children}
      </div>
    </DialogContext.Provider>
  );
};

export interface TitleProps {
  children?: ReactNode;
}
export const Title = ({ children }: TitleProps) => {
  const { setTitle } = useContext(DialogContext);
  useEffect(() => {
    setTitle(children);
    return () => {
      setTitle(null);
    };
  }, [children]);
  return null;
};

export interface ActionProps {
  children?: ReactNode;
}
export const Action = ({ children }: ActionProps) => {
  const { setAction } = useContext(DialogContext);
  useEffect(() => {
    setAction(children);
    return () => {
      setAction(null);
    };
  }, [children]);
  return null;
};

export interface ContentProps {
  className?: string;
  children?: ReactNode;
}
export const Content = ({ className, children }: ContentProps) => {
  return <div className={cn("block w-full", className)}>{children}</div>;
};

export interface TriggerProps {
  className?: string;
  children?: ReactNode;
}
export const Trigger = ({ className, children }: TriggerProps) => {
  const { openDialog } = useContext(DialogContext);
  return (
    <div className={className} onClick={openDialog} {...agentAttrs(openDialog)}>
      {children}
    </div>
  );
};

export interface CloseProps {
  className?: string;
  children?: ReactNode;
}
export const Close = ({ className, children }: CloseProps) => {
  const { closeDialog } = useContext(DialogContext);
  return (
    <a className={className} onClick={closeDialog} {...agentAttrs(closeDialog)}>
      {children}
    </a>
  );
};
