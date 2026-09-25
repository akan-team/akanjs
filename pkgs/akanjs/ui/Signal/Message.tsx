"use client";
import { PrimitiveRegistry } from "akanjs/base";
import { fetch, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { type ConstantCls, ConstantRegistry } from "akanjs/constant";
import type { SerializedEndpoint } from "akanjs/signal";
import { useEffect, useMemo, useState } from "react";
import { AiOutlineDisconnect, AiOutlineFileWord, AiOutlineSend, AiOutlineSwap } from "react-icons/ai";
import { BiSolidNetworkChart } from "react-icons/bi";
import { buttonRecipe } from "../Button";
import { Collapse, dictText, docUi, Panel, Segmented } from "../Reference";
import Arg from "./Arg";
import { guardsOf } from "./endpointEntries";
import Listener from "./Listener";
import { makeRequestExample } from "./makeExample";
import UiObject from "./Object";
import Response from "./Response";
import { getGuardBadgeClassName, getWsBadgeClassName } from "./style";

const messageViewItems = [
  { key: "doc", label: "Reference", icon: <AiOutlineFileWord /> },
  { key: "test", label: "Try it", icon: <BiSolidNetworkChart /> },
] as const;

export default function Message() {
  return <div></div>;
}

interface MessageEndpointProps {
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
  open?: boolean;
}
const MessageEndpoint = ({ refName, endpointKey, endpoint, open }: MessageEndpointProps) => {
  const { l } = usePage();
  const [viewStatus, setViewStatus] = useState<"doc" | "test">("doc");
  const guards = guardsOf(endpoint);
  const label = dictText(l, `${refName}.signal.${endpointKey}`);
  const desc = dictText(l, `${refName}.signal.${endpointKey}.desc`);
  return (
    <Collapse
      open={open}
      summary={
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={getWsBadgeClassName(endpoint.type)}>{endpoint.type}</span>
            <span className="break-all font-medium font-mono text-sm">{endpointKey}</span>
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              {guards.map((guard) => (
                <span className={getGuardBadgeClassName(guard)} key={guard}>
                  {guard}
                </span>
              ))}
            </span>
          </div>
          {label ? <div className="text-foreground/55 text-sm">{label}</div> : null}
        </div>
      }
    >
      {desc ? <p className={docUi.prose}>{desc}</p> : null}
      <Segmented items={messageViewItems} onChange={setViewStatus} value={viewStatus} />
      {viewStatus === "doc" ? (
        <MessageInterface refName={refName} endpointKey={endpointKey} endpoint={endpoint} />
      ) : (
        <MessageTry endpointKey={endpointKey} endpoint={endpoint} />
      )}
    </Collapse>
  );
};
Message.Endpoint = MessageEndpoint;

interface MessageInterfaceProps {
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
}
const MessageInterface = ({ refName, endpointKey, endpoint }: MessageInterfaceProps) => {
  const returnRef = ConstantRegistry.getModelRef(endpoint.returns.refName, endpoint.returns.modelType);
  const uploadArgs = endpoint.args.filter((arg) => arg.refName === "Upload");
  const args = endpoint.args.filter((arg) => arg.refName !== "Upload");
  const isReturnModelType = !PrimitiveRegistry.has(returnRef);
  const argSections = [
    { label: "Form data", args: uploadArgs },
    { label: "Variables", args },
  ].filter((section) => section.args.length);
  return (
    <div className="flex flex-col gap-4">
      {argSections.map((section) => (
        <div className="flex flex-col gap-2" key={section.label}>
          <div className={docUi.sectionLabel}>{section.label}</div>
          <div className={docUi.tablePanel}>
            <Arg.Table refName={refName} endpointKey={endpointKey} args={section.args} />
          </div>
        </div>
      ))}
      <div className="grid gap-3 md:grid-cols-2 md:items-start">
        <Panel bodyClassName="max-h-none" label="Returns">
          <div className="flex flex-col items-start gap-3">
            <UiObject.Type objRef={returnRef} arrDepth={endpoint.returns.arrDepth ?? 0} />
            {isReturnModelType ? (
              <UiObject.Detail className="w-full border-0 bg-transparent" objRef={returnRef as ConstantCls} />
            ) : null}
          </div>
        </Panel>
        <Response.Example endpoint={endpoint} />
      </div>
    </div>
  );
};
Message.Interface = MessageInterface;

interface MessageTryProps {
  endpointKey: string;
  endpoint: SerializedEndpoint;
}
const MessageTry = ({ endpointKey, endpoint }: MessageTryProps) => {
  const requestExample = useMemo(() => JSON.stringify(makeRequestExample(endpoint), null, 2), []);
  const [gqlRequest, setGqlRequest] = useState<string>(requestExample);
  const [stopListen, setStopListen] = useState<(() => void) | null>(null);
  const [messages, setMessages] = useState<string | boolean | object[]>("");
  const [response, setResponse] = useState<{
    status: "ready" | "error" | "listening" | "loading";
    data: string | boolean | object[] | null;
  }>({ status: "ready", data: "" });

  const onSend = async () => {
    const request = JSON.parse(gqlRequest) as { [key: string]: string | number | boolean | null };
    const argData = endpoint.args.map((arg) => request[arg.refName]);
    const fetchFn = ((fetch as any)[endpointKey] as (...args: any[]) => Promise<any>).bind(fetch) as (
      ...args: any[]
    ) => Promise<any>;
    await fetchFn(...argData);
  };
  const onListen = () => {
    setResponse({ status: "loading", data: null });
    const fetchFn = ((fetch as any)[`listen${capitalize(endpointKey)}`] as (...args: any[]) => Promise<any>).bind(
      fetch,
    ) as (data: (data: any) => void) => Promise<() => void>;
    setResponse({ status: "loading", data: messages });
    const stopListen = fetchFn((data: any) => {
      setMessages((prev) =>
        typeof data === "boolean"
          ? data
          : typeof data === "string"
            ? `${prev as string}\n${data}`
            : typeof data === "object"
              ? [...((prev && (prev as object[]).length ? [...(prev as object[])] : []) as object[]), data]
              : (data as string),
      );
    });
    setResponse({ status: "listening", data: messages });
    setStopListen(() => stopListen);
  };
  const onStopListen = () => {
    if (!stopListen) return;
    stopListen();
    setStopListen(null);
    setResponse({ status: "ready", data: null });
    setMessages("");
  };

  useEffect(() => {
    if (!stopListen) return;
    return () => {
      onStopListen();
    };
  }, [stopListen]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className={docUi.sectionLabel}>Variables</div>
        <Arg.Json
          value={gqlRequest}
          onChange={(value: string) => {
            setGqlRequest(value);
          }}
        />
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <button
          disabled={!!stopListen}
          className={buttonRecipe({ variant: "primary" }, "w-full")}
          onClick={() => {
            onListen();
          }}
          type="button"
        >
          <AiOutlineSwap /> Listen
        </button>
        <button
          disabled={!stopListen}
          className={buttonRecipe({ variant: "secondary" }, "w-full")}
          onClick={() => void onSend()}
          type="button"
        >
          <AiOutlineSend /> Send
        </button>
        <button
          disabled={!stopListen}
          className={buttonRecipe({ variant: "outline" }, "w-full")}
          onClick={() => {
            onStopListen();
          }}
          type="button"
        >
          <AiOutlineDisconnect /> Stop
        </button>
      </div>
      <Listener.Result status={response.status} data={messages} />
    </div>
  );
};
Message.Try = MessageTry;
