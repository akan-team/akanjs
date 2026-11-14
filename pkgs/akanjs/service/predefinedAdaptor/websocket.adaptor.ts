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

export interface WebsocketJoinOption {
  /** The model a live room is routed by: its events come from that model's changes, never from a `publish`. */
  live?: string;
}

export interface WebsocketAdaptor {
  /** Across every server instance. */
  publish(roomId: string, data: unknown, option?: WebsocketPublishOption): void;
  setEventHandler(handler: WsRedisEventHandler): void;
  clearEventHandler(): void;
  /**
   * After a lost cross-server channel returns — a loss the still-open client socket never notices — with the rooms held
   * here, which may have missed events meanwhile. Called once their events reach this server again, since each room
   * refetches on it and would miss an event published before then. Optional.
   */
  onRecovered?(handler: (rooms: string[]) => void): void;
  /** To the app's other servers, behind the gateway only those with a room for its model; a writer knows only its own. */
  publishChange?(change: LiveChange): void;
  onChange?(handler: LiveChangeHandler): void;
  /** The models this server holds live rooms for, each time that changes, so changes to the rest pass it by. */
  reportLiveModels?(models: string[]): void;
  /** Resolves once what another server publishes to the room reaches this one, or sooner if that link is down or stalls. */
  joinRoom(ws: Bun.ServerWebSocket<unknown>, room: string, option?: WebsocketJoinOption): Promise<void>;
  leaveRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void>;
  leaveAllRooms(ws: Bun.ServerWebSocket<unknown>): Promise<void>;
  registerSocket(ws: Bun.ServerWebSocket<unknown>, meta?: Record<string, string>): Promise<void>;
  unregisterSocket(ws: Bun.ServerWebSocket<unknown>): Promise<void>;
}

interface BufferedMessage {
  channel: string;
  roomId: string;
  message: Buffer;
  coalesce: boolean;
  seq: number;
}

interface HeldRoom {
  sockets: Set<string>;
  channel: string;
}

interface ChannelHold {
  rooms: number;
  reply?: Promise<void>;
  confirmed: boolean;
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
  //* `[version][kind][origin length][origin][room length][room][payload]`; the payload is what the publisher hands its
  //* own sockets, so a receiver needs no model.
  static readonly #version = 1;
  static readonly #kind = { json: 0x6a, bytes: 0x62, change: 0x63 } as const;
  //* Every server of an app must split rooms the same way, or it listens on shards the others never publish to. More
  //* shards bring what a server hears closer to its own rooms, at one more SUBSCRIBE for a room alone in its shard.
  static readonly #shards = 16_384;
  //? A link that stalls without closing would otherwise hold a subscribe's ack for as long as it stalls.
  static readonly #subscribeTimeoutMs = 3_000;
  readonly #buffer: BufferedMessage[] = [];
  readonly #maxBufferSize = 10000;
  readonly #rooms = new Map<string, HeldRoom>();
  readonly #socketRooms = new Map<string, Set<string>>();
  readonly #channels = new Map<string, ChannelHold>();
  #eventHandler: WsRedisEventHandler | null = null;
  #changeHandler: LiveChangeHandler | null = null;
  #recoveryHandler: ((rooms: string[]) => void) | null = null;
  #publisherReady = false;
  #draining = false;
  #drained: Promise<void> = Promise.resolve();
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #retries = 0;
  #sent = 0;
  #subscriberReady = false;
  /** Whether the subscriber has ever been up, so the first `ready` is a start rather than a recovery. */
  #subscriberStarted = false;
  #destroyed = false;
  readonly #lossWaiters = new Set<() => void>();
  readonly #lastLogged = new Map<string, number>();

  #roomChannel(roomId: string) {
    return `${this.channelPrefix}ws:room:${Bun.hash.crc32(roomId) % WebSocketRedisAdaptor.#shards}`;
  }

  #changeChannel(refName: string) {
    return `${this.channelPrefix}ws:change:${refName}`;
  }

  override async onInit() {
    //* Not `connect`: ioredis writes a PUBLISH during the handshake and loses it if the handshake fails. It resends what
    //* a dropped connection left unanswered just before `ready`, so a drain started here goes out behind those.
    this.publisher.on("ready", () => {
      this.#publisherReady = true;
      this.logger.verbose("Publisher connected");
      this.#cancelRetry();
      void this.#flushBuffer();
    });
    this.publisher.on("close", () => {
      if (!this.#publisherReady) return;
      this.#publisherReady = false;
      this.logger.warn("Publisher disconnected, buffering messages...");
    });
    this.publisher.on("error", (err: Error) => {
      this.logger.warn(`Publisher error: ${err.message}`);
    });

    //* Off, so the `ready` loop below alone decides what is subscribed: ioredis would also restore a channel whose
    //* UNSUBSCRIBE it dropped in an outage, and that channel would stay subscribed with no room on it.
    this.subscriber.options.autoResubscribe = false;
    // What other servers published while the subscriber was down is lost, while every socket here stays open.
    this.subscriber.on("error", (err: Error) => {
      this.logger.warn(`Subscriber error: ${err.message}`);
    });
    this.subscriber.on("close", () => {
      this.#loseSubscriber();
      if (!this.#subscriberReady) return;
      this.#subscriberReady = false;
      //? Redis's idle `timeout` spares only a client holding a channel, so it cuts off a server holding no room.
      if (this.#channels.size)
        this.logger.warn("Subscriber disconnected; cross-server events are being missed until it returns");
    });
    this.subscriber.on("ready", () => {
      //? ioredis can still emit a `ready` it queued before `disconnect()`: a resync then reaches sockets being shut down.
      if (this.#destroyed) return;
      //* A SUBSCRIBE ioredis rejected in an outage included. `ready` fires before Redis answers what ioredis resent, so
      //* no earlier reply vouches for the new connection.
      const replies = [...this.#channels].map(([channel, hold]) => this.#subscribe(channel, hold));
      const recovering = !this.#subscriberReady && this.#subscriberStarted && this.#channels.size > 0;
      this.#subscriberReady = true;
      this.#subscriberStarted = true;
      if (!recovering) return;
      this.logger.warn("Subscriber reconnected; asking every room on this server to resynchronize");
      //? Once Redis hands this server its rooms' events again: a room that refetched sooner could miss an event published
      //? meanwhile. A link that stalls has them told at the cap a join waits, and again once it answers; one that drops
      //? first has them told at the next `ready`.
      let lost = false;
      const recover = () => {
        if (!lost) this.#recoveryHandler?.([...this.#rooms.keys()]);
      };
      const timer = setTimeout(recover, WebSocketRedisAdaptor.#subscribeTimeoutMs);
      const lose = () => {
        lost = true;
        clearTimeout(timer);
      };
      this.#lossWaiters.add(lose);
      void Promise.all(replies).then(() => {
        this.#lossWaiters.delete(lose);
        clearTimeout(timer);
        recover();
      });
    });

    await this.publisher.connect();
    await this.subscriber.connect();
    this.subscriber.on("messageBuffer", (_channel: Buffer, message: Buffer) => this.#receive(message));
    this.logger.verbose(`WebSocket Redis adaptor initialized (serverId: ${this.serverId})`);
  }

  override async onDestroy() {
    this.#destroyed = true;
    this.#loseSubscriber();
    this.#subscriberReady = false;
    this.subscriber.disconnect();
    if (this.publisher) {
      this.#cancelRetry();
      //? One deadline for both waits below: a link that stalls without closing answers neither.
      const stalled = Promise.withResolvers<"stalled">();
      const timer = setTimeout(() => stalled.resolve("stalled"), 1_000);
      //? A batch the publisher was cut off under waits in ioredis for Redis to return, which a shutdown must not.
      if (this.#publisherReady) await Promise.race([this.#flushBuffer(), this.#closed(), stalled.promise]);
      this.#cancelRetry();
      const connected = this.#publisherReady;
      this.#publisherReady = false;
      //? `disconnect` returns with the socket still writing, and the process exits next, so the rest of a backlog never
      //? leaves. Redis answers QUIT only after every command ahead of it.
      const ended = connected
        ? await Promise.race([this.publisher.quit().catch(() => undefined), this.#closed(), stalled.promise])
        : undefined;
      clearTimeout(timer);
      if (ended === "stalled")
        this.logger.warn(
          "Redis did not answer within 1 s of shutdown; cross-server events still being sent may be lost",
        );
      //? On a link that already ended, ioredis would arm a 2 s destroy timer that no close ever clears.
      if (this.publisher.status !== "end") this.publisher.disconnect();
    }
    this.#eventHandler = null;
    this.#changeHandler = null;
    this.#recoveryHandler = null;
    this.#rooms.clear();
    this.#socketRooms.clear();
    this.#channels.clear();
    this.logger.verbose("WebSocket Redis adaptor destroyed");
  }

  publish(roomId: string, data: unknown, { coalesce = false }: WebsocketPublishOption = {}): void {
    const bytes = data instanceof Uint8Array;
    const payload = bytes ? data : JSON.stringify(data);
    if (payload === undefined) {
      this.logger.warn(`Nothing to publish to ${roomId}: the payload has no JSON form`);
      return;
    }
    this.#send({
      channel: this.#roomChannel(roomId),
      roomId,
      message: this.#pack(bytes ? "bytes" : "json", roomId, payload),
      coalesce,
      seq: this.#sent++,
    });
  }

  publishChange(change: LiveChange): void {
    this.#send({
      channel: this.#changeChannel(change.refName),
      roomId: "",
      message: this.#pack("change", "", JSON.stringify(change)),
      coalesce: false,
      seq: this.#sent++,
    });
  }

  onChange(handler: LiveChangeHandler): void {
    this.#changeHandler = handler;
  }

  //? Behind a non-empty buffer a message waits its turn: published now, it would overtake the ones still draining.
  #send(buffered: BufferedMessage) {
    if (!this.#publisherReady || this.#draining || this.#buffer.length) {
      this.#addToBuffer(buffered);
      void this.#flushBuffer();
      return;
    }
    this.publisher.publish(buffered.channel, buffered.message).catch((err: Error) => {
      if (this.#refused(buffered, err)) return;
      this.logger.warn(`Publish failed, buffering: ${err.message}`);
      this.#requeue([buffered]);
      void this.#flushBuffer();
    });
  }

  setEventHandler(handler: WsRedisEventHandler): void {
    this.#eventHandler = handler;
  }

  clearEventHandler(): void {
    this.#eventHandler = null;
  }

  onRecovered(handler: (rooms: string[]) => void): void {
    this.#recoveryHandler = handler;
  }

  async joinRoom(ws: Bun.ServerWebSocket<unknown>, room: string, { live }: WebsocketJoinOption = {}): Promise<void> {
    const socketId = this.#getSocketId(ws);
    let held = this.#rooms.get(room);
    if (!held) {
      held = { sockets: new Set(), channel: live ? this.#changeChannel(live) : this.#roomChannel(room) };
      this.#rooms.set(room, held);
      this.#hold(held.channel);
    }
    held.sockets.add(socketId);
    const rooms = this.#socketRooms.get(socketId) ?? new Set<string>();
    rooms.add(room);
    this.#socketRooms.set(socketId, rooms);
    await this.#awaitChannel(held.channel);
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

  /** `AppWsData` mints the id at the handshake; the fallback covers a socket upgraded outside the app router. */
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
    const held = this.#rooms.get(room);
    if (!held?.sockets.delete(socketId) || held.sockets.size) return;
    this.#rooms.delete(room);
    this.#release(held.channel);
  }

  #hold(channel: string) {
    const hold = this.#channels.get(channel) ?? { rooms: 0, confirmed: false };
    hold.rooms += 1;
    this.#channels.set(channel, hold);
  }

  #release(channel: string) {
    const hold = this.#channels.get(channel);
    if (!hold) return;
    hold.rooms -= 1;
    if (hold.rooms > 0) return;
    this.#channels.delete(channel);
    this.subscriber.unsubscribe(channel).catch((err: Error) => {
      this.logger.warn(`Unsubscribe from ${channel} failed: ${err.message}`);
    });
  }

  //? Redis hands this connection every PUBLISH it runs after the SUBSCRIBE, so once the reply is in, nothing later is lost.
  async #awaitChannel(channel: string) {
    const hold = this.#channels.get(channel);
    if (!hold || hold.confirmed) return;
    const reply = hold.reply ?? this.#subscribe(channel, hold);
    if (!this.#subscriberReady) return;
    //? Per wait, not one promise held until the next close: every race would leave a reaction on it until then.
    let wake = () => {};
    const woken = new Promise<void>((resolve) => {
      wake = resolve;
    });
    this.#lossWaiters.add(wake);
    const timer = setTimeout(wake, WebSocketRedisAdaptor.#subscribeTimeoutMs);
    try {
      await Promise.race([reply, woken]);
    } finally {
      clearTimeout(timer);
      this.#lossWaiters.delete(wake);
    }
  }

  #loseSubscriber() {
    for (const wake of this.#lossWaiters) wake();
    this.#lossWaiters.clear();
  }

  #subscribe(channel: string, hold: ChannelHold): Promise<void> {
    const reply: Promise<void> = this.subscriber.subscribe(channel).then(
      () => {
        if (hold.reply === reply) hold.confirmed = true;
      },
      (err: Error) => {
        this.logger.warn(`Subscribe to ${channel} failed: ${err.message}`);
        if (hold.reply === reply) hold.reply = undefined;
      },
    );
    hold.reply = reply;
    hold.confirmed = false;
    return reply;
  }

  #receive(message: Buffer) {
    try {
      const unpacked = this.#unpack(message);
      if (!unpacked || unpacked.origin === this.serverId) return;
      if (unpacked.kind === WebSocketRedisAdaptor.#kind.change) {
        this.#changeHandler?.(JSON.parse(unpacked.payload.toString()) as LiveChange);
        return;
      }
      // A shard carries other rooms too; a server with nobody in this one stops before reading the payload.
      if (!this.#eventHandler || !this.#rooms.has(unpacked.roomId)) return;
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
      if (!this.#lastLogged.has("version"))
        this.logger.warn(
          `Dropping cross-server events of envelope version ${buffer.readUInt8(0)}; this server reads 1`,
        );
      this.#lastLogged.set("version", Date.now());
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
      const stale = this.#buffer.findIndex(
        (item) => item.coalesce && item.roomId === buffered.roomId && item.channel === buffered.channel,
      );
      if (stale >= 0) this.#buffer.splice(stale, 1);
    }
    if (this.#buffer.length >= this.#maxBufferSize) {
      this.#buffer.shift();
      this.logger.warn("Buffer full, dropping oldest message");
    }
    this.#buffer.push(buffered);
  }

  #requeue(failed: BufferedMessage[]) {
    this.#buffer.push(...failed);
    this.#buffer.sort((a, b) => a.seq - b.seq);
    const newest = new Map<string, number>();
    for (const { coalesce, channel, roomId, seq } of this.#buffer)
      if (coalesce) newest.set(`${channel}\0${roomId}`, seq);
    const kept = this.#buffer.filter(
      ({ coalesce, channel, roomId, seq }) => !coalesce || newest.get(`${channel}\0${roomId}`) === seq,
    );
    const over = Math.max(0, kept.length - this.#maxBufferSize);
    this.#buffer.splice(0, this.#buffer.length, ...kept.slice(over));
    if (over) this.logger.warn(`Buffer full, dropping the oldest ${over} messages`);
  }

  #flushBuffer(): Promise<void> {
    if (!this.#draining && !this.#retryTimer && this.#publisherReady && this.publisher && this.#buffer.length) {
      this.#draining = true;
      this.#drained = this.#drain();
    }
    return this.#drained;
  }

  //? Not awaited one by one: ioredis writes commands to its one connection in the order they were issued.
  async #drain(): Promise<void> {
    try {
      while (this.#publisherReady && this.#buffer.length) {
        this.logger.verbose(`Flushing ${this.#buffer.length} buffered messages`);
        const batch = this.#buffer.splice(0);
        const results = await Promise.allSettled(
          batch.map((buffered) => this.publisher.publish(buffered.channel, buffered.message)),
        );
        const failed = batch.filter((buffered, idx) => {
          const result = results[idx];
          return result.status === "rejected" && !this.#refused(buffered, result.reason);
        });
        if (!failed.length) {
          this.#retries = 0;
          continue;
        }
        this.#requeue(failed);
        this.logger.warn(`Flush failed, ${this.#buffer.length} messages remain buffered`);
        if (this.#publisherReady) this.#retryLater();
        break;
      }
    } finally {
      this.#draining = false;
    }
  }

  //? An ACL refuses the channel on every retry too, and a retried message holds back every one queued behind it.
  //? Logged per family, not per shard, and again after a minute, so an ACL fixed and broken again is heard.
  #refused({ channel }: BufferedMessage, err: unknown) {
    if (!(err instanceof Error) || !err.message.startsWith("NOPERM")) return false;
    const family = channel.slice(0, channel.lastIndexOf(":"));
    const now = Date.now();
    if (now - (this.#lastLogged.get(family) ?? Number.NEGATIVE_INFINITY) < 60_000) return true;
    this.#lastLogged.set(family, now);
    this.logger.error(`Redis refused a PUBLISH to ${channel}; events on ${family} are being dropped: ${err.message}`);
    return true;
  }

  //? An error reply leaves the publisher connected, and a flush on the next send would fail the same way.
  #retryLater() {
    this.#retries += 1;
    this.#retryTimer = setTimeout(
      () => {
        this.#retryTimer = null;
        void this.#flushBuffer();
      },
      Math.min(this.#retries * 200, 5000),
    );
  }

  #cancelRetry() {
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }

  #closed() {
    return new Promise<void>((resolve) => this.publisher.once("close", () => resolve()));
  }
}
