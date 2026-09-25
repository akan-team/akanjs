"use client";
import { cn, msg, usePage } from "akanjs/client";
import { st } from "akanjs/store";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AiOutlineCheckCircle,
  AiOutlineClose,
  AiOutlineExclamationCircle,
  AiOutlineInfoCircle,
  AiOutlineLoading3Quarters,
  AiOutlineWarning,
} from "react-icons/ai";

type MessageType = "success" | "error" | "info" | "warning" | "loading";

interface MessageProps {
  content: ReactNode;
  type?: MessageType;
  duration: number; // in seconds
  keyForMessage: string;
}

interface TimeOutType {
  key: string;
  timeoutId: NodeJS.Timeout;
}
interface MsgOption {
  key?: string;
  duration?: number;
  data?: Record<string, string | number>;
}

const messageTone: { [key in MessageType]: { card: string; chip: string; icon: ReactNode } } = {
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

let timeOuts: TimeOutType[] = [];

const Message = ({ content, type = "info" as MessageType, duration, keyForMessage }: MessageProps) => {
  const [preBlind, setPreBlind] = useState(false);
  useEffect(() => {
    if (!content) return;
    // 기존의 timeouts에 key가 있으면, 기존의 timeout을 제거하고 새로운 timeout을 추가한다.
    const existingTimeOut = timeOuts.find((item) => item.key === keyForMessage);
    if (existingTimeOut) {
      clearTimeout(existingTimeOut.timeoutId);
      removeTimeOut(keyForMessage);
    }

    const timeoutId = setTimeout(() => {
      setPreBlind(true);
    }, duration * 1000);
    addTimeOut(keyForMessage, timeoutId);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [content, keyForMessage, type]);

  useEffect(() => {
    if (!preBlind) return;
    setTimeout(() => {
      st.do.hideMessage(keyForMessage);
      removeTimeOut(keyForMessage);
    }, 100);
  }, [preBlind]);

  const addTimeOut = (key: string, timeoutId: NodeJS.Timeout) => {
    const filteredTimeOuts = timeOuts.filter((item) => item.key !== key);
    timeOuts = [...filteredTimeOuts, { key, timeoutId }];
  };

  const removeTimeOut = (key: string) => {
    timeOuts = timeOuts.filter((item) => item.key !== key);
  };

  const tone = messageTone[type];
  return (
    <div
      data-state={preBlind}
      className="pointer-events-auto w-full animate-fadeInDown15-150ms data-[state=true]:animate-smaller"
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
        <span className="min-w-0 flex-1 self-center break-words text-sm leading-snug">{content}</span>
        <button
          aria-label="Dismiss"
          className="-mr-1 shrink-0 self-center rounded-full p-1 text-foreground/30 transition-colors hover:text-foreground/70"
          onClick={() => {
            setPreBlind(true);
          }}
          type="button"
        >
          <AiOutlineClose className="text-sm" />
        </button>
      </div>
    </div>
  );
};

export const Messages = () => {
  const messages = st.use.messages({ agent: false });
  const pageState = st.use.pageState({ agent: false });
  const { l } = usePage();
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    setPortalElement(document.body);
  }, []);
  useEffect(() => {
    Object.assign(msg, {
      info: (msgKey: `${string}.${string}`, option = {} as MsgOption) => {
        st.do.showMessage({
          type: "info",
          key: option.key,
          duration: option.duration ?? 3,
          content: l(msgKey as "base.new", option.data),
        });
      },
      success: (msgKey: `${string}.${string}`, option = {} as MsgOption) => {
        st.do.showMessage({
          type: "success",
          key: option.key,
          duration: option.duration ?? 3,
          content: l(msgKey as "base.new", option.data),
        });
      },
      error: (msgKey: `${string}.${string}`, option = {} as MsgOption) => {
        st.do.showMessage({
          type: "error",
          key: option.key,
          duration: option.duration ?? 3,
          content: l(msgKey as "base.new", option.data),
        });
      },
      warning: (msgKey: `${string}.${string}`, option = {} as MsgOption) => {
        st.do.showMessage({
          type: "warning",
          key: option.key,
          duration: option.duration ?? 3,
          content: l(msgKey as "base.new", option.data),
        });
      },
      loading: (msgKey: `${string}.${string}`, option = {} as MsgOption) => {
        st.do.showMessage({
          type: "loading",
          key: option.key,
          duration: option.duration ?? 3,
          content: l(msgKey as "base.new", option.data),
        });
      },
    });
  }, []);
  if (!messages.length || !portalElement) return null;
  // Portalled to the body like Dialog's modal: the page tree sits under `#pageContainers`, which is
  // `isolation: isolate`, so a z-index declared inside it can never rise above a body-level overlay.
  return createPortal(
    <div
      id="toast"
      className="pointer-events-none fixed top-0 left-1/2 z-[100] flex h-fit w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4 pt-3"
      style={{ marginTop: pageState.topSafeArea }}
    >
      {messages.map((message) => (
        <Message
          content={message.content}
          type={message.type}
          duration={message.duration}
          key={message.key}
          keyForMessage={message.key}
        />
      ))}
    </div>,
    portalElement,
  );
};
