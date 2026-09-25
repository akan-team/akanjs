"use client";
import type { FetchProxy } from "akanjs/fetch";
import Message from "./Message";
import PubSub from "./PubSub";

export default function WebSocket() {
  return <div></div>;
}

interface WebSocketEndpointsProps {
  refName: string;
  fetch: FetchProxy;
  openAll?: boolean;
}
const WebSocketEndpoints = ({ refName, fetch, openAll }: WebSocketEndpointsProps) => {
  const signal = fetch.serializedSignal[refName];
  // const tryRoles = st.use.tryRoles();
  const endpointEntries = Object.entries(signal.endpoint)
    .sort(([keyA], [keyB]) => (keyA > keyB ? 1 : -1))
    .filter(([key, endpoint]) => {
      if (endpoint.type === "query" || endpoint.type === "mutation") return false;
      // if (endpoint.guards?.includes("Public") && tryRoles.includes("Public")) return true;
      // if ((endpoint.guards?.includes("User") || endpoint.guards?.includes("Every")) && tryRoles.includes("User"))
      //   return true;
      // if ((endpoint.guards?.includes("Admin") || endpoint.guards?.includes("Every")) && tryRoles.includes("Admin"))
      //   return true;
      // if (
      //   (endpoint.guards?.includes("SuperAdmin") || endpoint.guards?.includes("Every")) &&
      //   tryRoles.includes("SuperAdmin")
      // )
      //   return true;
      return false;
    });
  return (
    <div className="flex flex-col gap-2">
      {endpointEntries.map(([endpointKey, endpoint], idx) => {
        if (endpoint.type === "pubsub") {
          return (
            <PubSub.Endpoint key={idx} refName={refName} endpointKey={endpointKey} endpoint={endpoint} open={openAll} />
          );
        } else {
          return (
            <Message.Endpoint
              key={idx}
              refName={refName}
              endpointKey={endpointKey}
              endpoint={endpoint}
              open={openAll}
            />
          );
        }
      })}
    </div>
  );
};
WebSocket.Endpoints = WebSocketEndpoints;
