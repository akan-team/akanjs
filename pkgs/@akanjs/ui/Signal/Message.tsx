"use client";
import { isGqlScalar } from "@akanjs/base";
import { usePage } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import { constantInfo } from "@akanjs/constant";
import { fetch, makeRequestExample, SerializedEndpoint } from "@akanjs/signal";
import { useEffect, useMemo, useState } from "react";
import { AiOutlineDisconnect, AiOutlineFileWord, AiOutlineSend, AiOutlineSwap } from "react-icons/ai";
import { BiSolidNetworkChart } from "react-icons/bi";

import Arg from "./Arg";
import Listener from "./Listener";
import Object from "./Object";
import Response from "./Response";

export default function Message() {
  return <div></div>;
}

interface MessageEndpointProps {
  refName: string;
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
  open?: boolean;
}
const MessageEndpoint = ({ refName, gqlKey, gqlMeta, open }: MessageEndpointProps) => {
  const { l } = usePage();
  const [viewStatus, setViewStatus] = useState<"doc" | "test">("doc");
  const gqlArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type !== "Upload");
  const uploadArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Upload");
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
            <BiSolidNetworkChart className="text-xl" /> Message
          </button>
        </div>
        {viewStatus === "doc" ? (
          <MessageInterface refName={refName} gqlKey={gqlKey} gqlMeta={gqlMeta} />
        ) : (
          <MessageTry gqlKey={gqlKey} gqlMeta={gqlMeta} />
        )}
      </div>
    </div>
  );
};
Message.Endpoint = MessageEndpoint;

interface MessageInterfaceProps {
  refName: string;
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
}
const MessageInterface = ({ refName, gqlKey, gqlMeta }: MessageInterfaceProps) => {
  const returnRef = constantInfo.getModelRef(gqlMeta.returns.refName, gqlMeta.returns.modelType);
  const uploadArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Upload");
  const gqlArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type !== "Upload");
  const isReturnModelType = !isGqlScalar(returnRef);
  return (
    <div className="flex flex-col gap-4">
      {uploadArgMetas.length ? (
        <div>
          <div className="text-lg">Form data upload</div>
          <div className="bg-base-100 overflow-x-auto rounded-md p-3">
            <Arg.Table refName={refName} gqlKey={gqlKey} argMetas={uploadArgMetas} />
          </div>
        </div>
      ) : null}
      {gqlArgMetas.length ? (
        <div>
          <div className="text-lg">Variables</div>
          <div className="bg-base-100 overflow-x-auto rounded-md p-3">
            <Arg.Table refName={refName} gqlKey={gqlKey} argMetas={gqlArgMetas} />
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
Message.Interface = MessageInterface;

interface MessageTryProps {
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
}
const MessageTry = ({ gqlKey, gqlMeta }: MessageTryProps) => {
  const requestExample = useMemo(() => JSON.stringify(makeRequestExample(gqlMeta), null, 2), []);
  const [gqlRequest, setGqlRequest] = useState<string>(requestExample);
  const [stopListen, setStopListen] = useState<(() => void) | null>(null);
  const [messages, setMessages] = useState<string | boolean | object[]>("");
  const [response, setResponse] = useState<{
    status: "ready" | "error" | "listening" | "loading";
    data: string | boolean | object[] | null;
  }>({ status: "ready", data: "" });

  const onSend = async () => {
    const request = JSON.parse(gqlRequest) as { [key: string]: string | number | boolean | null };
    const argData = gqlMeta.args.map((argMeta) => request[argMeta.name]);
    const fetchFn = (fetch[gqlKey] as (...args: any[]) => Promise<any>).bind(fetch) as (...args: any[]) => Promise<any>;
    await fetchFn(...argData);
  };
  const onListen = () => {
    setResponse({ status: "loading", data: null });
    const fetchFn = (fetch[`listen${capitalize(gqlKey)}`] as (...args: any[]) => Promise<any>).bind(fetch) as (
      data: (data: any) => void
    ) => Promise<() => void>;
    setResponse({ status: "loading", data: messages });
    const stopListen = fetchFn((data: any) => {
      setMessages((prev) =>
        typeof data === "boolean"
          ? data
          : typeof data === "string"
            ? `${prev as string}\n${data}`
            : typeof data === "object"
              ? [...((prev && (prev as object[]).length ? [...(prev as object[])] : []) as object[]), data]
              : (data as string)
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
              <div className="text-lg">Message String</div>
              <div className="w-full items-center justify-center">
                <Request.Example value={gqlStr} />
              </div>
            </div> */}
        </div>
        <div className="relative flex items-start justify-center gap-2">
          <div className="flex w-full flex-col gap-2">
            <button
              disabled={!!stopListen}
              className="btn btn-success w-full"
              onClick={() => {
                onListen();
              }}
            >
              <AiOutlineSwap className="" /> Listen Message
            </button>
            <button disabled={!stopListen} className="btn btn-info w-full" onClick={() => void onSend()}>
              <AiOutlineSend className="" /> Send Message
            </button>
            <button
              disabled={!stopListen}
              className="btn btn-error w-full"
              onClick={() => {
                onStopListen();
              }}
            >
              <AiOutlineDisconnect className="" /> Stop Listen Message
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="text-lg">Response</div>
        <Listener.Result status={response.status} data={messages} />
      </div>
    </div>
  );
};
Message.Try = MessageTry;
