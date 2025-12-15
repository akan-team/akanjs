"use client";
import { SerializedSignal } from "@akanjs/signal";
import { st } from "@akanjs/store";

import Message from "./Message";
import PubSub from "./PubSub";

export default function WebSocket() {
  return <div></div>;
}

interface WebSocketEndpointsProps {
  refName: string;
  openAll?: boolean;
}
const WebSocketEndpoints = ({ refName, openAll }: WebSocketEndpointsProps) => {
  const signals = global.signals as SerializedSignal[];
  const signal = signals.find((signal) => signal.refName === refName);
  if (!signal) return null;
  const tryRoles = st.use.tryRoles();
  const gqlInfos = Object.entries(signal.endpoint)
    .sort(([keyA], [keyB]) => (keyA > keyB ? 1 : -1))
    .filter(([key, gqlMeta]) => gqlMeta.signalOption?.onlyFor !== "restapi")
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
      {gqlInfos.map(([gqlKey, gqlMeta], idx) => {
        if (gqlMeta.type === "pubsub") {
          return <PubSub.Endpoint key={idx} refName={refName} gqlKey={gqlKey} gqlMeta={gqlMeta} open={openAll} />;
        } else {
          return <Message.Endpoint key={idx} refName={refName} gqlKey={gqlKey} gqlMeta={gqlMeta} open={openAll} />;
        }
      })}
    </div>
  );
};
WebSocket.Endpoints = WebSocketEndpoints;
