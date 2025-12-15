"use client";
import { isGqlScalar } from "@akanjs/base";
import { fetch, usePage } from "@akanjs/client";
import { constantInfo } from "@akanjs/constant";
import { getGqlStr, makeRequestExample, SerializedEndpoint, SerializedSignal } from "@akanjs/signal";
import { st } from "@akanjs/store";
import { useMemo, useState } from "react";
import { AiOutlineFileWord, AiOutlineSend } from "react-icons/ai";
import { BiLogoGraphql } from "react-icons/bi";

import Arg from "./Arg";
import Object from "./Object";
import Request from "./Request";
import Response from "./Response";

export default function GraphQL() {
  return <div></div>;
}

interface GraphQLEndpointsProps {
  refName: string;
  openAll?: boolean;
}
const GraphQLEndpoints = ({ refName, openAll }: GraphQLEndpointsProps) => {
  const signals = global.signals as SerializedSignal[];
  const signal = signals.find((signal) => signal.refName === refName);
  const tryRoles = st.use.tryRoles();
  if (!signal) return null;
  const gqlInfos = global.Object.entries(signal.endpoint)
    .sort(([keyA], [keyB]) => (keyA > keyB ? 1 : -1))
    .filter(([key, gqlMeta]) => gqlMeta.signalOption?.onlyFor !== "restapi")
    .filter(([key, gqlMeta]: [string, SerializedEndpoint]) => {
      if (gqlMeta.type !== "query" && gqlMeta.type !== "mutation") return false;
      if (
        (!gqlMeta.signalOption?.guards || gqlMeta.signalOption.guards.includes("Public")) &&
        tryRoles.includes("Public")
      )
        return true;
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
        <GraphQLEndpoint key={idx} refName={refName} gqlKey={gqlKey} gqlMeta={gqlMeta} open={openAll} />
      ))}
    </div>
  );
};
GraphQL.Endpoints = GraphQLEndpoints;

interface GraphQLEndpointProps {
  refName: string;
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
  open?: boolean;
}
const GraphQLEndpoint = ({ refName, gqlKey, gqlMeta, open }: GraphQLEndpointProps) => {
  const { l } = usePage();
  const [viewStatus, setViewStatus] = useState<"doc" | "test">("doc");
  return (
    <div className="collapse-arrow bg-base-300 collapse my-1">
      <input type="checkbox" checked={open} />
      <div className="collapse-title text-xl">
        <div className="flex items-center gap-3">
          <div className={`btn btn-xs w-16 ${gqlMeta.type === "query" ? "btn-success" : "btn-accent"}`}>
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
            <BiLogoGraphql className="text-xl" /> GraphQL
          </button>
        </div>
        {viewStatus === "doc" ? (
          <GraphQLInterface refName={refName} gqlKey={gqlKey} gqlMeta={gqlMeta} />
        ) : (
          <GraphQLTry gqlKey={gqlKey} gqlMeta={gqlMeta} />
        )}
      </div>
    </div>
  );
};
GraphQL.Endpoint = GraphQLEndpoint;

interface GraphQLInterfaceProps {
  refName: string;
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
}
const GraphQLInterface = ({ refName, gqlKey, gqlMeta }: GraphQLInterfaceProps) => {
  const returnRef = constantInfo.getModelRef(gqlMeta.returns.refName, gqlMeta.returns.modelType);
  const arrDepth = gqlMeta.returns.arrDepth;
  const isReturnModelType = !isGqlScalar(returnRef);
  const uploadArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Upload");
  const gqlArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type !== "Upload");
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
        <div className="text-start">
          <span className="text-start text-xl font-bold">Variables</span>
          <div className="bg-base-100 mt-3 overflow-x-auto rounded-md p-3">
            <Arg.Table refName={refName} gqlKey={gqlKey} argMetas={gqlArgMetas} />
          </div>
        </div>
      ) : null}
      <div className="text-lg font-bold">
        <div className="flex w-full flex-col gap-2 rounded-md font-normal md:flex-col">
          <div className="w-full text-start md:w-full">
            <span className="text-xl font-bold">Response Type</span>
            <div className="bg-base-100 mt-3 max-h-[500px] overflow-auto rounded-md p-4 md:h-[500px]">
              Returns: <Object.Type objRef={returnRef} arrDepth={arrDepth} />
              {isReturnModelType ? <Object.Detail objRef={returnRef} /> : null}
            </div>
          </div>
          <div className="w-full text-start md:w-full">
            <span className="text-xl font-bold">Response Example</span>
            <div className="mt-3">
              <Response.Example gqlMeta={gqlMeta} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
GraphQL.Interface = GraphQLInterface;

interface GraphQLTryProps {
  gqlKey: string;
  gqlMeta: SerializedEndpoint;
}
const GraphQLTry = ({ gqlKey, gqlMeta }: GraphQLTryProps) => {
  const tryJwt = st.use.tryJwt();
  const modelRef = constantInfo.getModelRef(gqlMeta.returns.refName, gqlMeta.returns.modelType);
  const uploadArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type === "Upload");
  const gqlArgMetas = gqlMeta.args.filter((argMeta) => argMeta.type !== "Upload");
  const isScalar = isGqlScalar(modelRef);
  const returnRef =
    isScalar || gqlMeta.returns.arrDepth === 0
      ? modelRef
      : constantInfo.isFull(modelRef)
        ? constantInfo.getDatabase(constantInfo.getRefName(modelRef)).light
        : modelRef;
  const gqlStr = useMemo(() => getGqlStr(modelRef, gqlKey, gqlMeta, returnRef), []);
  const requestExample = useMemo(() => JSON.stringify(makeRequestExample(gqlMeta), null, 2), []);
  const [gqlRequest, setGqlRequest] = useState<string>(requestExample);
  const [uploadRequest, setUploadRequest] = useState<{ [key: string]: FileList }>({});
  const [response, setResponse] = useState<{ status: "idle" | "success" | "error" | "loading"; data: any }>({
    status: "idle",
    data: null,
  });

  const onSend = async () => {
    setResponse({ status: "loading", data: null });
    const request = { ...JSON.parse(gqlRequest), ...uploadRequest } as {
      [key: string]: string | number | boolean | null;
    };
    const argData = gqlMeta.args.map((argMeta) => request[argMeta.name]);
    const fetchFn = (fetch[gqlKey] as (...args: any[]) => Promise<any>).bind(fetch) as (...args: any[]) => Promise<any>;
    const data = (await fetchFn(...argData, {
      token: tryJwt,
      onError: (data: object) => {
        setResponse({ status: "error", data });
      },
    })) as Promise<any>;
    setResponse({ status: "success", data });
  };
  return (
    <div className="flex w-full flex-col gap-4">
      {uploadArgMetas.length ? (
        <div>
          <div className="text-lg">Form data uplaod</div>
          {uploadArgMetas.map((argMeta) => (
            <Arg.FormData
              key={argMeta.name}
              gqlKey={gqlKey}
              argMeta={argMeta}
              value={uploadRequest[argMeta.name]}
              onChange={(fileList: FileList) => {
                setUploadRequest({ ...uploadRequest, [argMeta.name]: fileList });
              }}
            />
          ))}
        </div>
      ) : null}
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
          <div>
            <div className="text-lg">Graphql String</div>
            <div className="w-full items-center justify-center">
              <Request.Example value={gqlStr} />
            </div>
          </div>
        </div>
        <button className="btn bg-success w-full" onClick={() => void onSend()}>
          <AiOutlineSend className="-mt-0.5" /> Send Request
        </button>
      </div>

      <div>
        <div className="text-lg">Response</div>
        <Response.Result status={response.status} data={response.data as object} />
      </div>
    </div>
  );
};
GraphQL.Try = GraphQLTry;
