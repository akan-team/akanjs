"use client";
import { PrimitiveRegistry } from "akanjs/base";
import { usePage } from "akanjs/client";
import { type ConstantCls, ConstantRegistry } from "akanjs/constant";
import { FetchClient, type FetchProxy } from "akanjs/fetch";
import type { SerializedEndpoint } from "akanjs/signal";
import { st } from "akanjs/store";
import { useMemo, useState } from "react";
import { AiOutlineApi, AiOutlineCopy, AiOutlineFileWord, AiOutlineSend } from "react-icons/ai";
import { Copy } from "../Copy";
import { Signal } from ".";
import Arg from "./Arg";
import { getExampleData } from "./makeExample";
import Response from "./Response";
import { getEndpointBadgeClassName, getGuardBadgeClassName, signalUi } from "./style";

type RestApiFetchFn = (
  ...args: [...args: unknown[], option: { token?: string; crystalize?: boolean }]
) => Promise<unknown>;

export default function RestApi() {
  return <div></div>;
}

interface RestApiEndpointsProps {
  refName: string;
  fetch: FetchProxy;
  prefix?: string;
  endpoints?: string[];
  openAll?: boolean;
  httpUri?: string;
}
const RestApiEndpoints = ({ refName, fetch, prefix, endpoints, openAll, httpUri }: RestApiEndpointsProps) => {
  const tryRoles = st.use.tryRoles();
  const signal = fetch.serializedSignal[refName];
  const signalPrefix = prefix ?? signal.prefix;
  const baseEndpointEntries = Object.entries(FetchClient.getBaseEndpoint(refName, signal));
  const sliceEndpointEntries = signal.slice
    ? Object.entries(signal.slice).flatMap(([suffix, slice]) => {
        const endpoint = FetchClient.getEndpointFromSlice(refName, suffix, slice);
        return Object.entries(endpoint);
      })
    : [];
  const endpointEntries = [...baseEndpointEntries, ...sliceEndpointEntries, ...Object.entries(signal.endpoint)]
    .filter(([key, endpoint]) => !endpoints || endpoints.includes(key))
    .sort(([keyA], [keyB]) => (keyA > keyB ? 1 : -1))
    .filter(([key, endpoint]) => {
      if (endpoint.type === "pubsub" || endpoint.type === "message") return false;
      if (!endpoint.guards?.length) return true;
      if (endpoint.guards?.includes("Public") && tryRoles.includes("Public")) return true;
      if ((endpoint.guards?.includes("User") || endpoint.guards?.includes("Every")) && tryRoles.includes("User"))
        return true;
      if ((endpoint.guards?.includes("Admin") || endpoint.guards?.includes("Every")) && tryRoles.includes("Admin"))
        return true;
      if (
        (endpoint.guards?.includes("SuperAdmin") || endpoint.guards?.includes("Every")) &&
        tryRoles.includes("SuperAdmin")
      )
        return true;
      return false;
    });
  return (
    <div>
      {endpointEntries.map(([endpointKey, endpoint], idx) => (
        <RestApiEndpoint
          key={endpointKey}
          signalPrefix={signalPrefix}
          refName={refName}
          fetch={fetch}
          endpointKey={endpointKey}
          endpoint={endpoint}
          open={openAll}
          httpUri={httpUri}
        />
      ))}
    </div>
  );
};
RestApi.Endpoints = RestApiEndpoints;

interface RestApiEndpointProps {
  refName: string;
  fetch: FetchProxy;
  signalPrefix?: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
  open?: boolean;
  httpUri?: string;
}

const RestApiEndpoint = ({
  refName,
  fetch,
  signalPrefix,
  endpointKey,
  endpoint,
  open,
  httpUri,
}: RestApiEndpointProps) => {
  const { l } = usePage();
  const [viewStatus, setViewStatus] = useState<"doc" | "test">("doc");
  const path = FetchClient.makeHttpUrl(endpointKey, endpoint, signalPrefix, new Map());
  return (
    <div className={signalUi.endpointCard}>
      <input type="checkbox" defaultChecked={open} />
      <div className="collapse-title">
        <div className="flex flex-wrap items-center gap-2">
          <div className={getEndpointBadgeClassName(endpoint.type)}>{endpoint.type === "query" ? "GET" : "POST"}</div>
          <div className="font-bold text-lg">{path}</div>
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
            <AiOutlineApi className="text-xl" /> Restful API
          </button>
        </div>
        {viewStatus === "doc" ? (
          <RestApiInterface refName={refName} endpointKey={endpointKey} endpoint={endpoint} />
        ) : (
          <RestApiTry
            signalPrefix={signalPrefix}
            fetch={fetch}
            refName={refName}
            endpointKey={endpointKey}
            endpoint={endpoint}
            httpUri={httpUri}
          />
        )}
      </div>
    </div>
  );
};
RestApi.Endpoint = RestApiEndpoint;

interface RestApiInterfaceProps {
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
}
const RestApiInterface = ({ refName, endpointKey, endpoint }: RestApiInterfaceProps) => {
  const returnRef = ConstantRegistry.getModelRef(endpoint.returns.refName, endpoint.returns.modelType);
  const isReturnModelType = !PrimitiveRegistry.has(returnRef);
  const uploadArgs = endpoint.args.filter((arg) => arg.type === "upload");
  const paramArgs = endpoint.args.filter((arg) => arg.type === "param");
  const searchArgs = endpoint.args.filter((arg) => arg.type === "search");
  const bodyArgs = endpoint.args.filter((arg) => arg.type === "body");
  return (
    <div className="flex w-full flex-col gap-4">
      {uploadArgs.length ? (
        <div>
          <div className={signalUi.sectionTitle}>Form data upload</div>
          <div className={signalUi.tablePanel}>
            <Arg.Table refName={refName} endpointKey={endpointKey} args={uploadArgs} />
          </div>
        </div>
      ) : null}
      {paramArgs.length ? (
        <div>
          <div className={signalUi.sectionTitle}>Parameters</div>
          <div className={signalUi.tablePanel}>
            <Arg.Table refName={refName} endpointKey={endpointKey} args={paramArgs} />
          </div>
        </div>
      ) : null}
      {searchArgs.length ? (
        <div>
          <div className={signalUi.sectionTitle}>Query</div>
          <div className={signalUi.tablePanel}>
            <Arg.Table refName={refName} endpointKey={endpointKey} args={searchArgs} />
          </div>
        </div>
      ) : null}
      {bodyArgs.length ? (
        <div>
          <div className={signalUi.sectionTitle}>Body</div>
          <div className={signalUi.tablePanel}>
            <Arg.Table refName={refName} endpointKey={endpointKey} args={bodyArgs} />
          </div>
        </div>
      ) : null}
      <div className="font-bold text-lg">
        <div className="flex w-full flex-col gap-2 rounded-md font-normal md:flex-row">
          <div className="w-full md:w-1/2">
            <div className={signalUi.sectionTitle}>Response Type</div>
            <div className="max-h-72 overflow-auto rounded-xl bg-base-100 p-4 md:h-72">
              Returns: <Signal.Object.Type objRef={returnRef} arrDepth={endpoint.returns.arrDepth ?? 0} />
              {isReturnModelType ? <Signal.Object.Detail objRef={returnRef as ConstantCls} /> : null}
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
RestApi.Interface = RestApiInterface;

interface RestApiTryProps {
  signalPrefix?: string;
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
  fetch: FetchProxy;
  httpUri?: string;
}
const RestApiTry = ({ signalPrefix, refName, endpointKey, endpoint, fetch, httpUri }: RestApiTryProps) => {
  const queryArgs = endpoint.args.filter((arg) => arg.type === "search");
  const paramArgs = endpoint.args.filter((arg) => arg.type === "param");
  const bodyArgs = endpoint.args.filter((arg) => arg.type === "body");
  const uploadArgs = endpoint.args.filter((arg) => arg.type === "upload");
  const tryJwt = st.use.tryJwt();
  const paramExample = useMemo(() => getExampleData<string>(paramArgs, "restapi"), []);
  const queryExample = useMemo(() => getExampleData<string>(queryArgs, "restapi"), []);
  const bodyExample = useMemo(() => JSON.stringify(getExampleData(bodyArgs, "restapi"), null, 2), []);
  const [paramRequest, setParamRequest] = useState<{ [key: string]: string }>(paramExample);
  const [queryRequest, setQueryRequest] = useState<{ [key: string]: string }>(queryExample);
  const [bodyRequest, setBodyRequest] = useState<string>(bodyExample);
  const [uploadRequest, setUploadRequest] = useState<Record<string, FileList | undefined>>({});
  const [response, setResponse] = useState<{ status: "idle" | "success" | "error" | "loading"; data: unknown }>({
    status: "idle",
    data: null,
  });
  const getUrlArgMap = () =>
    new Map<string, unknown>([
      ...paramArgs.map((arg) => [arg.name, paramRequest[arg.name]] as const),
      ...queryArgs.map((arg) => [arg.name, queryRequest[arg.name]] as const),
    ]);
  const requestPath = FetchClient.makeHttpUrl(endpointKey, endpoint, signalPrefix, getUrlArgMap());
  const getUploadValue = (arg: SerializedEndpoint["args"][number]) => {
    const files = Array.from(uploadRequest[arg.name] ?? []);
    return (arg.arrDepth ?? 0) > 0 ? files : (files[0] ?? null);
  };
  const getArgData = () => {
    const bodyObj = bodyArgs.length ? (JSON.parse(bodyRequest) as Record<string, unknown>) : {};
    return endpoint.args.map((arg) => {
      if (arg.type === "param") return paramRequest[arg.name];
      if (arg.type === "search") return queryRequest[arg.name];
      if (arg.type === "body") return bodyObj[arg.name];
      if (arg.type === "upload") return getUploadValue(arg);
      return null;
    });
  };
  const getRequestFetch = () => {
    if (!httpUri) return fetch;
    return fetch.clone({ origin: httpUri, connect: false, jwt: tryJwt || undefined });
  };
  const formatError = (error: unknown) => {
    if (error instanceof Error) return { ...error, message: error.message };
    return error;
  };
  const onSend = async () => {
    setResponse({ status: "loading", data: null });
    try {
      const requestFetch = getRequestFetch();
      const fetchFn = (requestFetch as unknown as Record<string, RestApiFetchFn>)[endpointKey].bind(requestFetch) as (
        ...args: [...args: unknown[], option: { token?: string; crystalize?: boolean }]
      ) => Promise<unknown>;
      const data = await fetchFn(...getArgData(), { token: tryJwt || undefined, crystalize: false });
      setResponse({ status: "success", data });
    } catch (error) {
      setResponse({ status: "error", data: formatError(error) });
    }
  };
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-base-100 p-3">
        <div className={signalUi.sectionTitle}>Request URL</div>
        <Copy text={`${httpUri ?? ""}${requestPath}`}>
          <button className="btn btn-sm btn-outline">
            {requestPath} <AiOutlineCopy />
          </button>
        </Copy>
      </div>
      {uploadArgs.length ? (
        <div>
          <div className={signalUi.sectionTitle}>Form data upload</div>
          {uploadArgs.map((arg) => (
            <Arg.FormData
              key={arg.name}
              endpointKey={endpointKey}
              arg={arg}
              value={""}
              onChange={(fileList: FileList) => {
                setUploadRequest({ ...uploadRequest, [arg.name]: fileList });
              }}
            />
          ))}
        </div>
      ) : null}
      {paramArgs.length ? (
        <div className={signalUi.sectionPanel}>
          <div className={signalUi.sectionTitle}>Parameters</div>
          {paramArgs.map((arg, idx) => (
            <Arg.Param
              key={idx}
              endpointKey={endpointKey}
              arg={arg}
              value={paramRequest[arg.name]}
              onChange={(value: string) => {
                setParamRequest({ ...paramRequest, [arg.name]: value });
              }}
            />
          ))}
        </div>
      ) : null}
      {queryArgs.length ? (
        <div className={signalUi.sectionPanel}>
          <div className={signalUi.sectionTitle}>Queries</div>
          {queryArgs.map((arg, idx) => (
            <Arg.Query
              key={idx}
              endpointKey={endpointKey}
              arg={arg}
              value={queryRequest[arg.name] ?? ""}
              onChange={(value: string) => {
                setQueryRequest({ ...queryRequest, [arg.name]: value });
              }}
            />
          ))}
        </div>
      ) : null}
      {bodyArgs.length ? (
        <div>
          <div className={signalUi.sectionTitle}>Body</div>
          <Arg.Json value={bodyRequest} onChange={setBodyRequest} />
        </div>
      ) : null}
      <div>
        <button className="btn btn-primary w-full" onClick={() => void onSend()}>
          <AiOutlineSend className="-mt-0.5" /> Send Request
        </button>
      </div>
      <div>
        <div className={signalUi.sectionTitle}>Response</div>
        <Response.Result status={response.status} data={response.data as object} />
      </div>
    </div>
  );
};
RestApi.Try = RestApiTry;
