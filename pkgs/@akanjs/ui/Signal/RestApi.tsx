"use client";
import { baseClientEnv, isGqlScalar } from "@akanjs/base";
import { usePage } from "@akanjs/client";
import { constantInfo, getGqlTypeStr } from "@akanjs/constant";
import { getExampleData, SerializedEndpoint, SerializedSignal } from "@akanjs/signal";
import { st } from "@akanjs/store";
import React, { useMemo, useState } from "react";
import { AiOutlineApi, AiOutlineCopy, AiOutlineFileWord, AiOutlineSend } from "react-icons/ai";

import { Copy } from "../Copy";
import { Signal } from ".";
import Arg from "./Arg";
import Response from "./Response";

const getControllerPath = (gqlKey: string, gqlMeta: SerializedEndpoint) => {
  return (
    gqlMeta.signalOption?.path ??
    [
      gqlMeta.signalOption?.name ?? gqlKey,
      ...gqlMeta.args.filter((argMeta) => argMeta.type === "Param").map((argMeta) => `:${argMeta.name}`),
    ].join("/")
  );
};

export default function RestApi() {
  return <div></div>;
}

interface RestApiEndpointsProps {
  refName: string;
  prefix?: string;
  endpoints?: string[];
  openAll?: boolean;
  httpUri?: string;
}
const RestApiEndpoints = ({ refName, prefix, endpoints, openAll, httpUri }: RestApiEndpointsProps) => {
  const signals = global.signals as SerializedSignal[];
  const signal = signals.find((signal) => signal.refName === refName);
  if (!signal) return null;
  const tryRoles = st.use.tryRoles();
  const gqlInfos = Object.entries(signal.endpoint)
    .filter(([key, gqlMeta]) => !endpoints || endpoints.includes(key))
    .sort(([keyA], [keyB]) => (keyA > keyB ? 1 : -1))
    .filter(([key, gqlMeta]) => gqlMeta.signalOption?.onlyFor !== "graphql")
    .filter(([key, gqlMeta]) => {
      if (gqlMeta.type === "pubsub" || gqlMeta.type === "message") return false;
      if (gqlMeta.signalOption?.guards?.includes("Public") && tryRoles.includes("Public")) return true;
      if (
        (gqlMeta.signalOption?.guards?.includes("User") || gqlMeta.signalOption?.guards?.includes("Every")) &&
        tryRoles.includes("User")
      )
        return true;
      if (
        (gqlMeta.signalOption?.guards?.includes("Admin") || gqlMeta.signalOption?.guards?.includes("Every")) &&
        tryRoles.includes("Admin")
      )
        return true;
      if (
        (gqlMeta.signalOption?.guards?.includes("SuperAdmin") || gqlMeta.signalOption?.guards?.includes("Every")) &&
        tryRoles.includes("SuperAdmin")
      )
        return true;
      return false;
    });
  return (
    <div>
      {gqlInfos.map(([gqlKey, gqlMeta], idx) => (
        <RestApiEndpoint
          key={idx}
          prefix={prefix}
          refName={refName}
          gqlKey={gqlKey}
          gqlMeta={gqlMeta}
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
  prefix?: string;
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
  open?: boolean;
  httpUri?: string;
}

const RestApiEndpoint = ({ refName, prefix, gqlKey, gqlMeta, open, httpUri }: RestApiEndpointProps) => {
  const { l } = usePage();
  const [viewStatus, setViewStatus] = useState<"doc" | "test">("doc");
  const queryArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Query");
  const paramArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Param");
  const bodyArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Body");
  const uploadArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Upload");
  const path = getControllerPath(gqlKey, gqlMeta);
  return (
    <div className="collapse-arrow bg-base-300 collapse my-1">
      <input type="checkbox" checked={open} />
      <div className="collapse-title">
        <div className="flex items-center gap-3">
          <div className={`btn btn-xs w-16 ${gqlMeta.type === "query" ? "btn-success" : "btn-accent"}`}>
            {gqlMeta.type === "query" ? "GET" : "POST"}
          </div>
          {prefix ? `/${prefix}` : ""}/{path} <span className="text-lg">({l._(`${refName}.signal.${gqlKey}`)})</span>
        </div>
      </div>
      <div className="collapse-content bg-base-200 w-full">
        <div className="mt-4 text-lg">
          <div className="text-lg font-extrabold">Description</div>
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
            <AiOutlineApi className="text-xl" /> Restful API
          </button>
        </div>
        {viewStatus === "doc" ? (
          <RestApiInterface refName={refName} gqlKey={gqlKey} gqlMeta={gqlMeta} />
        ) : (
          <RestApiTry refName={refName} gqlKey={gqlKey} gqlMeta={gqlMeta} httpUri={httpUri} />
        )}
      </div>
    </div>
  );
};
RestApi.Endpoint = RestApiEndpoint;

interface RestApiInterfaceProps {
  refName: string;
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
}
const RestApiInterface = ({ refName, gqlKey, gqlMeta }: RestApiInterfaceProps) => {
  const returnRef = constantInfo.getModelRef(gqlMeta.returns.refName, gqlMeta.returns.modelType);
  const isReturnModelType = !isGqlScalar(returnRef);
  const uploadArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Upload");
  const paramArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Param");
  const queryArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Query");
  const bodyArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Body");
  return (
    <div className="flex w-full flex-col gap-4">
      {uploadArgMetas.length ? (
        <div>
          <div className="text-lg font-extrabold">Form data upload</div>
          <div className="bg-base-100 overflow-x-auto rounded-md p-3">
            <Arg.Table refName={refName} gqlKey={gqlKey} argMetas={uploadArgMetas} />
          </div>
        </div>
      ) : null}
      {paramArgMetas.length ? (
        <div>
          <div className="text-lg font-extrabold">Parameters</div>
          <div className="bg-base-100 overflow-x-auto rounded-md p-3">
            <Arg.Table refName={refName} gqlKey={gqlKey} argMetas={paramArgMetas} />
          </div>
        </div>
      ) : null}
      {queryArgMetas.length ? (
        <div>
          <div className="text-lg font-extrabold">Query</div>
          <div className="bg-base-100 overflow-x-auto rounded-md p-3">
            <Arg.Table refName={refName} gqlKey={gqlKey} argMetas={queryArgMetas} />
          </div>
        </div>
      ) : null}
      {bodyArgMetas.length ? (
        <div>
          <div className="text-lg font-extrabold">Body</div>
          <div className="bg-base-100 overflow-x-auto rounded-md p-3">
            <Arg.Table refName={refName} gqlKey={gqlKey} argMetas={bodyArgMetas} />
          </div>
        </div>
      ) : null}
      <div className="text-lg font-bold">
        <div className="flex w-full flex-col gap-2 rounded-md font-normal md:flex-row">
          <div className="w-full md:w-1/2">
            <div className="text-lg font-extrabold">Response Type</div>
            <div className="bg-base-100 max-h-[500px] overflow-auto rounded-md p-4 md:h-[500px]">
              Returns: <Signal.Object.Type objRef={returnRef} arrDepth={gqlMeta.returns.arrDepth} />
              {isReturnModelType ? <Signal.Object.Detail objRef={returnRef} /> : null}
            </div>
          </div>
          <div className="w-full md:w-1/2">
            <div className="text-lg font-extrabold">Response Example</div>
            <Response.Example gqlMeta={gqlMeta} />
          </div>
        </div>
      </div>
    </div>
  );
};
RestApi.Interface = RestApiInterface;

interface RestApiTryProps {
  prefix?: string;
  refName: string;
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
  httpUri?: string;
}
const RestApiTry = ({ prefix, refName, gqlKey, gqlMeta, httpUri = baseClientEnv.serverHttpUri }: RestApiTryProps) => {
  const queryArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Query");
  const paramArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Param");
  const bodyArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Body");
  const uploadArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Upload");
  const tryJwt = st.use.tryJwt();
  const paramExample = useMemo(() => getExampleData(paramArgMetas, "restapi"), []);
  const queryExample = useMemo(() => getExampleData(queryArgMetas, "restapi"), []);
  const bodyExample = useMemo(() => JSON.stringify(getExampleData(bodyArgMetas, "restapi"), null, 2), []);
  const [paramRequest, setParamRequest] = useState<{ [key: string]: string }>(paramExample);
  const [queryRequest, setQueryRequest] = useState<{ [key: string]: string }>(queryExample);
  const [bodyRequest, setBodyRequest] = useState<string>(bodyExample);
  const [uploadRequest, setUploadRequest] = useState<{ [key: string]: any }>({});
  const [response, setResponse] = useState<{ status: "idle" | "success" | "error" | "loading"; data: any }>({
    status: "idle",
    data: null,
  });
  const method = gqlMeta.type === "query" ? "GET" : "POST";
  const path = getControllerPath(gqlKey, gqlMeta);
  const queryString = new URLSearchParams(
    Object.fromEntries(
      queryArgMetas
        .map((argMeta) => {
          const value = queryRequest[argMeta.name] as object | string | number | boolean | null | undefined;
          if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0))
            return null;
          const argRef = constantInfo.getModelRef(argMeta.refName, argMeta.modelType);
          if (getGqlTypeStr(argRef) === "JSON") return [argMeta.name, btoa(value as string)];
          return [argMeta.name, value];
        })
        .filter((entry) => !!entry) as [string, any]
    )
  ).toString();
  const requestPath =
    paramArgMetas.reduce(
      (path, argMeta) => path.replace(`:${argMeta.name}`, paramRequest[argMeta.name]),
      `${prefix ? `/${prefix}` : ""}/${refName}/${path}`
    ) + (queryString.length ? `?${queryString}` : "");
  const requestUrl = `${httpUri}${requestPath}`;
  const getBody = () => {
    if (!uploadArgMetas.length) return bodyRequest;
    const formData = new FormData();
    const bodyObj = JSON.parse(bodyRequest) as { [key: string]: any };
    bodyArgMetas.forEach((argMeta) => {
      const value = bodyObj[argMeta.name] as object | string | number | boolean | null | undefined;
      if (value === undefined || value === null || value === "") return null;
      formData.append(argMeta.name, value as string);
    });
    uploadArgMetas.forEach((argMeta) => {
      const fileList: FileList = uploadRequest[argMeta.name] as FileList;
      Array.from(fileList).forEach((file) => {
        formData.append(argMeta.name, file as Blob);
      });
    });
    return formData;
  };
  const onSend = async () => {
    setResponse({ status: "loading", data: null });
    const res = await fetch(requestUrl, {
      method,
      headers: {
        "Content-Type": uploadArgMetas.length ? "application/form-data" : "application/json",
        Authorization: `Bearer ${tryJwt}`,
      },
      ...(method === "POST" ? { body: getBody() } : {}),
    });

    const contentType = res.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      const data = (await res.json()) as { [key: string]: any };
      setResponse({ status: "success", data });
    } else {
      const data = await res.text();
      setResponse({ status: "success", data });
    }
  };
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-2 text-lg">
        <div className="text-lg font-extrabold">Request URL:</div>
        <Copy text={`${httpUri}${requestPath}`}>
          <button className="btn btn-sm btn-outline">
            {requestPath} <AiOutlineCopy />
          </button>
        </Copy>
      </div>
      {uploadArgMetas.length ? (
        <div>
          <div className="text-lg">Form data uplaod</div>
          {uploadArgMetas.map((argMeta) => (
            <Arg.FormData
              key={argMeta.name}
              gqlKey={gqlKey}
              argMeta={argMeta}
              value={uploadRequest[argMeta.name] as string}
              onChange={(fileList: FileList) => {
                setUploadRequest({ ...uploadRequest, [argMeta.name]: fileList });
              }}
            />
          ))}
        </div>
      ) : null}
      {paramArgMetas.length ? (
        <div className="border-t border-gray-400 pt-5">
          <div className="text-lg font-extrabold">Parameters</div>
          {paramArgMetas.map((argMeta, idx) => (
            <Arg.Param
              key={idx}
              gqlKey={gqlKey}
              argMeta={argMeta}
              value={paramRequest[argMeta.name]}
              onChange={(value: string) => {
                setParamRequest({ ...paramRequest, [argMeta.name]: value });
              }}
            />
          ))}
        </div>
      ) : null}
      {queryArgMetas.length ? (
        <div>
          <div className="text-lg font-extrabold">Queries</div>
          {queryArgMetas.map((argMeta, idx) => (
            <Arg.Query
              key={idx}
              gqlKey={gqlKey}
              argMeta={argMeta}
              value={queryRequest[argMeta.name] ?? ""}
              onChange={(value: string) => {
                setQueryRequest({ ...queryRequest, [argMeta.name]: value });
              }}
            />
          ))}
        </div>
      ) : null}
      {bodyArgMetas.length ? (
        <div>
          <div className="text-lg">Body</div>
          <Arg.Json value={bodyRequest} onChange={setBodyRequest} />
        </div>
      ) : null}
      <div className="border-b border-gray-400 pb-5">
        <button className="btn bg-success w-full" onClick={() => void onSend()}>
          <AiOutlineSend className="-mt-0.5" /> Send Request
        </button>
      </div>
      <div>
        <div className="text-lg font-extrabold">Response</div>
        <Response.Result status={response.status} data={response.data as object} />
      </div>
    </div>
  );
};
RestApi.Try = RestApiTry;
