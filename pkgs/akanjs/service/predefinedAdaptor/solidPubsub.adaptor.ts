import { getEnv } from "akanjs/base";
import { adapt } from "../adapt";
import { sendAkanIpc } from "../ipcTypes";
import type {
  LiveChange,
  LiveChangeHandler,
  WebsocketAdaptor,
  WsRedisEventHandler,
  WsSocketData,
} from "./websocket.adaptor";

/** `AppWsData` mints the id at the handshake; the fallback covers a socket upgraded outside the app router. */
const getSocketId = (ws: Bun.ServerWebSocket<unknown>) => {
  const data = ws.data as WsSocketData;
  data.socketId ??= Bun.randomUUIDv7();
  return data.socketId;
};

export class SolidPubSub
  extends adapt("solidPubsub", ({ env }) => ({
    serverId: env(() => {
      const { appName, environment, operationMode } = getEnv();
      return `${appName}-${environment}-${operationMode}-${process.env.AKAN_REPLICA_IDX ?? "0"}-${process.pid}`;
    }),
    //* Only the gateway answers a subscribe. A solo server has a replica index too, and a desktop one an IPC parent (the
    //* shell) that never answers; only a gateway child is handed a socket to serve on.
    behindGateway: env(() => !!process.env.AKAN_CHILD_SOCKET),
  }))
  implements WebsocketAdaptor
{
  //? A gateway that falls this far behind would otherwise hold a subscribe's ack for as long as it lags.
  static readonly #ackTimeoutMs = 3_000;
  readonly #socketRooms = new Map<string, Set<string>>();
  readonly #acks = new Map<number, () => void>();
  #lastAck = 0;
  #eventHandler: WsRedisEventHandler | null = null;
  #changeHandler: LiveChangeHandler | null = null;
  #liveModels: string[] = [];
  readonly #messageHandler = (message: unknown) => {
    if (!message || typeof message !== "object") return;
    const data = message as {
      type?: string;
      roomId?: string;
      data?: unknown;
      origin?: string;
      change?: LiveChange;
      ack?: number;
    };
    if (data.type === "pubsub.subscribed" && data.ack !== undefined) {
      this.#acks.get(data.ack)?.();
      return;
    }
    if (data.type === "pubsub.deliver" && data.roomId && data.origin !== this.serverId) {
      this.#eventHandler?.(data.roomId, data.data);
      return;
    }
    if (data.type === "live.change" && data.change && data.origin !== this.serverId) {
      this.#changeHandler?.(data.change);
      return;
    }
    if (data.type === "pubsub.snapshot.request") {
      sendAkanIpc({
        type: "pubsub.snapshot",
        rooms: [...new Set([...this.#socketRooms.values()].flatMap((rooms) => [...rooms]))],
        liveModels: this.#liveModels,
        pid: process.pid,
      });
    }
  };

  override async onInit() {
    process.on("message", this.#messageHandler);
  }

  override async onDestroy() {
    process.off("message", this.#messageHandler);
    for (const answer of this.#acks.values()) answer();
    this.#acks.clear();
    this.#eventHandler = null;
    this.#changeHandler = null;
    this.#liveModels = [];
    this.#socketRooms.clear();
  }

  publish(roomId: string, data: unknown): void {
    sendAkanIpc({ type: "pubsub.publish", roomId, data: data as object | object[], origin: this.serverId });
  }

  publishChange(change: LiveChange): void {
    sendAkanIpc({ type: "live.change", change, origin: this.serverId });
  }

  onChange(handler: LiveChangeHandler): void {
    this.#changeHandler = handler;
  }

  reportLiveModels(models: string[]): void {
    this.#liveModels = models;
    sendAkanIpc({ type: "live.models", models, pid: process.pid });
  }

  setEventHandler(handler: WsRedisEventHandler): void {
    this.#eventHandler = handler;
  }

  clearEventHandler(): void {
    this.#eventHandler = null;
  }

  async joinRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void> {
    const socketId = getSocketId(ws);
    const rooms = this.#socketRooms.get(socketId) ?? new Set<string>();
    rooms.add(room);
    this.#socketRooms.set(socketId, rooms);
    if (!this.behindGateway || !process.send) {
      sendAkanIpc({ type: "pubsub.subscribe", roomId: room, socketId, pid: process.pid });
      return;
    }
    const ack = ++this.#lastAck;
    const answered = Promise.withResolvers<void>();
    this.#acks.set(ack, answered.resolve);
    const timer = setTimeout(answered.resolve, SolidPubSub.#ackTimeoutMs);
    sendAkanIpc({ type: "pubsub.subscribe", roomId: room, socketId, pid: process.pid, ack });
    try {
      await answered.promise;
    } finally {
      clearTimeout(timer);
      this.#acks.delete(ack);
    }
  }

  async leaveRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void> {
    const socketId = getSocketId(ws);
    const rooms = this.#socketRooms.get(socketId);
    rooms?.delete(room);
    if (!rooms || rooms.size === 0) this.#socketRooms.delete(socketId);
    sendAkanIpc({ type: "pubsub.unsubscribe", roomId: room, socketId, pid: process.pid });
  }

  async leaveAllRooms(ws: Bun.ServerWebSocket<unknown>): Promise<void> {
    const socketId = getSocketId(ws);
    const rooms = this.#socketRooms.get(socketId);
    if (rooms) {
      for (const room of rooms) sendAkanIpc({ type: "pubsub.unsubscribe", roomId: room, socketId, pid: process.pid });
    }
    this.#socketRooms.delete(socketId);
  }

  async registerSocket(ws: Bun.ServerWebSocket<unknown>): Promise<void> {
    getSocketId(ws);
  }

  async unregisterSocket(ws: Bun.ServerWebSocket<unknown>): Promise<void> {
    await this.leaveAllRooms(ws);
  }
}
