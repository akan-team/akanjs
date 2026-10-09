"use client";
import { cn, usePage } from "akanjs/client";
import { mcpHintsOf, mcpRefusalOf } from "akanjs/common";
import { FetchClient, type FetchProxy } from "akanjs/fetch";
import type { SerializedEndpoint } from "akanjs/signal";
import { st } from "akanjs/store";
import { useMemo, useState } from "react";
import { AiOutlineApi, AiOutlineCopy, AiOutlineFileWord, AiOutlineSend, AiOutlineWarning } from "react-icons/ai";
import { buttonRecipe } from "../Button";
import { Copy } from "../Copy";
import { docPill, docUi, Segmented } from "../Reference";
import Arg from "./Arg";
import { ArgSection, EndpointCollapse, EndpointInterface } from "./Endpoint";
import { endpointEntriesOf, isWsEndpoint, matchesGuards, matchesSearch, runtimeFetch } from "./endpointEntries";
import { getExampleData } from "./makeExample";
import { ResponseResult } from "./Response";
import { noSearchMatchText, noSignalText, signalText } from "./signalText";
import { getMcpBadgeClassName, getMethodBadgeClassName, getMethodLabel } from "./style";

type RestApiFetchFn = (
  ...args: [...args: unknown[], option: { token?: string; crystalize?: boolean }]
) => Promise<unknown>;

interface RestApiEndpointsProps {
  refName: string;
  fetch?: FetchProxy;
  prefix?: string;
  endpoints?: string[];
  openAll?: boolean;
  httpUri?: string;
  search?: string;
}
export const RestApiEndpoints = ({
  refName,
  fetch = runtimeFetch,
  prefix,
  endpoints,
  openAll,
  httpUri,
  search,
}: RestApiEndpointsProps) => {
  const { l } = usePage();
  const tryGuards = st.use.tryGuards({ agent: false });
  const signal = fetch.serializedSignal[refName];
  if (!signal) return <div className={docUi.emptyPanel}>{l.trans(noSignalText(refName))}</div>;
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
        {search?.trim() ? l.trans(noSearchMatchText(search.trim())) : l.trans(signalText.noGuardMatch)}
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
interface RestApiEndpointProps {
  refName: string;
  fetch?: FetchProxy;
  signalPrefix?: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
  open?: boolean;
  httpUri?: string;
}

export const RestApiEndpoint = ({
  refName,
  fetch = runtimeFetch,
  signalPrefix,
  endpointKey,
  endpoint,
  open,
  httpUri,
}: RestApiEndpointProps) => {
  const { l } = usePage();
  const [viewStatus, setViewStatus] = useState<"doc" | "test">("doc");
  const restViewItems = [
    { key: "doc", label: l.trans(signalText.reference), icon: <AiOutlineFileWord /> },
    { key: "test", label: l.trans(signalText.tryIt), icon: <AiOutlineApi /> },
  ] as const;
  const path = FetchClient.makeHttpUrl(endpointKey, endpoint, signalPrefix, new Map());
  // The server's own fail-closed rules, so the badge says what the MCP catalogue says.
  const mcpRefusal = mcpRefusalOf(endpoint, { refName, key: endpointKey });
  const hints = Object.entries(mcpHintsOf(endpointKey, endpoint)).filter(([, on]) => on);
  return (
    <EndpointCollapse
      refName={refName}
      endpointKey={endpointKey}
      endpoint={endpoint}
      open={open}
      badge={<span className={getMethodBadgeClassName(endpoint.type)}>{getMethodLabel(endpoint.type)}</span>}
      title={path}
      extraBadge={<span className={getMcpBadgeClassName(!mcpRefusal)}>{mcpRefusal ? "MCP refused" : "MCP"}</span>}
    >
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
    </EndpointCollapse>
  );
};
interface RestApiInterfaceProps {
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
}
export const RestApiInterface = ({ refName, endpointKey, endpoint }: RestApiInterfaceProps) => {
  const { l } = usePage();
  return (
    <EndpointInterface
      className="flex w-full flex-col gap-4"
      refName={refName}
      endpointKey={endpointKey}
      endpoint={endpoint}
      argSections={[
        { label: l.trans(signalText.formData), args: endpoint.args.filter((arg) => arg.type === "upload") },
        { label: l.trans(signalText.pathParameters), args: endpoint.args.filter((arg) => arg.type === "param") },
        { label: l.trans(signalText.query), args: endpoint.args.filter((arg) => arg.type === "search") },
        { label: l.trans(signalText.body), args: endpoint.args.filter((arg) => arg.type === "body") },
      ]}
      returnsLabel={l.trans(signalText.returns)}
    />
  );
};

interface RestApiTryProps {
  signalPrefix?: string;
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
  fetch?: FetchProxy;
  httpUri?: string;
}
export const RestApiTry = ({
  signalPrefix,
  refName,
  endpointKey,
  endpoint,
  fetch = runtimeFetch,
  httpUri,
}: RestApiTryProps) => {
  const { l } = usePage();
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
        <ArgSection label={l.trans(signalText.formData)}>
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
        <ArgSection label={l.trans(signalText.pathParameters)}>
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
        <ArgSection label={l.trans(signalText.query)}>
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
        <ArgSection label={l.trans(signalText.body)}>
          <Arg.Json value={bodyRequest} onChange={setBodyRequest} />
        </ArgSection>
      ) : null}
      <button className={buttonRecipe({ variant: "primary" }, "w-full")} onClick={() => void onSend()} type="button">
        <AiOutlineSend /> {l.trans(signalText.sendRequest)}
      </button>
      <ResponseResult status={response.status} data={response.data as object} />
    </div>
  );
};
