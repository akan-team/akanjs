import { AkanError } from "akanjs/base";

export interface LiveRoomLimitData {
  limit: number;
  per: "socket" | "caller" | "model";
}

export class LiveRoomLimitError extends AkanError<"liveRoomLimit", LiveRoomLimitData> {
  constructor(per: LiveRoomLimitData["per"], limit: number) {
    super("liveRoomLimit", "base.error.liveRoomLimit", { statusCode: 429, data: { limit, per } });
  }

  override get forwarded() {
    return true;
  }
}
