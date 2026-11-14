import { FIELD_META } from "akanjs/base";
import type { QueryFieldMap } from "akanjs/document";
import { type LiveRegistry, LiveRoomLimit, LiveRoomLimitError, type LiveRoomRegistration } from "akanjs/service";
import type { SignalContext } from "../../signal/signalContext";

export interface AdmittedLiveRoom {
  registry: LiveRegistry;
  room: Omit<LiveRoomRegistration, "fields">;
}

export class RoomAdmission {
  static admit(held: Map<string, SignalContext>, roomId: string, context: SignalContext, live?: AdmittedLiveRoom) {
    if (!held.has(roomId)) {
      const perSocket = LiveRoomLimit.roomsPerSocket;
      if (perSocket !== null && held.size >= perSocket) throw new LiveRoomLimitError("socket", perSocket);
      if (live)
        live.registry.syncHub.join({
          ...live.room,
          fields: RoomAdmission.#queryFieldsOf(live.registry, live.room.refName),
        });
    }
    held.set(roomId, context);
  }

  // Routing reads it only for array paths: a bare value on an array field means membership, not equality.
  static #queryFieldsOf(live: LiveRegistry, refName: string): QueryFieldMap {
    const sliceCls = live.sliceCls.get(refName);
    const doc = sliceCls?.srv.db?.doc as { [FIELD_META]?: QueryFieldMap } | undefined;
    return doc?.[FIELD_META] ?? {};
  }
}
