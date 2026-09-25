"use client";
import { cn } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { useEffect, useRef } from "react";
import { Code } from "../Reference";
import { getStatusBadgeClassName, getStatusTone } from "./style";

export default function Listener() {
  return <div></div>;
}

const dotClass: { [key: string]: string } = {
  error: "bg-destructive",
  listening: "animate-pulse bg-success",
  loading: "animate-ping bg-info",
  ready: "bg-border",
};

interface ListenerResultProps {
  status: "ready" | "loading" | "error" | "listening";
  data: unknown;
}
/**
 * A byte payload has no useful JSON form: `JSON.stringify` spells a `Uint8Array` as `{"0":2,"1":148,…}`, which
 * is unreadable and, for one video chunk, megabytes of DOM. The head is enough to tell a stream apart.
 */
const previewBytes = (bytes: Uint8Array) => {
  const head = [...bytes.subarray(0, 32)].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
  return `Uint8Array(${bytes.length}) ${head}${bytes.length > 32 ? " …" : ""}`;
};

const replaceBytes = (_key: string, value: unknown) => {
  if (!ArrayBuffer.isView(value)) return value;
  const view = value as ArrayBufferView;
  return previewBytes(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
};

const ListenerResult = ({ status, data }: ListenerResultProps) => {
  const dataStr = typeof data === "object" ? JSON.stringify(data, replaceBytes, 2) : String(data);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [dataStr]);
  return (
    <Code
      bodyRef={ref}
      code={dataStr}
      label="Stream"
      meta={
        <>
          <span className={getStatusBadgeClassName(status)}>{capitalize(status)}</span>
          <span className={cn("size-2 rounded-full", dotClass[status] ?? "bg-border")} />
        </>
      }
      placeholder="Nothing received yet."
      tone={getStatusTone(status)}
    />
  );
};
Listener.Result = ListenerResult;
