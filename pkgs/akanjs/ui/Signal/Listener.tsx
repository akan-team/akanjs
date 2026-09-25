"use client";

import { capitalize } from "akanjs/common";
import { useEffect, useRef } from "react";
import { getStatusBadgeClassName, getStatusTextareaClassName, signalUi } from "./style";

export default function Listener() {
  return <div></div>;
}

interface ListenerResultProps {
  status: "ready" | "loading" | "error" | "listening";
  data: unknown;
}
const ListenerResult = ({ status, data }: ListenerResultProps) => {
  const dataStr = typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [dataStr]);
  return (
    <div className="relative">
      <textarea
        ref={ref}
        className={`${signalUi.codePanel} duration-300 ${
          status === "listening" ? "animate-borderPulse-50 border-2" : ""
        } ${getStatusTextareaClassName(status)}`}
        value={dataStr}
        onChange={() => true}
      />

      <div className="absolute top-4 right-4 flex items-center justify-center gap-2 rounded-lg bg-base-200/80 px-2 py-1 font-bold">
        <span className={getStatusBadgeClassName(status)}>{capitalize(status)}</span>
        <div
          className={`size-[10px] rounded-full ${
            status === "error"
              ? "bg-error"
              : status === "listening"
                ? "animate-pop-300 bg-primary"
                : status === "loading"
                  ? "animate-ping bg-secondary"
                  : "bg-base-300"
          }`}
        ></div>
      </div>
    </div>
  );
};
Listener.Result = ListenerResult;
