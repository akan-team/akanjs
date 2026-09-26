import { hostname } from "node:os";
import { getEnv } from "akanjs/base";
import { adapt } from "../adapt";
import { RedisCache } from "./cache.adaptor";

export interface WsSocketData {
  socketId?: string;
  createdAt?: number;
}
export type WsRedisEventHandler = (roomId: string, data: unknown) => void;

/** A committed write to a model that live slices route, as text every server of the app turns back into documents. */
export interface LiveChange {
  refName: string;
  next: string;
  /** Absent on a create. */
  previous?: string;
}
export type LiveChangeHandler = (change: LiveChange) => void;

export interface WebsocketPublishOption {
  /** Only the newest frame for the room matters, so an undelivered older one may be dropped for it. */
  coalesce?: boolean;
}

export interface WebsocketAdaptor {
  /** Publish data to a room across all server instances */
  publish(roomId: string, data: unknown, option?: WebsocketPublishOption): void;
  /** Register an event handler for incoming cross-server messages */
  setEventHandler(handler: WsRedisEventHandler): void;
  /** Unregister the event handler */
  clearEventHandler(): void;
  /**
   * Called after the cross-server channel has been down and come back, if this transport can lose one.
   *
   * A dropped subscription is the one message loss nothing else notices: the client's own socket stays open the
   * whole time, so it has no reason to suspect its list is behind. A transport with no channel to lose — the
   * single-node one, which delivers through the gateway's own IPC — leaves this out.
   */
  onRecovered?(handler: () => void): void;
  /**
   * Hands a committed write to every other server of the app, each of which routes it to the live rooms it holds —
   * the writer only knows its own rooms, and a batch process holds none.
   */
  publishChange?(change: LiveChange): void;
  onChange?(handler: LiveChangeHandler): void;
  /** Register a socket on this server joining a room */
  joinRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void>;
  /** Remove a socket from a room */
  leaveRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void>;
  /** Remove a socket from all rooms */
  leaveAllRooms(ws: Bun.ServerWebSocket<unknown>): Promise<void>;
  /** Register a socket connection on this server */
  registerSocket(ws: Bun.ServerWebSocket<unknown>, meta?: Record<string, string>): Promise<void>;
  /** Unregister a socket connection */
  unregisterSocket(ws: Bun.ServerWebSocket<unknown>): Promise<void>;
}

interface BufferedMessage {
  roomId: string;
  message: Buffer;
  coalesce: boolean;
}

export class WebSocketRedisAdaptor
  extends adapt("wsRedis", ({ plug, env }) => ({
    channelPrefix: plug(RedisCache, (cache) => cache.keyPrefix),
    // Unique per process: a server skips the messages it published itself, and two replicas in one pod are two servers.
    serverId: env(() => {
      const { appName, environment } = getEnv();
      return `${appName}-${environment}-${process.env.POD_NAME ?? hostname()}-${process.pid}`;
    }),
    publisher: plug(RedisCache, (cache) =>
      cache.getClient().duplicate({ lazyConnect: true, retryStrategy: (times) => Math.min(times * 200, 5000) }),
    ),
    subscriber: plug(RedisCache, (cache) =>
      cache.getClient().duplicate({ lazyConnect: true, retryStrategy: (times) => Math.min(times * 200, 5000) }),
    ),
  }))
  implements WebsocketAdaptor
{
  //* A message is `[version][kind][origin length][origin][room length][room][payload]`, and the payload is what the
  //* publishing server hands its own sockets — JSON text or a Binary frame's bytes — so a server receiving it needs
  //* no model to read it, and two releases side by side in a rolling deploy read each other's events. A `change`
  //* carries a committed write and no room; a release that predates it finds no room of that name and drops it.
  static readonly #version = 1;
  static readonly #kind = { json: 0x6a, bytes: 0x62, change: 0x63 } as const;
  readonly #buffer: BufferedMessage[] = [];
  readonly #maxBufferSize = 10000;
  readonly #roomSockets = new Map<string, Set<string>>();
  readonly #socketRooms = new Map<string, Set<string>>();
  #eventHandler: WsRedisEventHandler | null = null;
  #changeHandler: LiveChangeHandler | null = null;
  #recoveryHandler: (() => void) | null = null;
  #publisherReady = false;
  #subscriberReady = false;
  /** Whether the subscriber has ever been up, so the first `ready` is a start rather than a recovery. */
  #subscriberStarted = false;
  #warnedVersion = false;

  get #channel() {
    return `${this.channelPrefix}ws:broadcast`;
  }

  override async onInit() {
    this.publisher.on("connect", () => {
      this.#publisherReady = true;
      this.logger.verbose("Publisher connected");
      void this.#flushBuffer();
    });
    this.publisher.on("close", () => {
      this.#publisherReady = false;
      this.logger.warn("Publisher disconnected, buffering messages...");
    });
    this.publisher.on("error", (err: Error) => {
      this.logger.warn(`Publisher error: ${err.message}`);
    });

    // Subscriber lifecycle. Without the pair below, a dropped subscription is invisible: ioredis reconnects and
    // resubscribes on its own, the messages published in between are gone for good, and every socket this server
    // holds stays open — so nothing anywhere knows a list is now behind.
    this.subscriber.on("error", (err: Error) => {
      this.logger.warn(`Subscriber error: ${err.message}`);
    });
    this.subscriber.on("close", () => {
      if (!this.#subscriberReady) return;
      this.#subscriberReady = false;
      this.logger.warn("Subscriber disconnected; cross-server events are being missed until it returns");
    });
    this.subscriber.on("ready", () => {
      const recovering = !this.#subscriberReady && this.#subscriberStarted;
      this.#subscriberReady = true;
      this.#subscriberStarted = true;
      if (!recovering) return;
      this.logger.warn("Subscriber reconnected; asking every room on this server to resynchronize");
      this.#recoveryHandler?.();
    });

    await this.publisher.connect();
    await this.subscriber.connect();
    await this.subscriber.subscribe(this.#channel, (err?: Error | null) => {
      if (err) this.logger.warn(`Subscribe error: ${err.message}`);
    });
    this.subscriber.on("messageBuffer", (_channel: Buffer, message: Buffer) => this.#receive(message));
    this.logger.verbose(`WebSocket Redis adaptor initialized (serverId: ${this.serverId})`);
  }

  override async onDestroy() {
    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe(this.#channel);
      } catch {}
      this.subscriber.disconnect();
    }
    if (this.publisher) {
      await this.#flushBuffer();
      this.publisher.disconnect();
    }
    this.#eventHandler = null;
    this.#changeHandler = null;
    this.#recoveryHandler = null;
    this.#publisherReady = false;
    this.#subscriberReady = false;
    this.#roomSockets.clear();
    this.#socketRooms.clear();
    this.logger.verbose("WebSocket Redis adaptor destroyed");
  }

  publish(roomId: string, data: unknown, { coalesce = false }: WebsocketPublishOption = {}): void {
    const bytes = data instanceof Uint8Array;
    const payload = bytes ? data : JSON.stringify(data);
    if (payload === undefined) {
      this.logger.warn(`Nothing to publish to ${roomId}: the payload has no JSON form`);
      return;
    }
    this.#send({ roomId, message: this.#pack(bytes ? "bytes" : "json", roomId, payload), coalesce });
  }

  publishChange(change: LiveChange): void {
    this.#send({ roomId: "", message: this.#pack("change", "", JSON.stringify(change)), coalesce: false });
  }

  onChange(handler: LiveChangeHandler): void {
    this.#changeHandler = handler;
  }

  #send(buffered: BufferedMessage) {
    if (!this.#publisherReady) {
      this.#addToBuffer(buffered);
      return;
    }
    this.publisher.publish(this.#channel, buffered.message).catch((err: Error) => {
      this.logger.warn(`Publish failed, buffering: ${err.message}`);
      this.#addToBuffer(buffered);
    });
  }

  setEventHandler(handler: WsRedisEventHandler): void {
    this.#eventHandler = handler;
  }

  clearEventHandler(): void {
    this.#eventHandler = null;
  }

  onRecovered(handler: () => void): void {
    this.#recoveryHandler = handler;
  }

  async joinRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void> {
    const socketId = this.#getSocketId(ws);
    const sockets = this.#roomSockets.get(room) ?? new Set<string>();
    sockets.add(socketId);
    this.#roomSockets.set(room, sockets);
    const rooms = this.#socketRooms.get(socketId) ?? new Set<string>();
    rooms.add(room);
    this.#socketRooms.set(socketId, rooms);
  }

  async leaveRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void> {
    const socketId = this.#getSocketId(ws);
    this.#forget(socketId, room);
    const rooms = this.#socketRooms.get(socketId);
    rooms?.delete(room);
    if (rooms?.size === 0) this.#socketRooms.delete(socketId);
  }

  async leaveAllRooms(ws: Bun.ServerWebSocket<unknown>): Promise<void> {
    const socketId = this.#getSocketId(ws);
    for (const room of this.#socketRooms.get(socketId) ?? []) this.#forget(socketId, room);
    this.#socketRooms.delete(socketId);
  }

  /**
   * `AppWsData` mints the id at the handshake, so this reads it; the fallback only covers a socket that
   * was upgraded outside the app router.
   */
  #getSocketId(ws: Bun.ServerWebSocket<unknown>): string {
    const data = ws.data as WsSocketData;
    data.socketId ??= Bun.randomUUIDv7();
    return data.socketId;
  }

  async registerSocket(ws: Bun.ServerWebSocket<unknown>): Promise<void> {
    this.#getSocketId(ws);
  }

  async unregisterSocket(ws: Bun.ServerWebSocket<unknown>): Promise<void> {
    await this.leaveAllRooms(ws);
  }

  #forget(socketId: string, room: string) {
    const sockets = this.#roomSockets.get(room);
    sockets?.delete(socketId);
    if (sockets?.size === 0) this.#roomSockets.delete(room);
  }

  #receive(message: Buffer) {
    try {
      const unpacked = this.#unpack(message);
      if (!unpacked || unpacked.origin === this.serverId) return;
      if (unpacked.kind === WebSocketRedisAdaptor.#kind.change) {
        this.#changeHandler?.(JSON.parse(unpacked.payload.toString()) as LiveChange);
        return;
      }
      // Every server hears every event of the app; one with nobody in the room stops before reading the payload.
      if (!this.#eventHandler || !this.#roomSockets.has(unpacked.roomId)) return;
      const data =
        unpacked.kind === WebSocketRedisAdaptor.#kind.bytes
          ? new Uint8Array(unpacked.payload)
          : (JSON.parse(unpacked.payload.toString()) as unknown);
      this.#eventHandler(unpacked.roomId, data);
    } catch (err) {
      this.logger.warn(`Failed to handle Redis WS message: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  #pack(kind: "json" | "bytes" | "change", roomId: string, payload: string | Uint8Array): Buffer {
    const origin = Buffer.from(this.serverId, "utf-8");
    const room = Buffer.from(roomId, "utf-8");
    const header = Buffer.alloc(2 + 2 + origin.length + 2 + room.length);
    let offset = header.writeUInt8(WebSocketRedisAdaptor.#version, 0);
    offset = header.writeUInt8(WebSocketRedisAdaptor.#kind[kind], offset);
    offset = header.writeUInt16BE(origin.length, offset);
    offset += origin.copy(header, offset);
    offset = header.writeUInt16BE(room.length, offset);
    room.copy(header, offset);
    const body = typeof payload === "string" ? Buffer.from(payload, "utf-8") : payload;
    return Buffer.concat([header, body]);
  }

  #unpack(buffer: Buffer): { kind: number; origin: string; roomId: string; payload: Buffer } | null {
    if (buffer.length < 6) return null;
    if (buffer.readUInt8(0) !== WebSocketRedisAdaptor.#version) {
      if (!this.#warnedVersion)
        this.logger.warn(
          `Dropping cross-server events of envelope version ${buffer.readUInt8(0)}; this server reads 1`,
        );
      this.#warnedVersion = true;
      return null;
    }
    const kind = buffer.readUInt8(1);
    let offset = 2;
    const originLength = buffer.readUInt16BE(offset);
    offset += 2;
    if (buffer.length < offset + originLength + 2) return null;
    const origin = buffer.subarray(offset, offset + originLength).toString("utf-8");
    offset += originLength;
    const roomLength = buffer.readUInt16BE(offset);
    offset += 2;
    if (buffer.length < offset + roomLength) return null;
    const roomId = buffer.subarray(offset, offset + roomLength).toString("utf-8");
    offset += roomLength;
    return { kind, origin, roomId, payload: buffer.subarray(offset) };
  }

  #addToBuffer(buffered: BufferedMessage): void {
    if (buffered.coalesce) {
      const stale = this.#buffer.findIndex((item) => item.coalesce && item.roomId === buffered.roomId);
      if (stale >= 0) this.#buffer.splice(stale, 1);
    }
    if (this.#buffer.length >= this.#maxBufferSize) {
      this.#buffer.shift();
      this.logger.warn("Buffer full, dropping oldest message");
    }
    this.#buffer.push(buffered);
  }

  async #flushBuffer(): Promise<void> {
    if (!this.#publisherReady || !this.publisher || this.#buffer.length === 0) return;

    this.logger.verbose(`Flushing ${this.#buffer.length} buffered messages`);
    const messages = this.#buffer.splice(0);
    for (const [idx, buffered] of messages.entries()) {
      try {
        await this.publisher.publish(this.#channel, buffered.message);
      } catch {
        this.#buffer.unshift(...messages.slice(idx));
        this.logger.warn(`Flush failed, ${this.#buffer.length} messages remain buffered`);
        break;
      }
    }
  }
}
