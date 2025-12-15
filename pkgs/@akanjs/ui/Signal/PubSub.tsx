"use client";
import { isGqlScalar } from "@akanjs/base";
import { usePage } from "@akanjs/client";
import { constantInfo } from "@akanjs/constant";
import { fetch, makeRequestExample, SerializedEndpoint } from "@akanjs/signal";
import { st } from "@akanjs/store";
import { useEffect, useMemo, useState } from "react";
import { AiOutlineDisconnect, AiOutlineFileWord, AiOutlineSwap } from "react-icons/ai";
import { BiSolidNetworkChart } from "react-icons/bi";

import Arg from "./Arg";
import Listener from "./Listener";
import Object from "./Object";
import Response from "./Response";

export default function PubSub() {
  return <div></div>;
}

interface PubSubEndpointProps {
  refName: string;
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
  open?: boolean;
}
const PubSubEndpoint = ({ refName, gqlKey, gqlMeta, open }: PubSubEndpointProps) => {
  const { l } = usePage();
  const [viewStatus, setViewStatus] = useState<"doc" | "test">("doc");
  return (
    <div className="collapse-arrow bg-base-300 collapse my-1">
      <input type="checkbox" checked={open} />
      <div className="collapse-title text-xl">
        <div className="flex items-center gap-3">
          <div className={`btn btn-xs w-16 ${gqlMeta.type === "pubsub" ? "btn-info" : "btn-warning"}`}>
            {gqlMeta.type}
          </div>
          {gqlKey} <span className="text-sm">({l._(`${refName}.signal.${gqlKey}`)})</span>
        </div>
      </div>
      <div className="collapse-content bg-base-200 w-full">
        <div className="mt-4 text-lg">
          Description
          <hr className="my-2 border-[0.1px] border-gray-400" />
          {gqlMeta.signalOption?.guards?.some((guard) => guard !== "None") ? (
            <div className="flex items-center gap-2 pb-3 pl-3 text-base font-normal">
              - Guards:
              {gqlMeta.signalOption.guards.map((guard) => (
                <span
                  className={`badge ${
                    guard === "Public"
                      ? "badge-success"
                      : guard === "SuperAdmin"
                        ? "badge-error"
                        : guard === "Admin"
                          ? "badge-error"
                          : guard === "User"
                            ? "badge-accent"
                            : guard === "Owner"
                              ? "badge-accent"
                              : guard === "Every"
                                ? "badge-warning"
                                : ""
                  }`}
                  key={guard}
                >
                  {guard}
                </span>
              ))}
            </div>
          ) : null}
          <div className="pb-3 pl-3 text-base font-normal">- {l._(`${refName}.signal.${gqlKey}.desc`)}</div>
        </div>
        <div className="my-4 flex w-full gap-5 px-5">
          <button
            onClick={() => {
              setViewStatus("doc");
            }}
            className={`btn btn-success w-1/2 ${viewStatus === "doc" ? "" : "btn-outline"}`}
          >
            <AiOutlineFileWord className="text-xl" /> View Doc
          </button>
          <button
            onClick={() => {
              setViewStatus("test");
            }}
            className={`btn btn-primary w-1/2 ${viewStatus === "test" ? "" : "btn-outline"}`}
          >
            <BiSolidNetworkChart className="text-xl" /> PubSub
          </button>
        </div>
        {viewStatus === "doc" ? (
          <PubSubInterface refName={refName} gqlKey={gqlKey} gqlMeta={gqlMeta} />
        ) : (
          <PubSubTry refName={refName} gqlKey={gqlKey} gqlMeta={gqlMeta} />
        )}
      </div>
    </div>
  );
};
PubSub.Endpoint = PubSubEndpoint;

interface PubSubInterfaceProps {
  refName: string;
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
  // gqlArgMetas: ArgMeta[];
  // uploadArgMetas: ArgMeta[];
}
const PubSubInterface = ({ refName, gqlKey, gqlMeta }: PubSubInterfaceProps) => {
  const returnRef = constantInfo.getModelRef(gqlMeta.returns.refName, gqlMeta.returns.modelType);
  const isReturnModelType = !isGqlScalar(returnRef);
  return (
    <div className="flex flex-col gap-4">
      {gqlMeta.args.length ? (
        <div>
          <div className="text-lg">Variables</div>
          <div className="bg-base-100 overflow-x-auto rounded-md p-3">
            <Arg.Table refName={refName} gqlKey={gqlKey} argMetas={gqlMeta.args} />
          </div>
        </div>
      ) : null}
      <div className="text-lg font-bold">
        <div className="flex w-full flex-col gap-2 rounded-md font-normal md:flex-row">
          <div className="w-full md:w-1/2">
            Response Type
            <div className="bg-base-100 max-h-[500px] overflow-auto rounded-md p-4 md:h-[500px]">
              Returns: <Object.Type objRef={returnRef} arrDepth={gqlMeta.returns.arrDepth} />
              {isReturnModelType ? <Object.Detail objRef={returnRef} /> : null}
            </div>
          </div>
          <div className="w-full md:w-1/2">
            Response Example
            <Response.Example gqlMeta={gqlMeta} />
          </div>
        </div>
      </div>
    </div>
  );
};
PubSub.Interface = PubSubInterface;

interface PubSubTryProps {
  refName: string;
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
}
const PubSubTry = ({ refName, gqlKey, gqlMeta }: PubSubTryProps) => {
  const tryJwt = st.use.tryJwt();
  const requestExample = useMemo(() => JSON.stringify(makeRequestExample(gqlMeta), null, 2), []);
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
    const argData = gqlMeta.args.map((argMeta) => request[argMeta.name]);

    const fetchFn = (fetch[gqlKey] as (...args: any[]) => Promise<any>).bind(fetch) as (
      ...args: [...args: (string | number | boolean | null)[], data: (data: unknown) => void]
    ) => Promise<() => void>;
    setResponse({ status: "loading", data: messages });
    const unsubscribe = fetchFn(...argData, (data: string | boolean | object[] | null) => {
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
              : data
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
            <div className="text-lg">Variables</div>
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
            className="btn btn-success w-1/2"
            onClick={() => {
              onSubscribe();
            }}
          >
            <AiOutlineSwap className="-mt-0.5" /> Subscribe PubSub
          </button>
          <button
            disabled={!unsubscribe}
            className="btn btn-error w-1/2"
            onClick={() => {
              onUnsubscribe();
            }}
          >
            <AiOutlineDisconnect className="-mt-0.5" /> Unsubscribe PubSub
          </button>
        </div>
      </div>

      <div>
        <div className="text-lg">Response</div>
        <Listener.Result status={response.status} data={messages} />
      </div>
    </div>
  );
};
PubSub.Try = PubSubTry;
