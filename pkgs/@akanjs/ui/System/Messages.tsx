"use client";
import { clsx, msg, usePage } from "@akanjs/client";
import { st } from "@akanjs/store";
import { ReactNode, useEffect, useState } from "react";
import {
  AiOutlineCheckCircle,
  AiOutlineInfoCircle,
  AiOutlineLoading3Quarters,
  AiOutlineQuestionCircle,
} from "react-icons/ai";
import { BsExclamationCircleFill } from "react-icons/bs";

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
  data?: { [key: string]: any };
}

let timeOuts: TimeOutType[] = [];

const Message = ({ content, type = "info" as MessageType, duration, keyForMessage }: MessageProps) => {
  const pageState = st.use.pageState();
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

  const iconClassName = type === "loading" ? "text-info" : `text-${type}`;
  const getIcon = (type: MessageType) => {
    const icons: { [key in MessageType]: ReactNode } = {
      info: <AiOutlineInfoCircle className={clsx("text-2xl", iconClassName)} />,
      success: <AiOutlineCheckCircle className={clsx("text-2xl", iconClassName)} />,
      error: <BsExclamationCircleFill className={clsx("text-2xl", iconClassName)} />,
      warning: <AiOutlineQuestionCircle className={clsx("text-2xl", iconClassName)} />,
      loading: <AiOutlineLoading3Quarters className={clsx("animate-spin text-2xl", iconClassName)} />,
    };
    return icons[type];
  };

  return (
    <div
      data-state={preBlind}
      className="animate-zoomIn data-[state=true]:animate-smaller group w-screen px-6 duration-300 md:max-w-[60%]"
      style={{
        paddingTop: pageState.topSafeArea,
      }}
    >
      <div
        className={clsx(
          "typo-body1 text-base-content flex w-full items-center gap-2 rounded-[4px] border px-4 py-2 drop-shadow-lg",
          {
            "stroke-base-content bg-primary-content border-[#EEEEEE]": type === "loading" || type === "info",
            "stroke-success bg-success/80 border-success-border": type === "success",
            "stroke-error bg-error/80 border-error-border": type === "error",
            "stroke-warning bg-warning/80 border-warning-border": type === "warning",
          }
        )}
      >
        <div className="bg-base-100 flex size-6 items-center justify-center rounded-full">{getIcon(type)}</div>
        <span className="text-base-100 truncate whitespace-nowrap">{content}</span>
      </div>
    </div>
  );
};

export const Messages = () => {
  const messages = st.use.messages();
  const { l } = usePage();
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
  if (!messages.length) return null;
  return (
    <div
      id="toast"
      className="fixed top-0 left-0 z-[100] mt-[var(--safe-area-top)] flex h-fit w-screen flex-col items-center justify-start gap-2 pt-2"
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
    </div>
  );
};
