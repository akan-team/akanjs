import {
  Backoff,
  type BackoffPolicy,
  isRecord,
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

export interface WsClientReconnectOptions extends BackoffPolicy {
  /** Attempts in a row before the client gives up; unset, it never does. */
  maxAttempts?: number;
}

export type WsClientState = "connecting" | "open" | "closed" | "gaveUp";

export interface WsClientOptions {
  /** `false` stays closed after a drop. */
  reconnect?: WsClientReconnectOptions | false;
  /** Sent with the upgrade by a server-side client, the token among them as `authorization`; a browser sends none. */
  headers?: Record<string, string>;
  tls?: { rejectUnauthorized?: boolean; ca?: string | string[] };
  onStateChange?: (state: WsClientState) => void;
  /** A room the server took back when the credential changed. */
  onRevoked?: (roomId: string) => void;
  /** A frame the server answered with an error, and the subscribe or message key it answered. */
  onError?: (error: unknown, key?: string) => void;
}

interface SubscribeOption {
  key: string;
  data: unknown[];
  listener: Set<(data: unknown) => void>;
  /** After a resubscribe following a drop, or a hole in the frames: what was published meanwhile is gone. */
  resync: Set<() => void>;
  /** The numbering of the frames the room delivered, while the server numbers them. */
  cursor: { epoch: string | null; seq: number | null };
  /** Resubscribed after a drop: the ack says whether what was missed came back. */
  recovering: boolean;
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
  static readonly stableMs = 5_000;

  readonly logger = new Logger("WsClient");
  readonly url: string;
  #ws: WebSocket | null = null;
  #opening = false;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectAttempts = 0;
  #watchingWake = false;
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
  #options: WsClientOptions = {};
  #state: WsClientState = "closed";
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

  /** Merged over what was set before; read at the next connect and the next drop. */
  configure(options: WsClientOptions) {
    this.#options = { ...this.#options, ...options };
    return this;
  }

  get state(): WsClientState {
    return this.#state;
  }

  #setState(state: WsClientState) {
    if (this.#state === state) return;
    this.#state = state;
    this.#options.onStateChange?.(state);
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
    if (this.#destroyed || this.#opening) return;
    this.#cancelReconnect();
    this.#setState("connecting");
    const ws = this.#tryOpen();
    if (!ws) return;
    this.#ws = ws;
    let openedAt = 0;
    this.#ws.binaryType = "arraybuffer";
    this.#ws.onopen = (e) => {
      openedAt = Date.now();
      this.connected = true;
      this.logger.debug(`WebSocket connected`);
      this.#setState("open");
      this.#startHeartbeat();
      // Before the resubscribes: the server applies it synchronously, so every room below is authorized with it.
      if (this.#jwt) this.#sendAuth();
      const reconnected = this.#hadConnection;
      this.#hadConnection = true;
      this.#roomSubscribeMap.forEach((option) => {
        const { epoch, seq } = option.cursor;
        const since = reconnected && epoch !== null && seq !== null ? { epoch, seq } : undefined;
        const data: WebsocketReqData = {
          key: option.key,
          data: option.data,
          subscribe: true,
          ...(since ? { since } : {}),
        };
        this.#ws?.send(JSON.stringify(data));
        //? Counted afresh: a replay starts right after `since`, and a restarted server numbers from 1 again.
        option.cursor = { epoch: null, seq: null };
        option.recovering = reconnected;
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
        const frame: unknown = JSON.parse(e.data);
        if (!isRecord(frame)) {
          this.logger.warn(`Unknown WebSocket frame ${e.data.slice(0, 200)}`);
          return;
        }
        const parsed = frame as { error?: unknown; key?: string } & WebsocketResData;
        if (parsed.error) {
          const error = restoreRemoteError(parsed, 500, this.ErrorCls);
          this.#options.onError?.(error, parsed.key);
          throw error;
        }
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
            if (sub.subscribe) this.#acknowledge(sub);
            break;
          }
          case "pub": {
            const publishData = parsed as WebsocketPublishData;
            this.#handlePubsub(publishData.roomId, publishData.data, publishData.seq);
            break;
          }
          case "pong":
            break;
          case "auth": {
            const ack = parsed as WebsocketAuthAck;
            for (const roomId of ack.revokedRooms) {
              const requestRoomId = this.#roomAliasMap.get(roomId) ?? roomId;
              this.#roomSubscribeMap.delete(requestRoomId);
              this.#roomAliasMap.delete(roomId);
              this.logger.warn(`Websocket room ${roomId} is no longer authorized`);
              this.#options.onRevoked?.(requestRoomId);
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
      if (this.#ws !== ws) return;
      this.logger.debug(`WebSocket closed: ${event.code} ${event.reason}`);
      this.#ws = null;
      this.connected = false;
      this.#stopHeartbeat();
      //? Only a socket that stayed up ends the streak: a gateway that upgrades and drops at once is another failure.
      if (openedAt && Date.now() - openedAt >= WsClient.stableMs) this.#reconnectAttempts = 0;
      if (!this.#destroyed) this.#closed();
    };
  }

  //? The constructor throws only for what no instant retry fixes (a refused scheme or port, a malformed header), and
  //? thrown from ClientBridge's effect it unmounts the whole React root; so it is logged, as a failed attempt.
  #tryOpen(): WebSocket | null {
    this.#opening = true;
    try {
      return this.#open();
    } catch (error) {
      this.logger.error(`Cannot open a WebSocket to ${this.url}: ${error instanceof Error ? error.message : error}`);
      this.#closed();
      return null;
    } finally {
      this.#opening = false;
    }
  }

  //? The state hook may reconnect, destroy or give up meanwhile, and a reconnect it starts while an open is failing
  //? (`#opening`) is left to this backoff: a synchronous retry of the same constructor would recurse.
  #closed() {
    this.#setState("closed");
    if (this.#destroyed || this.#ws || this.#reconnectTimer || this.#state !== "closed") return;
    this.#scheduleReconnect();
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
    const { reconnect } = this.#options;
    this.#reconnectAttempts += 1;
    if (reconnect === false || this.#reconnectAttempts > (reconnect?.maxAttempts ?? Number.POSITIVE_INFINITY)) {
      this.logger.warn(`WebSocket to ${this.url} gave up after ${this.#reconnectAttempts - 1} attempt(s)`);
      this.#setState("gaveUp");
      return;
    }
    const interval = Backoff.delay(this.#reconnectAttempts, reconnect || undefined);
    this.logger.debug(`WebSocket reconnecting in ${interval}ms (attempt ${this.#reconnectAttempts})`);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect();
    }, interval);
    // A pending reconnect would otherwise hold a server-side runtime open past its last use.
    this.#reconnectTimer.unref?.();
    this.#watchWake(true);
  }

  #cancelReconnect() {
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#watchWake(false);
  }

  //? A tab back online or back in view would otherwise sit out the rest of a backoff that reaches 30 s.
  readonly #wake = () => {
    if (this.#reconnectTimer && document.visibilityState !== "hidden") this.#connect();
  };

  #watchWake(watch: boolean) {
    if (this.#watchingWake === watch || typeof window === "undefined" || typeof document === "undefined") return;
    this.#watchingWake = watch;
    if (watch) {
      window.addEventListener("online", this.#wake);
      document.addEventListener("visibilitychange", this.#wake);
    } else {
      window.removeEventListener("online", this.#wake);
      document.removeEventListener("visibilitychange", this.#wake);
    }
  }

  //? Bun takes headers and TLS on a WebSocket; a browser's constructor takes neither.
  #open(): WebSocket {
    if (typeof window !== "undefined") return new WebSocket(this.url);
    const { headers, tls } = this.#options;
    const authorization: Record<string, string> = this.#jwt ? { authorization: `Bearer ${this.#jwt}` } : {};
    const BunWebSocket = WebSocket as unknown as new (
      url: string,
      options: { headers?: Record<string, string>; tls?: WsClientOptions["tls"] },
    ) => WebSocket;
    return new BunWebSocket(this.url, { headers: { ...headers, ...authorization }, ...(tls ? { tls } : {}) });
  }

  #acknowledge(ack: WebsocketSubscribeAck) {
    const option = this.#roomSubscribeMap.get(ack.requestRoomId);
    if (!option) return;
    if (ack.cursor) {
      option.cursor.epoch = ack.cursor.epoch;
      if (option.cursor.seq === null || ack.cursor.seq > option.cursor.seq) option.cursor.seq = ack.cursor.seq;
    }
    if (!option.recovering) return;
    option.recovering = false;
    if (ack.replayed === true) return;
    for (const handler of option.resync) handler();
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
  #handlePubsub(roomId: string, data: unknown, seq?: number) {
    const roomSubscribe = this.#roomSubscribeMap.get(this.#roomAliasMap.get(roomId) ?? roomId);
    if (!roomSubscribe) return;
    const last = roomSubscribe.cursor.seq;
    //? A frame numbered at or below the last one taken arrived twice, once replayed and once live.
    if (seq !== undefined && last !== null && seq <= last) return;
    if (seq !== undefined) roomSubscribe.cursor.seq = seq;
    for (const listener of roomSubscribe.listener) listener(data);
    //? A hole in the numbering is a frame the server dropped for this socket, under backpressure.
    if (seq !== undefined && last !== null && seq > last + 1) for (const handler of roomSubscribe.resync) handler();
  }

  destroy() {
    this.logger.debug(`WebSocket destroying`);
    this.#destroyed = true;
    this.#connectRequested = false;
    this.#stopHeartbeat();
    this.#cancelReconnect();
    for (const timer of this.#unconnectedWarnTimers.values()) clearTimeout(timer);
    this.#unconnectedWarnTimers.clear();
    this.#outbox = [];
    this.#roomAliasMap.clear();
    this.#ws?.close();
    this.#ws = null;
    this.connected = false;
    this.#setState("closed");
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
      roomSubscribe = {
        key: option.key,
        data: option.data,
        listener: new Set(),
        resync: new Set(),
        cursor: { epoch: null, seq: null },
        recovering: false,
      };
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
