"use client";
import { fetch, usePage } from "akanjs/client";
import { capitalize, type DynamicRecord } from "akanjs/common";
import type { FetchProxy } from "akanjs/fetch";
import type { SerializedEndpoint } from "akanjs/signal";
import { st } from "akanjs/store";
import { useEffect, useMemo, useState } from "react";
import { AiOutlineDisconnect, AiOutlineSend, AiOutlineSwap } from "react-icons/ai";
import { buttonRecipe } from "../Button";
import { docUi } from "../Reference";
import Arg from "./Arg";
import {
  ArgSection,
  appendMessage,
  EndpointInterface,
  type Messages,
  WsEndpoint,
  type WsEndpointProps,
} from "./Endpoint";
import { endpointEntriesOf, isWsEndpoint, matchesGuards, matchesSearch, runtimeFetch } from "./endpointEntries";
import { ListenerResult } from "./Listener";
import { makeRequestExample } from "./makeExample";
import { noSearchMatchText, noSignalText, signalText } from "./signalText";

interface WebSocketEndpointsProps {
  refName: string;
  fetch?: FetchProxy;
  openAll?: boolean;
  search?: string;
}
export const WebSocketEndpoints = ({
  refName,
  fetch: docFetch = runtimeFetch,
  openAll,
  search,
}: WebSocketEndpointsProps) => {
  const { l } = usePage();
  const tryGuards = st.use.tryGuards({ agent: false });
  if (!docFetch.serializedSignal[refName])
    return <div className={docUi.emptyPanel}>{l.trans(noSignalText(refName))}</div>;
  const wsEntries = endpointEntriesOf(refName, docFetch).filter(({ endpoint }) => isWsEndpoint(endpoint));
  // A pubsub room authorizes once, at subscribe, so the guards the toggle filters on are the endpoint's own.
  const endpointEntries = wsEntries
    .filter(({ endpoint }) => matchesGuards(endpoint, tryGuards))
    .filter(({ key }) => matchesSearch(key, key, search ?? ""));
  if (!endpointEntries.length)
    return (
      <div className={docUi.emptyPanel}>
        {!wsEntries.length
          ? l.trans(signalText.noWsEndpoint)
          : search?.trim()
            ? l.trans(noSearchMatchText(search.trim()))
            : l.trans(signalText.noWsGuardMatch)}
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {endpointEntries.map(({ key, endpoint }) =>
        endpoint.type === "pubsub" ? (
          <PubSubEndpoint key={key} refName={refName} endpointKey={key} endpoint={endpoint} open={openAll} />
        ) : (
          <MessageEndpoint key={key} refName={refName} endpointKey={key} endpoint={endpoint} open={openAll} />
        ),
      )}
    </div>
  );
};
export const MessageEndpoint = ({ refName, endpointKey, endpoint, open }: WsEndpointProps) => (
  <WsEndpoint
    refName={refName}
    endpointKey={endpointKey}
    endpoint={endpoint}
    open={open}
    doc={<MessageInterface refName={refName} endpointKey={endpointKey} endpoint={endpoint} />}
    test={<MessageTry endpointKey={endpointKey} endpoint={endpoint} />}
  />
);
interface WsInterfaceProps {
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
}
export const MessageInterface = ({ refName, endpointKey, endpoint }: WsInterfaceProps) => {
  const { l } = usePage();
  return (
    <EndpointInterface
      refName={refName}
      endpointKey={endpointKey}
      endpoint={endpoint}
      argSections={[
        { label: l.trans(signalText.formData), args: endpoint.args.filter((arg) => arg.refName === "Upload") },
        { label: l.trans(signalText.variables), args: endpoint.args.filter((arg) => arg.refName !== "Upload") },
      ]}
      returnsLabel={l.trans(signalText.returns)}
    />
  );
};

interface MessageTryProps {
  endpointKey: string;
  endpoint: SerializedEndpoint;
}
export const MessageTry = ({ endpointKey, endpoint }: MessageTryProps) => {
  const { l } = usePage();
  const requestExample = useMemo(() => JSON.stringify(makeRequestExample(endpoint), null, 2), []);
  const [gqlRequest, setGqlRequest] = useState<string>(requestExample);
  const [stopListen, setStopListen] = useState<(() => void) | null>(null);
  const [messages, setMessages] = useState<Messages>("");
  const [response, setResponse] = useState<{
    status: "ready" | "error" | "listening" | "loading";
    data: Messages;
  }>({ status: "ready", data: "" });

  const onSend = async () => {
    const request = JSON.parse(gqlRequest) as { [key: string]: string | number | boolean | null };
    const argData = endpoint.args.map((arg) => request[arg.refName]);
    const fetchFn = ((fetch as unknown as DynamicRecord)[endpointKey] as (...args: any[]) => Promise<any>).bind(
      fetch,
    ) as (...args: any[]) => Promise<any>;
    await fetchFn(...argData);
  };
  const onListen = () => {
    setResponse({ status: "loading", data: null });
    const fetchFn = (
      (fetch as unknown as DynamicRecord)[`listen${capitalize(endpointKey)}`] as (...args: any[]) => Promise<any>
    ).bind(fetch) as (data: (data: any) => void) => Promise<() => void>;
    setResponse({ status: "loading", data: messages });
    const stopListen = fetchFn((data: any) => {
      setMessages((prev) => appendMessage(prev, data));
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
      <ArgSection label={l.trans(signalText.variables)}>
        <Arg.Json
          value={gqlRequest}
          onChange={(value: string) => {
            setGqlRequest(value);
          }}
        />
      </ArgSection>
      <div className="grid gap-2 md:grid-cols-3">
        <button
          disabled={!!stopListen}
          className={buttonRecipe({ variant: "primary" }, "w-full")}
          onClick={() => {
            onListen();
          }}
          type="button"
        >
          <AiOutlineSwap /> {l.trans(signalText.listen)}
        </button>
        <button
          disabled={!stopListen}
          className={buttonRecipe({ variant: "secondary" }, "w-full")}
          onClick={() => void onSend()}
          type="button"
        >
          <AiOutlineSend /> {l.trans(signalText.send)}
        </button>
        <button
          disabled={!stopListen}
          className={buttonRecipe({ variant: "outline" }, "w-full")}
          onClick={() => {
            onStopListen();
          }}
          type="button"
        >
          <AiOutlineDisconnect /> {l.trans(signalText.stop)}
        </button>
      </div>
      <ListenerResult status={response.status} data={messages} />
    </div>
  );
};

export const PubSubEndpoint = ({ refName, endpointKey, endpoint, open }: WsEndpointProps) => (
  <WsEndpoint
    refName={refName}
    endpointKey={endpointKey}
    endpoint={endpoint}
    open={open}
    doc={<PubSubInterface refName={refName} endpointKey={endpointKey} endpoint={endpoint} />}
    test={<PubSubTry refName={refName} endpointKey={endpointKey} endpoint={endpoint} />}
  />
);
export const PubSubInterface = ({ refName, endpointKey, endpoint }: WsInterfaceProps) => {
  const { l } = usePage();
  return (
    <EndpointInterface
      refName={refName}
      endpointKey={endpointKey}
      endpoint={endpoint}
      argSections={[{ label: l.trans(signalText.variables), args: endpoint.args }]}
      returnsLabel={l.trans(signalText.publishes)}
    />
  );
};

export const PubSubTry = ({ endpointKey, endpoint }: WsInterfaceProps) => {
  const { l } = usePage();
  const requestExample = useMemo(() => JSON.stringify(makeRequestExample(endpoint), null, 2), []);
  const [gqlRequest, setGqlRequest] = useState<string>(requestExample);
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);
  const [messages, setMessages] = useState<Messages>("");
  const [response, setResponse] = useState<{
    status: "ready" | "error" | "listening" | "loading";
    data: Messages;
  }>({ status: "ready", data: "" });
  const onSubscribe = () => {
    setResponse({ status: "loading", data: "" });
    const request = JSON.parse(gqlRequest) as { [key: string]: string | number | boolean | null };
    const argData = endpoint.args.map((arg) => request[arg.name]);

    const fetchFn = ((fetch as unknown as DynamicRecord)[endpointKey] as (...args: any[]) => Promise<any>).bind(
      fetch,
    ) as (
      ...args: [...args: (string | number | boolean | null)[], data: (data: unknown) => void]
    ) => Promise<() => void>;
    setResponse({ status: "loading", data: messages });
    const unsubscribe = fetchFn(...argData, (data: any) => {
      setMessages((prev) => appendMessage(prev, data));
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
      <ArgSection label={l.trans(signalText.variables)}>
        <Arg.Json
          value={gqlRequest}
          onChange={(value: string) => {
            setGqlRequest(value);
          }}
        />
      </ArgSection>
      <div className="grid gap-2 md:grid-cols-2">
        <button
          disabled={!!unsubscribe}
          className={buttonRecipe({ variant: "primary" }, "w-full")}
          onClick={() => {
            onSubscribe();
          }}
          type="button"
        >
          <AiOutlineSwap /> {l.trans(signalText.subscribe)}
        </button>
        <button
          disabled={!unsubscribe}
          className={buttonRecipe({ variant: "outline" }, "w-full")}
          onClick={() => {
            onUnsubscribe();
          }}
          type="button"
        >
          <AiOutlineDisconnect /> {l.trans(signalText.unsubscribe)}
        </button>
      </div>
      <ListenerResult status={response.status} data={messages} />
    </div>
  );
};
