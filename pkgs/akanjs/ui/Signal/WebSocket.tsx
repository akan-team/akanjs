"use client";
import type { FetchProxy } from "akanjs/fetch";
import { st } from "akanjs/store";
import { docUi } from "../Reference";
import { endpointEntriesOf, isWsEndpoint, matchesGuards, matchesSearch } from "./endpointEntries";
import Message from "./Message";
import PubSub from "./PubSub";

export default function WebSocket() {
  return <div></div>;
}

interface WebSocketEndpointsProps {
  refName: string;
  fetch: FetchProxy;
  openAll?: boolean;
  search?: string;
}
const WebSocketEndpoints = ({ refName, fetch, openAll, search }: WebSocketEndpointsProps) => {
  const tryGuards = st.use.tryGuards({ agent: false });
  if (!fetch.serializedSignal[refName])
    return <div className={docUi.emptyPanel}>No signal is registered as “{refName}”.</div>;
  const wsEntries = endpointEntriesOf(refName, fetch).filter(({ endpoint }) => isWsEndpoint(endpoint));
  // A pubsub room authorizes once, at subscribe, so the guards the toggle filters on are the endpoint's own.
  const endpointEntries = wsEntries
    .filter(({ endpoint }) => matchesGuards(endpoint, tryGuards))
    .filter(({ key }) => matchesSearch(key, key, search ?? ""));
  if (!endpointEntries.length)
    return (
      <div className={docUi.emptyPanel}>
        {!wsEntries.length
          ? "This signal declares no websocket endpoint."
          : search?.trim()
            ? `No endpoint matches “${search.trim()}”.`
            : "No websocket endpoint is gated by the selected guards."}
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {endpointEntries.map(({ key, endpoint }) =>
        endpoint.type === "pubsub" ? (
          <PubSub.Endpoint key={key} refName={refName} endpointKey={key} endpoint={endpoint} open={openAll} />
        ) : (
          <Message.Endpoint key={key} refName={refName} endpointKey={key} endpoint={endpoint} open={openAll} />
        ),
      )}
    </div>
  );
};
WebSocket.Endpoints = WebSocketEndpoints;
