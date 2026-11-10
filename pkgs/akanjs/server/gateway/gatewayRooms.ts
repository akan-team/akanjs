import type { Logger } from "akanjs/common";
import type { AkanIpcMessage } from "akanjs/service";
import type { GatewayChildren } from "./gatewayChildren";

export class GatewayRooms {
  readonly #children: GatewayChildren;
  readonly #logger: Logger;
  readonly #roomChildren = new Map<string, Set<number>>();
  readonly #childRooms = new Map<number, Map<string, Set<string>>>();
  readonly #socketRooms = new Map<string, { childIdx: number; rooms: Set<string> }>();
  readonly #childLiveModels = new Map<number, Set<string>>();

  constructor(children: GatewayChildren, logger: Logger) {
    this.#children = children;
    this.#logger = logger;
  }

  get roomCount() {
    return this.#roomChildren.size;
  }

  get socketCount() {
    return this.#socketRooms.size;
  }

  roomCountOf(childIdx: number) {
    return this.#childRooms.get(childIdx)?.size ?? 0;
  }

  deliverPubsub(originIdx: number, message: Extract<AkanIpcMessage, { type: "pubsub.publish" }>) {
    const targets = this.#roomChildren.get(message.roomId);
    if (!targets?.size) {
      const child = this.#children.get(originIdx);
      if (child) child.metrics.pubsubDropCount = (child.metrics.pubsubDropCount ?? 0) + 1;
      this.#logger.verbose(`Dropping pubsub ${message.roomId}; no subscribers`);
      return;
    }
    for (const childIdx of targets) {
      if (childIdx === originIdx) continue;
      const child = this.#children.get(childIdx);
      if (!child || this.#children.isUnavailable(child)) continue;
      if (
        !this.#children.send(child, {
          type: "pubsub.deliver",
          roomId: message.roomId,
          data: message.data,
          origin: message.origin,
        } satisfies AkanIpcMessage)
      )
        continue;
      child.metrics.pubsubDeliverCount = (child.metrics.pubsubDeliverCount ?? 0) + 1;
    }
  }

  addRoomMembership(childIdx: number, roomId: string, socketId?: string) {
    const roomChildren = this.#roomChildren.get(roomId) ?? new Set<number>();
    roomChildren.add(childIdx);
    this.#roomChildren.set(roomId, roomChildren);

    const childRooms = this.#childRooms.get(childIdx) ?? new Map<string, Set<string>>();
    const roomSockets = childRooms.get(roomId) ?? new Set<string>();
    childRooms.set(roomId, roomSockets);
    this.#childRooms.set(childIdx, childRooms);

    if (socketId) {
      roomSockets.add(socketId);
      const socketRooms = this.#socketRooms.get(socketId) ?? { childIdx, rooms: new Set<string>() };
      socketRooms.rooms.add(roomId);
      this.#socketRooms.set(socketId, socketRooms);
    }
  }

  #leaveRoom(childIdx: number, roomId: string) {
    const roomChildren = this.#roomChildren.get(roomId);
    roomChildren?.delete(childIdx);
    if (roomChildren?.size === 0) this.#roomChildren.delete(roomId);
  }

  // Unsubscribes arrive per socket, delivery is per replica: a replica leaves with its last socket in the room.
  removeRoomMembership(childIdx: number, roomId: string, socketId?: string) {
    const childRooms = this.#childRooms.get(childIdx);
    const roomSockets = childRooms?.get(roomId);
    if (socketId) {
      this.#forgetSocketRoom(socketId, roomId);
      roomSockets?.delete(socketId);
      if (roomSockets?.size) return;
    }

    for (const staleSocketId of roomSockets ?? []) this.#forgetSocketRoom(staleSocketId, roomId);
    this.#leaveRoom(childIdx, roomId);
    childRooms?.delete(roomId);
    if (childRooms?.size === 0) this.#childRooms.delete(childIdx);
  }

  #forgetSocketRoom(socketId: string, roomId: string) {
    const socketRooms = this.#socketRooms.get(socketId);
    socketRooms?.rooms.delete(roomId);
    if (!socketRooms || socketRooms.rooms.size === 0) this.#socketRooms.delete(socketId);
  }

  // Snapshots name rooms, not sockets: forgetting a kept room's sockets would drop the replica at its next unsubscribe.
  replaceRoomSnapshot(childIdx: number, rooms: string[]) {
    const held = new Set(rooms);
    for (const roomId of [...(this.#childRooms.get(childIdx)?.keys() ?? [])])
      if (!held.has(roomId)) this.removeRoomMembership(childIdx, roomId);
    for (const roomId of held) this.addRoomMembership(childIdx, roomId);
  }

  removeChildRooms(childIdx: number) {
    for (const roomId of this.#childRooms.get(childIdx)?.keys() ?? []) this.#leaveRoom(childIdx, roomId);
    this.#childRooms.delete(childIdx);
    for (const [socketId, socket] of this.#socketRooms.entries()) {
      if (socket.childIdx === childIdx) this.#socketRooms.delete(socketId);
    }
    this.setLiveModels(childIdx, []);
  }

  setLiveModels(childIdx: number, models: string[]) {
    if (models.length) this.#childLiveModels.set(childIdx, new Set(models));
    else this.#childLiveModels.delete(childIdx);
  }

  //? A batch replica holds no rooms, so it never reports a model; the writer has routed its own rooms.
  fanoutLiveChange(originIdx: number, message: Extract<AkanIpcMessage, { type: "live.change" }>) {
    for (const [childIdx, models] of this.#childLiveModels) {
      const child = this.#children.get(childIdx);
      if (child && childIdx !== originIdx && models.has(message.change.refName)) this.#children.send(child, message);
    }
  }

  requestRoomSnapshots() {
    for (const child of this.#children.values()) {
      if (this.#children.isUnavailable(child)) continue;
      this.#children.send(child, { type: "pubsub.snapshot.request" } satisfies AkanIpcMessage);
    }
  }
}
