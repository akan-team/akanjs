"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn, createPrimitiveElement, withCn, withRef } from "@udecode/cn";
import * as React from "react";
import { BiX } from "react-icons/bi";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = withCn(
  DialogPrimitive.Overlay,
  "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
);

export const DialogContent = withRef<typeof DialogPrimitive.Content>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute right-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none">
        <BiX />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));

export const DialogHeader = withCn(createPrimitiveElement("div"), "flex flex-col space-y-1.5 text-center sm:text-left");

export const DialogFooter = withCn(
  createPrimitiveElement("div"),
  "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2"
);

export const DialogTitle = withCn(DialogPrimitive.Title, "text-lg font-semibold leading-none tracking-tight");

export const DialogDescription = withCn(DialogPrimitive.Description, "text-sm text-muted-foreground");
