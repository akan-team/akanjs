import { Logger } from "akanjs/common";
import type {
  WebsocketMessageData,
  WebsocketPublishData,
  WebsocketReqData,
  WebsocketResData,
  WebsocketSubscribeAck,
} from "akanjs/signal";
import type { ErrorConstructor, ErrorResponsePayload, RestoredError } from "./httpClient";

export interface WsClientReconnectOptions {
  enabled?: boolean;
  interval?: number;
  maxAttempts?: number;
}

interface SubscribeOption {
  key: string;
  data: unknown[];
  listener: Set<(data: unknown) => void>;
}
interface Listener {
  callback: (data: unknown) => void;
  once: boolean;
}

type WsRequestPayload = unknown | unknown[];

export class WsClient {
  static makeRoomId(key: string, args: unknown[]) {
    return `${key}${args.length ? "-" : ""}${args.join("-")}`;
  }

  readonly logger = new Logger("WsClient");
  readonly url: string;
  #ws: WebSocket | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectAttempts = 0;
  #roomSubscribeMap = new Map<string, SubscribeOption>();
  #listenerMap = new Map<string, Set<Listener>>();
  #destroyed = false;
  connected = false;

  constructor(
    url: string,
    private ErrorCls?: ErrorConstructor,
  ) {
    this.url = url;
  }

  setErrorConstructor(ErrorCls?: ErrorConstructor) {
    this.ErrorCls = ErrorCls;
  }

  connect() {
    if (this.#ws && this.#ws.readyState !== WebSocket.CLOSED) return;
    this.logger.debug(`Connecting to ${this.url}`);
    this.#destroyed = false;
    this.#reconnectAttempts = 0;
    this.#connect();
  }

  #connect() {
    if (this.#destroyed) return;

    this.#ws = new WebSocket(this.url);
    this.#ws.onopen = (e) => {
      this.#reconnectAttempts = 0;
      this.connected = true;
      this.logger.debug(`WebSocket connected`);
      this.#roomSubscribeMap.forEach((option) => {
        const data: WebsocketReqData = { key: option.key, data: option.data, subscribe: true };
        this.#ws?.send(JSON.stringify(data));
      });
    };
    this.#ws.onmessage = (e) => {
      try {
        const parsed = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (parsed?.error) {
          throw this.#restoreError(parsed);
        }
        const type = (parsed as WebsocketResData).type;
        switch (type) {
          case "msg": {
            const msg = parsed as unknown as WebsocketMessageData;
            this.#handleMessage(msg.key, msg.data);
            break;
          }
          case "sub": {
            const sub = parsed as unknown as WebsocketSubscribeAck;
            if (sub.subscribe) this.logger.verbose(`Websocket subscribe accepted: ${sub.roomId}`);
            else this.logger.verbose(`Websocket unsubscribe accepted: ${sub.roomId}`);
            break;
          }
          case "pub": {
            const publishData = parsed as WebsocketPublishData;
            this.#handlePubsub(publishData.roomId, publishData.data);
            break;
          }
          default:
            this.logger.warn(`Unknown WebSocket message type: ${type} ${JSON.stringify(parsed)}`);
            break;
        }
      } catch (error) {
        this.logger.warn("WebSocket message process failed");
        console.error(error);
      }
    };
    this.#ws.onerror = (e) => {
      this.logger.debug(`WebSocket error`);
      console.error(e);
    };
    this.#ws.onclose = (event) => {
      this.logger.debug(`WebSocket closed: ${event.code} ${event.reason}`);
      this.connected = false;
      this.#scheduleReconnect();
    };
  }

  #scheduleReconnect() {
    if (this.#destroyed || !this.#ws) return;
    const interval = 3000;
    this.#reconnectAttempts += 1;
    this.logger.debug(`WebSocket reconnecting in ${interval}ms (attempt ${this.#reconnectAttempts})`);

    this.#ws = null;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect();
    }, interval);
  }
  #handleMessage(key: string, data: unknown) {
    const listenerSet = this.#listenerMap.get(key);
    if (!listenerSet?.size) return;
    for (const listener of listenerSet) {
      listener.callback(data);
      if (listener.once) {
        listenerSet.delete(listener);
        if (listenerSet.size === 0) this.#listenerMap.delete(key);
      }
    }
  }
  #handlePubsub(roomId: string, data: unknown) {
    const roomSubscribe = this.#roomSubscribeMap.get(roomId);
    if (!roomSubscribe) return;
    for (const listener of roomSubscribe.listener) listener(data);
  }

  #restoreError(body: unknown): RestoredError {
    const payload =
      body && typeof body === "object" && "error" in body
        ? (body as ErrorResponsePayload)
        : ({ error: String(body), statusCode: 500 } satisfies ErrorResponsePayload);
    if (this.ErrorCls) return this.ErrorCls.fromJSON(payload);
    const error = new Error(payload.error);
    Object.assign(error, payload);
    return error;
  }

  destroy() {
    this.logger.debug(`WebSocket destroying`);
    this.#destroyed = true;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    this.#ws?.close();
    this.#ws = null;
  }

  on<Data = unknown>(key: string, callback: (data: Data) => void) {
    const listenerSet = this.#listenerMap.get(key) ?? new Set<Listener>();
    listenerSet.add({ callback: callback as (data: unknown) => void, once: false });
    this.#listenerMap.set(key, listenerSet);
    return this;
  }
  once<Data = unknown>(key: string, callback: (data: Data) => void) {
    const listenerSet = this.#listenerMap.get(key) ?? new Set<Listener>();
    listenerSet.add({ callback: callback as (data: unknown) => void, once: true });
    this.#listenerMap.set(key, listenerSet);
    return this;
  }
  off<Data = unknown>(key: string, callback: (data: Data) => void) {
    const listenerSet = this.#listenerMap.get(key);
    if (!listenerSet) return this;
    for (const listener of listenerSet) {
      if (listener.callback === callback) {
        listenerSet.delete(listener);
        break;
      }
    }
    if (listenerSet.size === 0) this.#listenerMap.delete(key);
    return this;
  }
  removeAllListeners(key: string) {
    this.#listenerMap.delete(key);
    return this;
  }
  hasListeners(key: string) {
    const hasGeneric = (this.#listenerMap.get(key)?.size ?? 0) > 0;
    const roomSub = this.#roomSubscribeMap.get(key);
    const hasRoom = roomSub ? roomSub.listener.size > 0 : false;
    return hasGeneric || hasRoom;
  }
  #warnNotConnected(action: "emit" | "subscribe", key: string) {
    console.warn(
      `[akanjs] WebSocket is not connected. Call fetch.instance.connect() or enable root layout "wsConnect" before ${action} "${key}".`,
    );
  }
  emit(key: string, data: WsRequestPayload) {
    if (this.#ws?.readyState !== WebSocket.OPEN) {
      this.logger.warn("WebSocket not connected");
      this.#warnNotConnected("emit", key);
      return this;
    }
    const payload: WebsocketReqData = { key, data: Array.isArray(data) ? data : [data] };
    this.#ws.send(JSON.stringify(payload));
    return this;
  }
  subscribe(option: { key: string; data: unknown[]; handleEvent: (data: unknown) => void }) {
    const roomId = WsClient.makeRoomId(option.key, option.data);
    if (!this.#ws) this.#warnNotConnected("subscribe", option.key);
    if (!this.#roomSubscribeMap.has(roomId)) {
      this.#roomSubscribeMap.set(roomId, { key: option.key, data: option.data, listener: new Set() });
      if (this.#ws?.readyState === WebSocket.OPEN) {
        this.#sendSubscribe(option.key, option.data, true);
      }
      this.logger.verbose(`Websocket subscribe pubsub for ${roomId}`);
    }
    const roomSubscribe = this.#roomSubscribeMap.get(roomId);
    if (!roomSubscribe) return;
    roomSubscribe.listener.add(option.handleEvent);
    this.logger.verbose(`Websocket subscribe pubsub for ${roomId} - ${roomSubscribe.listener.size} listeners added`);
    return this;
  }
  unsubscribe(option: { key: string; data: unknown[]; handleEvent: (data: unknown) => void }) {
    const roomId = WsClient.makeRoomId(option.key, option.data);
    const roomSusbscribe = this.#roomSubscribeMap.get(roomId);
    if (!roomSusbscribe) return;
    roomSusbscribe.listener.delete(option.handleEvent);
    this.logger.verbose(`Unsubscribe pubsub for ${roomId} - ${roomSusbscribe.listener.size} listeners remaining`);
    if (roomSusbscribe.listener.size === 0) {
      if (this.#ws?.readyState === WebSocket.OPEN) {
        this.#sendSubscribe(option.key, option.data, false);
      }
      this.#roomSubscribeMap.delete(roomId);
      this.logger.verbose(`Websocket unsubscribe for ${roomId}`);
    }
  }
  #sendSubscribe(key: string, data: unknown[], subscribe: boolean) {
    const payload: WebsocketReqData = { key, data, subscribe };
    this.#ws?.send(JSON.stringify(payload));
  }
}
