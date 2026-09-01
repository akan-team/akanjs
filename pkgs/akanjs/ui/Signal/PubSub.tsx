"use client";
import { PrimitiveRegistry } from "akanjs/base";
import { fetch, usePage } from "akanjs/client";
import { type ConstantCls, ConstantRegistry } from "akanjs/constant";
import type { SerializedEndpoint } from "akanjs/signal";
import { useEffect, useMemo, useState } from "react";
import { AiOutlineDisconnect, AiOutlineFileWord, AiOutlineSwap } from "react-icons/ai";
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

const pubsubViewItems = [
  { key: "doc", label: "Reference", icon: <AiOutlineFileWord /> },
  { key: "test", label: "Try it", icon: <BiSolidNetworkChart /> },
] as const;

export default function PubSub() {
  return <div></div>;
}

interface PubSubEndpointProps {
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
  open?: boolean;
}
const PubSubEndpoint = ({ refName, endpointKey, endpoint, open }: PubSubEndpointProps) => {
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
      <Segmented items={pubsubViewItems} onChange={setViewStatus} value={viewStatus} />
      {viewStatus === "doc" ? (
        <PubSubInterface refName={refName} endpointKey={endpointKey} endpoint={endpoint} />
      ) : (
        <PubSubTry refName={refName} endpointKey={endpointKey} endpoint={endpoint} />
      )}
    </Collapse>
  );
};
PubSub.Endpoint = PubSubEndpoint;

interface PubSubInterfaceProps {
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
}
const PubSubInterface = ({ refName, endpointKey, endpoint }: PubSubInterfaceProps) => {
  const returnRef = ConstantRegistry.getModelRef(endpoint.returns.refName, endpoint.returns.modelType);
  const isReturnModelType = !PrimitiveRegistry.has(returnRef);
  return (
    <div className="flex flex-col gap-4">
      {endpoint.args.length ? (
        <div className="flex flex-col gap-2">
          <div className={docUi.sectionLabel}>Variables</div>
          <div className={docUi.tablePanel}>
            <Arg.Table refName={refName} endpointKey={endpointKey} args={endpoint.args} />
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 md:items-start">
        <Panel bodyClassName="max-h-none" label="Publishes">
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
PubSub.Interface = PubSubInterface;

interface PubSubTryProps {
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
}
const PubSubTry = ({ refName, endpointKey, endpoint }: PubSubTryProps) => {
  const requestExample = useMemo(() => JSON.stringify(makeRequestExample(endpoint), null, 2), []);
  const [gqlRequest, setGqlRequest] = useState<string>(requestExample);
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);
  const [messages, setMessages] = useState<string | boolean | object[] | null>("");
  const [response, setResponse] = useState<{
    status: "ready" | "error" | "listening" | "loading";
    data: string | boolean | object[] | null;
  }>({ status: "ready", data: "" });
  const onSubscribe = () => {
    setResponse({ status: "loading", data: "" });
    const request = JSON.parse(gqlRequest) as { [key: string]: string | number | boolean | null };
    const argData = endpoint.args.map((arg) => request[arg.name]);

    const fetchFn = ((fetch as any)[endpointKey] as (...args: any[]) => Promise<any>).bind(fetch) as (
      ...args: [...args: (string | number | boolean | null)[], data: (data: unknown) => void]
    ) => Promise<() => void>;
    setResponse({ status: "loading", data: messages });
    const unsubscribe = fetchFn(...argData, (data: any) => {
      setMessages((prev) =>
        typeof data === "boolean"
          ? data
          : typeof data === "string"
            ? `${prev as string}\n${data}`
            : typeof data === "object"
              ? ([
                  ...(((prev as object[] | undefined)?.length ? [...(prev as object[])] : []) as object[]),
                  data,
                ] as object[])
              : data,
      );
    });
    setResponse({ status: "listening", data: messages });
    setUnsubscribe(() => unsubscribe);
  };
  const onUnsubscribe = () => {
    if (!unsubscribe) return;
    unsubscribe();
    setUnsubscribe(null);
    setResponse({ status: "ready", data: null });
    setMessages("");
  };

  useEffect(() => {
    if (!unsubscribe) return;
    return () => {
      onUnsubscribe();
    };
  }, [unsubscribe]);

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
      <div className="grid gap-2 md:grid-cols-2">
        <button
          disabled={!!unsubscribe}
          className={buttonRecipe({ variant: "primary" }, "w-full")}
          onClick={() => {
            onSubscribe();
          }}
          type="button"
        >
          <AiOutlineSwap /> Subscribe
        </button>
        <button
          disabled={!unsubscribe}
          className={buttonRecipe({ variant: "outline" }, "w-full")}
          onClick={() => {
            onUnsubscribe();
          }}
          type="button"
        >
          <AiOutlineDisconnect /> Unsubscribe
        </button>
      </div>
      <Listener.Result status={response.status} data={messages} />
    </div>
  );
};
PubSub.Try = PubSubTry;
