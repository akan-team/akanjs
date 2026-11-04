"use client";
import { msg, usePage } from "akanjs/client";
import { st } from "akanjs/store";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Toast, type ToastMessage } from "../Toast";

interface MsgOption {
  key?: string;
  duration?: number;
  data?: Record<string, string | number>;
}

interface ArmedMessage {
  message: Omit<ToastMessage, "leaving">;
  timeoutId: ReturnType<typeof setTimeout> | undefined;
}

// An override with no exit animation never fires `onClosed`, so a leaving message is dropped after this anyway.
const exitGraceMs = 2000;

export const Messages = () => {
  const messages = st.use.messages({ agent: false });
  const pageState = st.use.pageState({ agent: false });
  const { l } = usePage();
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  const [leavingKeys, setLeavingKeys] = useState<string[]>([]);
  const timers = useRef(new Map<string, ArmedMessage>());

  const dropMessage = (key: string) => {
    const armed = timers.current.get(key);
    if (armed) {
      clearTimeout(armed.timeoutId);
      timers.current.delete(key);
    }
    setLeavingKeys((keys) => keys.filter((leavingKey) => leavingKey !== key));
    st.do.hideMessage(key);
  };

  const startLeaving = (key: string) => {
    const armed = timers.current.get(key);
    if (armed) {
      clearTimeout(armed.timeoutId);
      timers.current.set(key, { message: armed.message, timeoutId: setTimeout(() => dropMessage(key), exitGraceMs) });
    }
    setLeavingKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    setPortalElement(document.body);
  }, []);

  useEffect(() => {
    const running = timers.current;
    const rearmed: string[] = [];
    for (const message of messages) {
      const armed = running.get(message.key);
      // `showMessage` replaces the object for a re-shown key, so identity (not a list change) restarts a countdown.
      if (armed?.message === message) continue;
      if (armed) {
        clearTimeout(armed.timeoutId);
        rearmed.push(message.key);
      }
      running.set(message.key, {
        message,
        //? A duration of 0 or less keeps the message until one with its key replaces it, as antd's `duration: 0` does.
        timeoutId:
          message.duration > 0 ? setTimeout(() => startLeaving(message.key), message.duration * 1000) : undefined,
      });
    }
    for (const [key, armed] of [...running]) {
      if (messages.some((message) => message.key === key)) continue;
      clearTimeout(armed.timeoutId);
      running.delete(key);
    }
    setLeavingKeys((keys) => {
      const alive = keys.filter((key) => !rearmed.includes(key) && messages.some((message) => message.key === key));
      return alive.length === keys.length ? keys : alive;
    });
  }, [messages]);

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const armed of running.values()) clearTimeout(armed.timeoutId);
      running.clear();
    };
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
  const toastMessages: ToastMessage[] = messages.map((message) => ({
    ...message,
    leaving: leavingKeys.includes(message.key),
  }));
  // Portalled: `#pageContainers` is `isolation: isolate`, so no z-index inside it rises above a body-level overlay.
  return createPortal(
    <Toast
      messages={toastMessages}
      topSafeArea={pageState.topSafeArea}
      onClose={startLeaving}
      onClosed={dropMessage}
    />,
    portalElement,
  );
};
