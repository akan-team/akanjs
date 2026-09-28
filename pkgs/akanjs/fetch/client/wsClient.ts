import {
  Logger,
  type WebsocketHeartbeatAckData,
  websocketAuthContract,
  websocketBinaryFrameContract,
  websocketHeartbeatContract,
} from "akanjs/common";
import type {
  WebsocketAuthAck,
  WebsocketMessageData,
  WebsocketPublishData,
  WebsocketReqData,
  WebsocketResData,
  WebsocketSubscribeAck,
} from "akanjs/signal";
import { websocketRoomContract } from "../../common/websocketContract";
import { type ErrorConstructor, restoreRemoteError } from "./remoteError";

export interface WsClientReconnectOptions {
  enabled?: boolean;
  interval?: number;
  maxAttempts?: number;
}

interface SubscribeOption {
  key: string;
  data: unknown[];
  listener: Set<(data: unknown) => void>;
  /** After a resubscribe following a drop: what was published meanwhile is gone, so a room can only say so. */
  resync: Set<() => void>;
}
interface Listener {
  callback: (data: unknown) => void;
  once: boolean;
}
interface RoomSubscription {
  key: string;
  data: unknown[];
  handleEvent: (data: unknown) => void;
  handleResync?: () => void;
}

type WsRequestPayload = unknown | unknown[];

export class WsClient {
  static makeRoomId(key: string, args: unknown[]) {
    return websocketRoomContract.idOf(key, args);
  }

  readonly logger = new Logger("WsClient");
  readonly url: string;
  #ws: WebSocket | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectAttempts = 0;
  #roomSubscribeMap = new Map<string, SubscribeOption>();
  /**
   * Server room id → the id subscribed under: a live room's id carries internal args the client cannot know, so the
   * subscribe ack names it, and the subscription map stays keyed by the client's own id.
   */
  #roomAliasMap = new Map<string, string>();
  #listenerMap = new Map<string, Set<Listener>>();
  #destroyed = false;
  #connectRequested = false;
  /** Whether this client has been connected before, so the first open is a start rather than a recovery. */
  #hadConnection = false;
  #outbox: string[] = [];
  #unconnectedWarnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #jwt: string | null = null;
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  #lastInboundAt = 0;
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

  /**
   * For clients holding the token in memory (native, cross-origin): the handshake carries only a same-origin cookie.
   * `null` drops that cookie server-side and revokes the rooms it authorized.
   */
  setJwt(jwt: string | null) {
    if (this.#jwt === jwt) return;
    this.#jwt = jwt;
    if (this.#ws?.readyState === WebSocket.OPEN) this.#sendAuth();
  }

  #sendAuth() {
    this.#ws?.send(JSON.stringify(websocketAuthContract.makeRequest(this.#jwt)));
  }

  connect() {
    this.#connectRequested = true;
    if (this.#ws && this.#ws.readyState !== WebSocket.CLOSED) return;
    this.logger.debug(`Connecting to ${this.url}`);
    this.#destroyed = false;
    this.#reconnectAttempts = 0;
    this.#connect();
  }

  #connect() {
    if (this.#destroyed) return;

    //? The constructor throws only for a URL no retry can fix (a scheme or port the browser refuses), and thrown from
    //? ClientBridge's effect it unmounts the whole React root; so it is logged, and the page runs without a socket.
    try {
      this.#ws = new WebSocket(this.url);
    } catch (error) {
      this.logger.error(`Cannot open a WebSocket to ${this.url}: ${error instanceof Error ? error.message : error}`);
      return;
    }
    this.#ws.binaryType = "arraybuffer";
    this.#ws.onopen = (e) => {
      this.#reconnectAttempts = 0;
      this.connected = true;
      this.logger.debug(`WebSocket connected`);
      this.#startHeartbeat();
      // Before the resubscribes: the server applies it synchronously, so every room below is authorized with it.
      if (this.#jwt) this.#sendAuth();
      const reconnected = this.#hadConnection;
      this.#hadConnection = true;
      this.#roomSubscribeMap.forEach((option) => {
        const data: WebsocketReqData = { key: option.key, data: option.data, subscribe: true };
        this.#ws?.send(JSON.stringify(data));
        if (!reconnected) return;
        for (const handler of option.resync) handler();
      });
      const queued = this.#outbox;
      this.#outbox = [];
      for (const frame of queued) this.#ws?.send(frame);
    };
    this.#ws.onmessage = (e) => {
      this.#lastInboundAt = Date.now();
      try {
        if (typeof e.data !== "string") {
          const frame = websocketBinaryFrameContract.decode(e.data as ArrayBuffer);
          if (frame) this.#handlePubsub(frame.roomId, frame.payload);
          else this.logger.warn("Unknown binary WebSocket frame");
          return;
        }
        const parsed = JSON.parse(e.data) as { error?: unknown } & WebsocketResData;
        if (parsed?.error) throw restoreRemoteError(parsed, 500, this.ErrorCls);
        const type = (parsed as WebsocketResData | WebsocketHeartbeatAckData).type;
        switch (type) {
          case "msg": {
            const msg = parsed as unknown as WebsocketMessageData;
            this.#handleMessage(msg.key, msg.data);
            break;
          }
          case "sub": {
            const sub = parsed as unknown as WebsocketSubscribeAck;
            if (sub.requestRoomId && sub.requestRoomId !== sub.roomId) {
              if (sub.subscribe) this.#roomAliasMap.set(sub.roomId, sub.requestRoomId);
              else this.#roomAliasMap.delete(sub.roomId);
            }
            this.logger.verbose(`Websocket ${sub.subscribe ? "subscribe" : "unsubscribe"} accepted: ${sub.roomId}`);
            break;
          }
          case "pub": {
            const publishData = parsed as WebsocketPublishData;
            this.#handlePubsub(publishData.roomId, publishData.data);
            break;
          }
          case "pong":
            break;
          case "auth": {
            const ack = parsed as WebsocketAuthAck;
            for (const roomId of ack.revokedRooms) {
              this.#roomSubscribeMap.delete(this.#roomAliasMap.get(roomId) ?? roomId);
              this.#roomAliasMap.delete(roomId);
              this.logger.warn(`Websocket room ${roomId} is no longer authorized`);
            }
            break;
          }
          default:
            this.logger.warn(`Unknown WebSocket message type: ${type} ${JSON.stringify(parsed)}`);
            break;
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`WebSocket message process failed ${errMsg}`);
      }
    };
    this.#ws.onerror = (e) => {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.verbose(`WebSocket error ${errMsg}`);
    };
    this.#ws.onclose = (event) => {
      this.logger.debug(`WebSocket closed: ${event.code} ${event.reason}`);
      this.connected = false;
      this.#stopHeartbeat();
      this.#scheduleReconnect();
    };
  }

  #startHeartbeat() {
    this.#stopHeartbeat();
    this.#lastInboundAt = Date.now();
    this.#heartbeatTimer = setInterval(() => this.#beat(), websocketHeartbeatContract.intervalMs);
    // A pending interval would otherwise hold a server-side runtime open past the last socket.
    this.#heartbeatTimer.unref?.();
  }

  #stopHeartbeat() {
    if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = null;
  }

  #beat() {
    const ws = this.#ws;
    if (ws?.readyState !== WebSocket.OPEN) return;
    // A socket dropped without a FIN accepts `send()` forever; closing it hands it to the resubscribing reconnect.
    if (Date.now() - this.#lastInboundAt > websocketHeartbeatContract.silenceMs) {
      this.logger.warn(`WebSocket is silent, reconnecting`);
      this.#stopHeartbeat();
      ws.close();
      return;
    }
    ws.send(JSON.stringify(websocketHeartbeatContract.makeRequest()));
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
    const roomSubscribe = this.#roomSubscribeMap.get(this.#roomAliasMap.get(roomId) ?? roomId);
    if (!roomSubscribe) return;
    for (const listener of roomSubscribe.listener) listener(data);
  }

  destroy() {
    this.logger.debug(`WebSocket destroying`);
    this.#destroyed = true;
    this.#connectRequested = false;
    this.#stopHeartbeat();
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    for (const timer of this.#unconnectedWarnTimers.values()) clearTimeout(timer);
    this.#unconnectedWarnTimers.clear();
    this.#outbox = [];
    this.#roomAliasMap.clear();
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
    return (this.#listenerMap.get(key)?.size ?? 0) > 0 || (this.#roomSubscribeMap.get(key)?.listener.size ?? 0) > 0;
  }
  #warnUnconnected(action: "emit" | "subscribe", key: string) {
    const timerKey = `${action}:${key}`;
    if (this.#connectRequested || this.#unconnectedWarnTimers.has(timerKey)) return;
    const timer = setTimeout(() => {
      this.#unconnectedWarnTimers.delete(timerKey);
      if (this.#connectRequested || this.#destroyed) return;
      console.warn(
        `[akanjs] WebSocket is not connected. Call fetch.instance.connect(), or drop the root layout "wsConnect = false", before ${action} "${key}".`,
      );
    }, 0);
    this.#unconnectedWarnTimers.set(timerKey, timer);
  }
  emit(key: string, data: WsRequestPayload) {
    const payload: WebsocketReqData = { key, data: Array.isArray(data) ? data : [data] };
    const frame = JSON.stringify(payload);
    // Queued: a socket opened on demand is still handshaking when the call that opened it emits.
    if (this.#ws?.readyState !== WebSocket.OPEN) {
      this.#outbox.push(frame);
      this.#warnUnconnected("emit", key);
      return this;
    }
    this.#ws.send(frame);
    return this;
  }
  subscribe(option: RoomSubscription) {
    const roomId = WsClient.makeRoomId(option.key, option.data);
    if (!this.#ws) this.#warnUnconnected("subscribe", option.key);
    let roomSubscribe = this.#roomSubscribeMap.get(roomId);
    if (!roomSubscribe) {
      roomSubscribe = { key: option.key, data: option.data, listener: new Set(), resync: new Set() };
      this.#roomSubscribeMap.set(roomId, roomSubscribe);
      if (this.#ws?.readyState === WebSocket.OPEN) this.#sendSubscribe(option.key, option.data, true);
      this.logger.verbose(`Websocket subscribe pubsub for ${roomId}`);
    }
    roomSubscribe.listener.add(option.handleEvent);
    if (option.handleResync) roomSubscribe.resync.add(option.handleResync);
    this.logger.verbose(`Websocket subscribe pubsub for ${roomId} - ${roomSubscribe.listener.size} listeners added`);
    return this;
  }
  unsubscribe(option: RoomSubscription) {
    const roomId = WsClient.makeRoomId(option.key, option.data);
    const roomSusbscribe = this.#roomSubscribeMap.get(roomId);
    if (!roomSusbscribe) return;
    roomSusbscribe.listener.delete(option.handleEvent);
    if (option.handleResync) roomSusbscribe.resync.delete(option.handleResync);
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
