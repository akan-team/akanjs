"use client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import {
  AiOutlineCheckCircle,
  AiOutlineClose,
  AiOutlineExclamationCircle,
  AiOutlineInfoCircle,
  AiOutlineLoading3Quarters,
  AiOutlineWarning,
} from "react-icons/ai";

import { createOverridable } from "./UiOverride";

export type ToastType = "info" | "success" | "error" | "warning" | "loading";

export interface ToastMessage {
  key: string;
  type: ToastType;
  content: ReactNode;
  /** Seconds shown before the exit starts. */
  duration: number;
  /** The exit started: play the leave animation, then call `onClosed`. */
  leaving: boolean;
}

const messageTone: { [key in ToastType]: { card: string; chip: string; icon: ReactNode } } = {
  info: { card: "border-info/35", chip: "bg-info/15 text-info", icon: <AiOutlineInfoCircle /> },
  success: { card: "border-success/35", chip: "bg-success/15 text-success", icon: <AiOutlineCheckCircle /> },
  warning: { card: "border-warning/35", chip: "bg-warning/15 text-warning", icon: <AiOutlineWarning /> },
  error: {
    card: "border-destructive/35",
    chip: "bg-destructive/15 text-destructive",
    icon: <AiOutlineExclamationCircle />,
  },
  loading: {
    card: "border-border",
    chip: "bg-muted text-foreground/60",
    icon: <AiOutlineLoading3Quarters className="animate-spin" />,
  },
};

export interface ToastItemProps {
  className?: string;
  message: ToastMessage;
  /** Starts the same exit the timer would. */
  onClose: () => void;
  /** Call when the exit animation has finished. */
  onClosed: () => void;
}

export const DefaultToastItem = ({ className, message, onClose, onClosed }: ToastItemProps) => {
  const tone = messageTone[message.type];
  return (
    <div
      data-state={message.leaving ? "out" : "in"}
      onAnimationEnd={() => {
        if (message.leaving) onClosed();
      }}
      className={cn(
        "pointer-events-auto w-full data-[state=in]:animate-fadeInDown15-150ms data-[state=out]:animate-smaller",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-full items-start gap-3 rounded-box border bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur-sm",
          tone.card,
        )}
      >
        <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-base", tone.chip)}>
          {tone.icon}
        </div>
        <span className="min-w-0 flex-1 self-center break-words text-sm leading-snug">{message.content}</span>
        <button
          aria-label="Dismiss"
          className="-mr-1 shrink-0 self-center rounded-full p-1 text-foreground/30 transition-colors hover:text-foreground/70"
          onClick={onClose}
          type="button"
        >
          <AiOutlineClose className="text-sm" />
        </button>
      </div>
    </div>
  );
};

export interface ToastProps {
  className?: string;
  /** Oldest first, already capped by the store. */
  messages: ToastMessage[];
  /** In pixels; the stack starts below it. */
  topSafeArea: number;
  /** Starts a message's exit. */
  onClose: (key: string) => void;
  /** Call once a message's exit animation has finished. */
  onClosed: (key: string) => void;
}

export const DefaultToast = ({ className, messages, topSafeArea, onClose, onClosed }: ToastProps) => (
  <div
    id="toast"
    className={cn(
      "pointer-events-none fixed top-0 left-1/2 z-[140] flex h-fit w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4 pt-3",
      className,
    )}
    style={{ marginTop: topSafeArea }}
  >
    {messages.map((message) => (
      <Toast.Item
        key={message.key}
        message={message}
        onClose={() => onClose(message.key)}
        onClosed={() => onClosed(message.key)}
      />
    ))}
  </div>
);

const ToastBase = createOverridable("Toast", DefaultToast);

/** `System`'s `Messages` keeps the timers, portal and store wiring, so a replacement only re-skins the surface. */
export const Toast = Object.assign(ToastBase, {
  Item: createOverridable("ToastItem", DefaultToastItem),
});
