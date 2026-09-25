import type { BaseEnv, Cls } from "akanjs/base";
import { adapt } from "../adapt";
import { sendAkanIpc } from "../ipcTypes";
import type { WebsocketAdaptor, WsRedisEventHandler, WsSocketData } from "./websocket.adaptor";

const getSocketId = (ws: Bun.ServerWebSocket<unknown>, serverId: string) => {
  const data = ws.data as WsSocketData;
  if (!data.socketId) data.socketId = `${serverId}-${Bun.randomUUIDv7()}`;
  return data.socketId;
};

export class SolidPubSub
  extends adapt("solidPubsub", ({ env }) => ({
    serverId: env(
      ({ appName, environment, operationMode }: BaseEnv) =>
        `${appName}-${environment}-${operationMode}-${process.env.AKAN_REPLICA_IDX ?? "0"}-${process.pid}`,
    ),
  }))
  implements WebsocketAdaptor
{
  readonly #endpointMap = new Map<string, { returnRef: Cls; arrDepth: number }>();
  readonly #socketRooms = new Map<string, Set<string>>();
  #eventHandler: WsRedisEventHandler | null = null;
  readonly #messageHandler = (message: unknown) => {
    if (!message || typeof message !== "object") return;
    const data = message as { type?: string; roomId?: string; data?: unknown; origin?: string };
    if (data.type === "pubsub.deliver" && data.roomId && data.origin !== this.serverId) {
      this.#eventHandler?.(data.roomId, data.data);
      return;
    }
    if (data.type === "pubsub.snapshot.request") {
      sendAkanIpc({
        type: "pubsub.snapshot",
        rooms: [...new Set([...this.#socketRooms.values()].flatMap((rooms) => [...rooms]))],
        pid: process.pid,
      });
    }
  };

  override async onInit() {
    process.on("message", this.#messageHandler);
  }

  override async onDestroy() {
    process.off("message", this.#messageHandler);
    this.#eventHandler = null;
    this.#socketRooms.clear();
  }

  publish(roomId: string, data: unknown): void {
    sendAkanIpc({ type: "pubsub.publish", roomId, data: data as object | object[], origin: this.serverId });
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

  async joinRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void> {
    const socketId = getSocketId(ws, this.serverId);
    const rooms = this.#socketRooms.get(socketId) ?? new Set<string>();
    rooms.add(room);
    this.#socketRooms.set(socketId, rooms);
    sendAkanIpc({ type: "pubsub.subscribe", roomId: room, socketId, pid: process.pid });
  }

  async leaveRoom(ws: Bun.ServerWebSocket<unknown>, room: string): Promise<void> {
    const socketId = getSocketId(ws, this.serverId);
    const rooms = this.#socketRooms.get(socketId);
    rooms?.delete(room);
    if (!rooms || rooms.size === 0) this.#socketRooms.delete(socketId);
    sendAkanIpc({ type: "pubsub.unsubscribe", roomId: room, socketId, pid: process.pid });
  }

  async leaveAllRooms(ws: Bun.ServerWebSocket<unknown>): Promise<void> {
    const socketId = getSocketId(ws, this.serverId);
    const rooms = this.#socketRooms.get(socketId);
    if (rooms) {
      for (const room of rooms) sendAkanIpc({ type: "pubsub.unsubscribe", roomId: room, socketId, pid: process.pid });
    }
    this.#socketRooms.delete(socketId);
  }

  async registerSocket(ws: Bun.ServerWebSocket<unknown>): Promise<void> {
    getSocketId(ws, this.serverId);
  }

  async unregisterSocket(ws: Bun.ServerWebSocket<unknown>): Promise<void> {
    await this.leaveAllRooms(ws);
  }
}
