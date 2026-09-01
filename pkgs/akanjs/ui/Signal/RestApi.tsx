"use client";
import { PrimitiveRegistry } from "akanjs/base";
import { cn, usePage } from "akanjs/client";
import { mcpHintsOf, mcpRefusalOf } from "akanjs/common";
import { type ConstantCls, ConstantRegistry } from "akanjs/constant";
import { FetchClient, type FetchProxy } from "akanjs/fetch";
import type { SerializedEndpoint } from "akanjs/signal";
import { st } from "akanjs/store";
import { type ReactNode, useMemo, useState } from "react";
import { AiOutlineApi, AiOutlineCopy, AiOutlineFileWord, AiOutlineSend, AiOutlineWarning } from "react-icons/ai";
import { buttonRecipe } from "../Button";
import { Copy } from "../Copy";
import { Collapse, dictText, docPill, docUi, Panel, Segmented } from "../Reference";
import { Signal } from ".";
import Arg from "./Arg";
import { endpointEntriesOf, guardsOf, isWsEndpoint, matchesGuards, matchesSearch } from "./endpointEntries";
import { getExampleData } from "./makeExample";
import Response from "./Response";
import { getGuardBadgeClassName, getMcpBadgeClassName, getMethodBadgeClassName, getMethodLabel } from "./style";

type RestApiFetchFn = (
  ...args: [...args: unknown[], option: { token?: string; crystalize?: boolean }]
) => Promise<unknown>;

export default function RestApi() {
  return <div></div>;
}

const restViewItems = [
  { key: "doc", label: "Reference", icon: <AiOutlineFileWord /> },
  { key: "test", label: "Try it", icon: <AiOutlineApi /> },
] as const;

interface ArgSectionProps {
  label: string;
  children: ReactNode;
}
const ArgSection = ({ label, children }: ArgSectionProps) => (
  <div className="flex flex-col gap-2">
    <div className={docUi.sectionLabel}>{label}</div>
    {children}
  </div>
);

interface RestApiEndpointsProps {
  refName: string;
  fetch: FetchProxy;
  prefix?: string;
  endpoints?: string[];
  openAll?: boolean;
  httpUri?: string;
  search?: string;
}
const RestApiEndpoints = ({ refName, fetch, prefix, endpoints, openAll, httpUri, search }: RestApiEndpointsProps) => {
  const tryGuards = st.use.tryGuards({ agent: false });
  const signal = fetch.serializedSignal[refName];
  if (!signal) return <div className={docUi.emptyPanel}>No signal is registered as “{refName}”.</div>;
  const signalPrefix = prefix ?? signal.prefix;
  const endpointEntries = endpointEntriesOf(refName, fetch)
    .filter(({ key }) => !endpoints || endpoints.includes(key))
    .filter(({ key, endpoint }) =>
      matchesSearch(key, FetchClient.makeHttpUrl(key, endpoint, signalPrefix, new Map()), search ?? ""),
    )
    .filter(({ endpoint }) => !isWsEndpoint(endpoint) && matchesGuards(endpoint, tryGuards));
  if (!endpointEntries.length)
    return (
      <div className={docUi.emptyPanel}>
        {search?.trim() ? `No endpoint matches “${search.trim()}”.` : "No endpoint is gated by the selected guards."}
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {endpointEntries.map(({ key, endpoint }) => (
        <RestApiEndpoint
          key={key}
          signalPrefix={signalPrefix}
          refName={refName}
          fetch={fetch}
          endpointKey={key}
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
  // The same fail-closed rules the server runs, so the badge says what the catalogue says. Exposure follows the
  // guards, so every endpoint is a candidate and the refusal is the whole answer.
  const mcpRefusal = mcpRefusalOf(endpoint);
  const guards = guardsOf(endpoint);
  const label = dictText(l, `${refName}.signal.${endpointKey}`);
  const desc = dictText(l, `${refName}.signal.${endpointKey}.desc`);
  const hints = Object.entries(mcpHintsOf(endpointKey, endpoint)).filter(([, on]) => on);
  return (
    <Collapse
      open={open}
      summary={
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={getMethodBadgeClassName(endpoint.type)}>{getMethodLabel(endpoint.type)}</span>
            <span className="break-all font-medium font-mono text-sm">{path}</span>
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              {guards.map((guard) => (
                <span className={getGuardBadgeClassName(guard)} key={guard}>
                  {guard}
                </span>
              ))}
              <span className={getMcpBadgeClassName(!mcpRefusal)}>{mcpRefusal ? "MCP refused" : "MCP"}</span>
            </span>
          </div>
          {label ? <div className="text-foreground/55 text-sm">{label}</div> : null}
        </div>
      }
    >
      {desc ? <p className={docUi.prose}>{desc}</p> : null}
      {mcpRefusal ? (
        <div className="flex items-start gap-2 rounded-box border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <AiOutlineWarning className="mt-0.5 shrink-0" />
          <span>{mcpRefusal}</span>
        </div>
      ) : hints.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {hints.map(([hint]) => (
            <span className={docPill("muted")} key={hint}>
              {hint}
            </span>
          ))}
        </div>
      ) : null}
      <Segmented items={restViewItems} onChange={setViewStatus} value={viewStatus} />
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
    </Collapse>
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
  const argSections = [
    { label: "Form data", args: endpoint.args.filter((arg) => arg.type === "upload") },
    { label: "Path parameters", args: endpoint.args.filter((arg) => arg.type === "param") },
    { label: "Query", args: endpoint.args.filter((arg) => arg.type === "search") },
    { label: "Body", args: endpoint.args.filter((arg) => arg.type === "body") },
  ].filter((section) => section.args.length);
  return (
    <div className="flex w-full flex-col gap-4">
      {argSections.map((section) => (
        <ArgSection key={section.label} label={section.label}>
          <div className={docUi.tablePanel}>
            <Arg.Table refName={refName} endpointKey={endpointKey} args={section.args} />
          </div>
        </ArgSection>
      ))}
      <div className="grid gap-3 md:grid-cols-2 md:items-start">
        <Panel bodyClassName="max-h-none" label="Returns">
          <div className="flex flex-col items-start gap-3">
            <Signal.Object.Type objRef={returnRef} arrDepth={endpoint.returns.arrDepth ?? 0} />
            {isReturnModelType ? (
              <Signal.Object.Detail className="w-full border-0 bg-transparent" objRef={returnRef as ConstantCls} />
            ) : null}
          </div>
        </Panel>
        <Response.Example endpoint={endpoint} />
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
  const tryJwt = st.use.tryJwt({ agent: false });
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
      <div className="flex flex-wrap items-center gap-2 rounded-box border border-border bg-background px-3 py-2">
        <span className={getMethodBadgeClassName(endpoint.type)}>{getMethodLabel(endpoint.type)}</span>
        <span className="min-w-0 flex-1 break-all font-mono text-foreground/80 text-sm">
          {httpUri ?? ""}
          {requestPath}
        </span>
        <Copy text={`${httpUri ?? ""}${requestPath}`}>
          <button className={buttonRecipe({ variant: "ghost", size: "xs" }, "text-foreground/50")} type="button">
            <AiOutlineCopy />
          </button>
        </Copy>
      </div>
      {uploadArgs.length ? (
        <ArgSection label="Form data">
          <div className={docUi.panel}>
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
        </ArgSection>
      ) : null}
      {paramArgs.length ? (
        <ArgSection label="Path parameters">
          <div className={cn(docUi.panel, "px-3 py-1")}>
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
        </ArgSection>
      ) : null}
      {queryArgs.length ? (
        <ArgSection label="Query">
          <div className={cn(docUi.panel, "px-3 py-1")}>
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
        </ArgSection>
      ) : null}
      {bodyArgs.length ? (
        <ArgSection label="Body">
          <Arg.Json value={bodyRequest} onChange={setBodyRequest} />
        </ArgSection>
      ) : null}
      <button className={buttonRecipe({ variant: "primary" }, "w-full")} onClick={() => void onSend()} type="button">
        <AiOutlineSend /> Send Request
      </button>
      <Response.Result status={response.status} data={response.data as object} />
    </div>
  );
};
RestApi.Try = RestApiTry;
