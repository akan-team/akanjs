import { FIELD_META } from "akanjs/base";
import type { QueryFieldMap } from "akanjs/document";
import { type LiveRegistry, LiveRoomLimit, LiveRoomLimitError, type LiveRoomRegistration } from "akanjs/service";
import { EndpointRateLimit } from "../../signal/endpointRateLimit";
import type { SignalContext } from "../../signal/signalContext";

export interface AdmittedLiveRoom {
  registry: LiveRegistry;
  room: Omit<LiveRoomRegistration, "fields">;
}

export class RoomAdmission {
  static readonly #roomsOfCaller = new Map<string, number>();
  //? The caller each room was counted for, so a socket whose account changed later still releases the right count.
  static readonly #callerOfRoom = new WeakMap<object, Map<string, string>>();

  static admit(
    ws: object,
    held: Map<string, SignalContext>,
    roomId: string,
    context: SignalContext,
    live?: AdmittedLiveRoom,
  ) {
    if (!held.has(roomId)) {
      const perSocket = LiveRoomLimit.roomsPerSocket;
      if (perSocket !== null && held.size >= perSocket) throw new LiveRoomLimitError("socket", perSocket);
      const caller = EndpointRateLimit.callerOf(context);
      const perCaller = LiveRoomLimit.roomsPerCaller;
      if (caller && perCaller !== null && (RoomAdmission.#roomsOfCaller.get(caller) ?? 0) >= perCaller)
        throw new LiveRoomLimitError("caller", perCaller);
      if (live)
        live.registry.syncHub.join({
          ...live.room,
          fields: RoomAdmission.#queryFieldsOf(live.registry, live.room.refName),
        });
      if (caller) RoomAdmission.#count(ws, roomId, caller);
    }
    held.set(roomId, context);
  }

  static release(ws: object, roomIds: Iterable<string>) {
    const callers = RoomAdmission.#callerOfRoom.get(ws);
    if (!callers) return;
    for (const roomId of roomIds) {
      const caller = callers.get(roomId);
      if (caller === undefined) continue;
      callers.delete(roomId);
      const left = (RoomAdmission.#roomsOfCaller.get(caller) ?? 1) - 1;
      if (left > 0) RoomAdmission.#roomsOfCaller.set(caller, left);
      else RoomAdmission.#roomsOfCaller.delete(caller);
    }
    if (!callers.size) RoomAdmission.#callerOfRoom.delete(ws);
  }

  static #count(ws: object, roomId: string, caller: string) {
    const callers = RoomAdmission.#callerOfRoom.get(ws) ?? new Map<string, string>();
    callers.set(roomId, caller);
    RoomAdmission.#callerOfRoom.set(ws, callers);
    RoomAdmission.#roomsOfCaller.set(caller, (RoomAdmission.#roomsOfCaller.get(caller) ?? 0) + 1);
  }

  // Routing reads it only for array paths: a bare value on an array field means membership, not equality.
  static #queryFieldsOf(live: LiveRegistry, refName: string): QueryFieldMap {
    const sliceCls = live.sliceCls.get(refName);
    const doc = sliceCls?.srv.db?.doc as { [FIELD_META]?: QueryFieldMap } | undefined;
    return doc?.[FIELD_META] ?? {};
  }
}
