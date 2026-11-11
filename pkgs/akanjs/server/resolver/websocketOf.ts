import { AkanError } from "akanjs/base";
import { type AdaptorCls, type InjectRegistry, type WebsocketAdaptor, WebsocketAdaptorRole } from "akanjs/service";

const found = new WeakMap<InjectRegistry, { key: AdaptorCls; websocket: WebsocketAdaptor }>();

const websocketKeyOf = (registry: InjectRegistry): AdaptorCls | undefined => {
  if (registry.adaptor.has(WebsocketAdaptorRole)) return WebsocketAdaptorRole;
  const roleProvider = [...registry.adaptorRole.entries()].find(
    ([role]) => role.refName === WebsocketAdaptorRole.refName,
  )?.[1];
  if (roleProvider && registry.adaptor.has(roleProvider)) return roleProvider;
  return [...registry.adaptor.keys()].find((adaptorCls) => ["solidPubsub", "wsRedis"].includes(adaptorCls.refName));
};

// Every subscribe and every live event reaches this, so the scan runs once per registry and the answer is kept while
// the registry still holds that same instance under that same key.
export const websocketOf = (registry: InjectRegistry): WebsocketAdaptor => {
  const cached = found.get(registry);
  if (cached && registry.adaptor.get(cached.key) === (cached.websocket as unknown)) return cached.websocket;
  const key = websocketKeyOf(registry);
  const websocket = key ? (registry.adaptor.get(key) as WebsocketAdaptor | undefined) : undefined;
  if (!key || !websocket) throw new AkanError("notRegistered", "WebSocket adaptor is not registered");
  found.set(registry, { key, websocket });
  return websocket;
};
