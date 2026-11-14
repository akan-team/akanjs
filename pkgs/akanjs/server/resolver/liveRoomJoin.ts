import { FIELD_META } from "akanjs/base";
import type { QueryFieldMap } from "akanjs/document";
import { type LiveRegistry, LiveRoomLimit, LiveRoomLimitError, type LiveRoomRegistration } from "akanjs/service";
import type { SignalContext } from "../../signal/signalContext";

export class LiveRoomJoin {
  static join(live: LiveRegistry, held: Iterable<SignalContext>, registration: Omit<LiveRoomRegistration, "fields">) {
    const cap = LiveRoomLimit.roomsPerSocket;
    let liveRooms = 0;
    for (const context of held) if (context.endpointInfo.signalOption.live) liveRooms += 1;
    if (cap !== null && liveRooms >= cap) throw new LiveRoomLimitError("socket", cap);
    live.syncHub.join({ ...registration, fields: LiveRoomJoin.#queryFieldsOf(live, registration.refName) });
  }

  // Routing reads it only for array paths: a bare value on an array field means membership, not equality.
  static #queryFieldsOf(live: LiveRegistry, refName: string): QueryFieldMap {
    const sliceCls = live.sliceCls.get(refName);
    const doc = sliceCls?.srv.db?.doc as { [FIELD_META]?: QueryFieldMap } | undefined;
    return doc?.[FIELD_META] ?? {};
  }
}
