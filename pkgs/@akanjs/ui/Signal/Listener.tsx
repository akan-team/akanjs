"use client";

import { clsx } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import { useEffect, useRef } from "react";

export default function Listener() {
  return <div></div>;
}

interface ListenerResultProps {
  status: "ready" | "loading" | "error" | "listening";
  data: any;
}
const ListenerResult = ({ status, data }: ListenerResultProps) => {
  const dataStr = typeof data === "object" ? JSON.stringify(data, null, 2) : (data as string);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [dataStr]);
  return (
    <div className="relative">
      <textarea
        ref={ref}
        className={`textarea duration-300 ${
          status === "loading"
            ? "textarea-disabled"
            : status === "error"
              ? "textarea-error text-error border-error"
              : status === "listening"
                ? "textarea-success border-info animate-borderPulse-50 border-3"
                : ""
        } bg-base-100 min-h-[300px] w-full rounded-md p-4 text-sm font-normal`}
        value={dataStr}
        onChange={() => true}
      />

      <div className="bg-base-200/50 absolute top-4 right-4 flex items-center justify-center gap-3 rounded-lg px-2 py-1 font-bold">
        {capitalize(status)}

        <div
          className={clsx("size-[14px] rounded-full", {
            "bg-base-300 animate-bounce": status === "ready",
            "animate-pop-300 bg-success": status === "listening",
            // "animate-pop bg-success": status === "success",
            "bg-error animate-none": status === "error",
            "bg-warning animate-ping": status === "loading",
          })}
        ></div>
      </div>
      {/* {status === "loading" ? (
        <div className="animate-fadeIn absolute inset-0 flex items-center justify-center backdrop-blur-sm">
          <span className="loading loading-dots loading-lg"></span>
        </div>
      ) : status === "idle" ? (
        <></>
      ) : status === "listening" ? (
        <div className="absolute right-4 top-4 w-3 h-3">
          <div className="rounded-full  w-full h-full animate-bounce bg-success"></div>
        </div>
      ) : (
        <div className="absolute right-4 top-4">
          <Copy text={dataStr}>
            <button className="btn btn-sm">
              <AiOutlineCopy /> Copy
            </button>
          </Copy>
        </div>
      )} */}
    </div>
  );
};
Listener.Result = ListenerResult;
