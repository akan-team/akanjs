import type { BaseEnv, Cls } from "akanjs/base";
import { adapt } from "../adapt";
import { RedisCache } from "./cache.adaptor";
import { ProtobufCompressor } from "./compress.adaptor";

export interface WsSocketData {
  socketId?: string;
  createdAt?: number;
}
export type WsRedisEventHandler = (roomId: string, data: unknown) => void;

export interface WebsocketAdaptor {
  /** Publish data to a room across all server instances */
  publish(roomId: string, data: unknown): void;
  /** Register an event handler for incoming cross-server messages */
  setEventHandler(handler: WsRedisEventHandler): void;
  /** Unregister the event handler */
  clearEventHandler(): void;
  /** Register endpoint return type info for protobuf encoding */
  registerEndpoint(key: string, returnRef: Cls, arrDepth: number): void;
  /** Register a socket joining a room (tracked in Redis for cross-server awareness) */
  joinRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void>;
  /** Remove a socket from a room */
  leaveRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void>;
  /** Remove a socket from all rooms and clean up its Redis state */
  leaveAllRooms(ws: Bun.ServerWebSocket<unknown>): Promise<void>;
  /** Register a socket connection on this server */
  registerSocket(ws: Bun.ServerWebSocket<unknown>, meta?: Record<string, string>): Promise<void>;
  /** Unregister a socket connection */
  unregisterSocket(ws: Bun.ServerWebSocket<unknown>): Promise<void>;
}

interface BufferedMessage {
  channel: string;
  message: Buffer;
}

const WEBSOCKET_PREFIX = "ws:";
const BROADCAST_CHANNEL = "ws:broadcast";

export class WebSocketRedisAdaptor
  extends adapt("wsRedis", ({ plug, env }) => ({
    redis: plug(RedisCache, (cache) => cache.getClient()),
    compressor: plug(ProtobufCompressor),
    serverId: env(
      ({ appName, environment, operationMode }: BaseEnv) =>
        `${appName}-${environment}-${operationMode}-${process.env.POD_NAME ?? Bun.randomUUIDv7()}`,
    ),
    publisher: plug(RedisCache, (cache) =>
      cache.getClient().duplicate({ lazyConnect: true, retryStrategy: (times) => Math.min(times * 200, 5000) }),
    ),
    subscriber: plug(RedisCache, (cache) =>
      cache.getClient().duplicate({ lazyConnect: true, retryStrategy: (times) => Math.min(times * 200, 5000) }),
    ),
  }))
  implements WebsocketAdaptor
{
  readonly #buffer: BufferedMessage[] = [];
  readonly #maxBufferSize = 10000;
  readonly #endpointMap = new Map<string, { returnRef: Cls; arrDepth: number }>();
  #eventHandler: WsRedisEventHandler | null = null;
  #publisherReady = false;
  #heartbeatInterval: Timer | null = null;

  override async onInit() {
    // Publisher lifecycle
    this.publisher.on("connect", () => {
      this.#publisherReady = true;
      this.logger.verbose("Publisher connected");
      this.#flushBuffer();
    });
    this.publisher.on("close", () => {
      this.#publisherReady = false;
      this.logger.warn("Publisher disconnected, buffering messages...");
    });
    this.publisher.on("error", (err: Error) => {
      this.logger.warn(`Publisher error: ${err.message}`);
    });

    // Subscriber lifecycle
    this.subscriber.on("error", (err: Error) => {
      this.logger.warn(`Subscriber error: ${err.message}`);
    });

    await this.publisher.connect();
    await this.subscriber.connect();

    // Subscribe to broadcast channel
    await this.subscriber.subscribe(BROADCAST_CHANNEL, (err?: Error | null) => {
      if (err) this.logger.warn(`Subscribe error: ${err.message}`);
    });

    this.subscriber.on("messageBuffer", (_channel: string, message: Buffer) => {
      try {
        const unpacked = this.#unpackMessage(message);
        if (!unpacked) throw new Error("Failed to unpack message");
        if (unpacked.origin === this.serverId || !this.#eventHandler) return;
        const endpointKey = this.#getEndpointKey(unpacked.roomId);
        const endpointInfo = endpointKey ? this.#endpointMap.get(endpointKey) : null;
        if (!endpointInfo) throw new Error(`No endpoint registered for roomId ${unpacked.roomId}`);
        const decoded = this.compressor.decode(endpointInfo.returnRef, endpointInfo.arrDepth, unpacked.payload, {
          raw: true,
        });
        this.#eventHandler(unpacked.roomId, decoded);
      } catch (err) {
        this.logger.warn(`Failed to handle Redis WS message: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    // Server heartbeat — expire server key every 60s, refresh every 30s
    // If a pod crashes without graceful shutdown, its keys expire after 60s
    await this.redis.set(`${WEBSOCKET_PREFIX}server:${this.serverId}`, Date.now().toString(), "EX", 60);
    this.#heartbeatInterval = setInterval(async () => {
      try {
        await this.redis.expire(`${WEBSOCKET_PREFIX}server:${this.serverId}:sockets`, 60);
        await this.redis.set(`${WEBSOCKET_PREFIX}server:${this.serverId}`, Date.now().toString(), "EX", 60);
      } catch (err) {
        this.logger.warn(`Heartbeat failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 30_000);

    this.logger.verbose(`WebSocket Redis adaptor initialized (serverId: ${this.serverId})`);
  }

  override async onDestroy() {
    // Stop heartbeat
    if (this.#heartbeatInterval) {
      clearInterval(this.#heartbeatInterval);
      this.#heartbeatInterval = null;
    }

    // Clean up all sockets registered to this server
    await this.#cleanupServer();

    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe(BROADCAST_CHANNEL);
      } catch {}
      this.subscriber.disconnect();
    }
    if (this.publisher) {
      await this.#flushBuffer();
      this.publisher.disconnect();
    }
    this.#eventHandler = null;
    this.#publisherReady = false;
    this.logger.verbose("WebSocket Redis adaptor destroyed");
  }

  // ── Pub/Sub ──

  publish(roomId: string, data: unknown): void {
    const endpointKey = this.#getEndpointKey(roomId);
    const endpointInfo = endpointKey ? this.#endpointMap.get(endpointKey) : null;
    if (!endpointInfo) {
      this.logger.warn(`No endpoint registered for roomId ${roomId}, skipping publish`);
      return;
    }
    const payload = this.compressor.encode(endpointInfo.returnRef, endpointInfo.arrDepth, data);
    if (!payload) {
      this.logger.warn(`Compressor encode failed for ${endpointKey}, skipping publish`);
      return;
    }
    const message = this.#packMessage(this.serverId, roomId, payload);
    if (this.#publisherReady && this.publisher) {
      this.publisher.publish(BROADCAST_CHANNEL, message).catch((err: Error) => {
        this.logger.warn(`Publish failed, buffering: ${err.message}`);
        this.#addToBuffer(BROADCAST_CHANNEL, message);
      });
    } else this.#addToBuffer(BROADCAST_CHANNEL, message);
  }

  setEventHandler(handler: WsRedisEventHandler): void {
    this.#eventHandler = handler;
  }

  clearEventHandler(): void {
    this.#eventHandler = null;
  }

  registerEndpoint(key: string, returnRef: Cls, arrDepth: number): void {
    this.#endpointMap.set(key, { returnRef, arrDepth });
  }

  #getEndpointKey(roomId: string): string {
    const idx = roomId.indexOf("-");
    return idx >= 0 ? roomId.substring(0, idx) : roomId;
  }

  // ── Room membership ──

  async joinRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void> {
    const socketId = this.#getSocketId(ws);
    const pipeline = this.redis.multi();
    pipeline.sadd(`${WEBSOCKET_PREFIX}room:${room}`, socketId);
    pipeline.sadd(`${WEBSOCKET_PREFIX}socket:${socketId}:rooms`, room);
    await pipeline.exec();
  }

  async leaveRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void> {
    const socketId = this.#getSocketId(ws);
    const pipeline = this.redis.multi();
    pipeline.srem(`${WEBSOCKET_PREFIX}room:${room}`, socketId);
    pipeline.srem(`${WEBSOCKET_PREFIX}socket:${socketId}:rooms`, room);
    await pipeline.exec();
  }

  async leaveAllRooms(ws: Bun.ServerWebSocket<unknown>): Promise<void> {
    const socketId = this.#getSocketId(ws);
    const rooms = await this.redis.smembers(`${WEBSOCKET_PREFIX}socket:${socketId}:rooms`);
    const pipeline = this.redis.multi();
    for (const room of rooms) {
      pipeline.srem(`${WEBSOCKET_PREFIX}room:${room}`, socketId);
    }
    pipeline.del(`${WEBSOCKET_PREFIX}socket:${socketId}:rooms`);
    pipeline.del(`${WEBSOCKET_PREFIX}socket:${socketId}`);
    pipeline.srem(`${WEBSOCKET_PREFIX}server:${this.serverId}:sockets`, socketId);
    await pipeline.exec();
  }

  // ── Socket registration ──
  #getSocketId(ws: Bun.ServerWebSocket<unknown>): string {
    const data = ws.data as WsSocketData;
    if (!data.socketId) data.socketId = `${this.serverId}-${Bun.randomUUIDv7()}`;
    return data.socketId;
  }

  async registerSocket(ws: Bun.ServerWebSocket<unknown>, meta: Record<string, string> = {}): Promise<void> {
    const pipeline = this.redis.multi();
    const socketId = this.#getSocketId(ws);
    pipeline.hset(`${WEBSOCKET_PREFIX}socket:${socketId}`, {
      serverId: this.serverId,
      connectedAt: Date.now().toString(),
      ...meta,
    });
    pipeline.sadd(`${WEBSOCKET_PREFIX}server:${this.serverId}:sockets`, socketId);
    await pipeline.exec();
  }

  async unregisterSocket(ws: Bun.ServerWebSocket<unknown>): Promise<void> {
    await this.leaveAllRooms(ws);
  }

  // ── Internal helpers ──

  #packMessage(origin: string, roomId: string, payload: Buffer): Buffer {
    const originBuf = Buffer.from(origin, "utf-8");
    const roomIdBuf = Buffer.from(roomId, "utf-8");
    const message = Buffer.alloc(2 + originBuf.length + 2 + roomIdBuf.length + payload.length);
    let offset = 0;
    message.writeUInt16BE(originBuf.length, offset);
    offset += 2;
    originBuf.copy(message, offset);
    offset += originBuf.length;
    message.writeUInt16BE(roomIdBuf.length, offset);
    offset += 2;
    roomIdBuf.copy(message, offset);
    offset += roomIdBuf.length;
    payload.copy(message, offset);
    return message;
  }

  #unpackMessage(buffer: Buffer): { origin: string; roomId: string; payload: Buffer } | null {
    if (buffer.length < 4) return null;
    let offset = 0;
    const originLen = buffer.readUInt16BE(offset);
    offset += 2;
    if (buffer.length < offset + originLen + 2) return null;
    const origin = buffer.subarray(offset, offset + originLen).toString("utf-8");
    offset += originLen;
    const roomIdLen = buffer.readUInt16BE(offset);
    offset += 2;
    if (buffer.length < offset + roomIdLen) return null;
    const roomId = buffer.subarray(offset, offset + roomIdLen).toString("utf-8");
    offset += roomIdLen;
    const payload = buffer.subarray(offset);
    return { origin, roomId, payload };
  }

  #addToBuffer(channel: string, message: Buffer): void {
    if (this.#buffer.length >= this.#maxBufferSize) {
      this.#buffer.shift();
      this.logger.warn("Buffer full, dropping oldest message");
    }
    this.#buffer.push({ channel, message });
  }

  async #flushBuffer(): Promise<void> {
    if (!this.#publisherReady || !this.publisher || this.#buffer.length === 0) return;

    this.logger.verbose(`Flushing ${this.#buffer.length} buffered messages`);
    const messages = this.#buffer.splice(0);
    for (const { channel, message } of messages) {
      try {
        await this.publisher.publish(channel, message);
      } catch {
        this.#buffer.unshift({ channel, message });
        this.logger.warn(`Flush failed, ${this.#buffer.length} messages remain buffered`);
        break;
      }
    }
  }

  async #cleanupServer(): Promise<void> {
    try {
      const sockets = await this.redis.smembers(`${WEBSOCKET_PREFIX}server:${this.serverId}:sockets`);
      const pipeline = this.redis.multi();
      for (const socketId of sockets) {
        // Get rooms for each socket and remove from room sets
        const rooms = await this.redis.smembers(`${WEBSOCKET_PREFIX}socket:${socketId}:rooms`);
        for (const room of rooms) {
          pipeline.srem(`${WEBSOCKET_PREFIX}room:${room}`, socketId);
        }
        pipeline.del(`${WEBSOCKET_PREFIX}socket:${socketId}:rooms`);
        pipeline.del(`${WEBSOCKET_PREFIX}socket:${socketId}`);
      }
      pipeline.del(`${WEBSOCKET_PREFIX}server:${this.serverId}:sockets`);
      pipeline.del(`${WEBSOCKET_PREFIX}server:${this.serverId}`);
      await pipeline.exec();
      this.logger.verbose(`Cleaned up ${sockets.length} sockets from Redis`);
    } catch (err) {
      this.logger.warn(`Server cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
