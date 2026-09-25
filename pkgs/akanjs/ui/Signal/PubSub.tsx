"use client";
import { PrimitiveRegistry } from "akanjs/base";
import { fetch, usePage } from "akanjs/client";
import { type ConstantCls, ConstantRegistry } from "akanjs/constant";
import type { SerializedEndpoint } from "akanjs/signal";
import { useEffect, useMemo, useState } from "react";
import { AiOutlineDisconnect, AiOutlineFileWord, AiOutlineSwap } from "react-icons/ai";
import { BiSolidNetworkChart } from "react-icons/bi";
import Arg from "./Arg";
import Listener from "./Listener";
import { makeRequestExample } from "./makeExample";
import UiObject from "./Object";
import Response from "./Response";
import { getEndpointBadgeClassName, getGuardBadgeClassName, signalUi } from "./style";

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
  return (
    <div className={signalUi.endpointCard}>
      <input type="checkbox" defaultChecked={open} />
      <div className="collapse-title">
        <div className="flex flex-wrap items-center gap-2">
          <div className={getEndpointBadgeClassName(endpoint.type)}>{endpoint.type}</div>
          <div className="font-bold text-lg">{endpointKey}</div>
          <div className="text-base-content/70 text-sm">{l._(`${refName}.signal.${endpointKey}`)}</div>
        </div>
      </div>
      <div className={signalUi.endpointContent}>
        <div className="rounded-xl bg-base-100 p-3">
          <div className={signalUi.sectionTitle}>Description</div>
          {endpoint.guards?.some((guard) => guard !== "None") ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 font-normal text-sm">
              <span className="text-base-content/70">Guards</span>
              {endpoint.guards.map((guard) => (
                <span className={getGuardBadgeClassName(guard)} key={guard}>
                  {guard}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-2 font-normal text-base-content/70 text-sm">
            {l._(`${refName}.signal.${endpointKey}.desc`)}
          </div>
        </div>
        <div className="join w-fit">
          <button
            onClick={() => {
              setViewStatus("doc");
            }}
            className={`btn join-item btn-sm ${viewStatus === "doc" ? "btn-primary" : "btn-outline"}`}
          >
            <AiOutlineFileWord className="text-xl" /> View Doc
          </button>
          <button
            onClick={() => {
              setViewStatus("test");
            }}
            className={`btn join-item btn-sm ${viewStatus === "test" ? "btn-primary" : "btn-outline"}`}
          >
            <BiSolidNetworkChart className="text-xl" /> PubSub
          </button>
        </div>
        {viewStatus === "doc" ? (
          <PubSubInterface refName={refName} endpointKey={endpointKey} endpoint={endpoint} />
        ) : (
          <PubSubTry refName={refName} endpointKey={endpointKey} endpoint={endpoint} />
        )}
      </div>
    </div>
  );
};
PubSub.Endpoint = PubSubEndpoint;

interface PubSubInterfaceProps {
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
  // gqlArgMetas: ArgMeta[];
  // uploadArgMetas: ArgMeta[];
}
const PubSubInterface = ({ refName, endpointKey, endpoint }: PubSubInterfaceProps) => {
  const returnRef = ConstantRegistry.getModelRef(endpoint.returns.refName, endpoint.returns.modelType);
  const isReturnModelType = !PrimitiveRegistry.has(returnRef);
  return (
    <div className="flex flex-col gap-4">
      {endpoint.args.length ? (
        <div>
          <div className={signalUi.sectionTitle}>Variables</div>
          <div className={signalUi.tablePanel}>
            <Arg.Table refName={refName} endpointKey={endpointKey} args={endpoint.args} />
          </div>
        </div>
      ) : null}
      <div className="font-bold text-lg">
        <div className="flex w-full flex-col gap-2 rounded-md font-normal md:flex-row">
          <div className="w-full md:w-1/2">
            <div className={signalUi.sectionTitle}>Response Type</div>
            <div className="max-h-[500px] overflow-auto rounded-xl bg-base-100 p-4 md:h-[500px]">
              Returns: <UiObject.Type objRef={returnRef} arrDepth={endpoint.returns.arrDepth ?? 0} />
              {isReturnModelType ? <UiObject.Detail objRef={returnRef as ConstantCls} /> : null}
            </div>
          </div>
          <div className="w-full md:w-1/2">
            <div className={signalUi.sectionTitle}>Response Example</div>
            <Response.Example endpoint={endpoint} />
          </div>
        </div>
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
      <div>
        <div className="grid gap-2 lg:grid-cols-2">
          <div>
            <div className={signalUi.sectionTitle}>Variables</div>
            <div className="w-full items-center justify-center">
              <Arg.Json
                value={gqlRequest}
                onChange={(value: string) => {
                  setGqlRequest(value);
                }}
              />
            </div>
          </div>
          {/* <div>
              <div className="text-lg">PubSub String</div>
              <div className="w-full items-center justify-center">
                <Request.Example value={gqlStr} />
              </div>
            </div> */}
        </div>
        <div className="relative flex items-center justify-center gap-2">
          <button
            disabled={!!unsubscribe}
            className="btn btn-primary w-1/2"
            onClick={() => {
              onSubscribe();
            }}
          >
            <AiOutlineSwap className="-mt-0.5" /> Subscribe PubSub
          </button>
          <button
            disabled={!unsubscribe}
            className="btn btn-outline w-1/2"
            onClick={() => {
              onUnsubscribe();
            }}
          >
            <AiOutlineDisconnect className="-mt-0.5" /> Unsubscribe PubSub
          </button>
        </div>
      </div>

      <div>
        <div className={signalUi.sectionTitle}>Response</div>
        <Listener.Result status={response.status} data={messages} />
      </div>
    </div>
  );
};
PubSub.Try = PubSubTry;
