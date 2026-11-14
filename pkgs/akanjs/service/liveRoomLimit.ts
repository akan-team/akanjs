import { Logger } from "akanjs/common";

export interface LiveRoomLimitSetting {
  /** Live rooms one websocket may hold at once, past which a subscribe is refused; `false` lifts it. */
  roomsPerSocket?: number | false;
  /** Live rooms on one model in this server, across every socket, past which a new one is refused; `false` lifts it. */
  roomsPerModel?: number | false;
}

type Env = Record<string, string | undefined>;

export class LiveRoomLimit {
  //? One page holds one room per live slice it shows, so a socket nears this only by subscribing in a loop.
  static readonly defaultRoomsPerSocket = 256;
  //? Rooms no equality index files are evaluated on every write to their model: 50,000 cost about 25 ms per write.
  static readonly defaultRoomsPerModel = 50_000;
  static readonly #logger = new Logger("LiveRoomLimit");
  static readonly #envNames = {
    roomsPerSocket: "AKAN_LIVE_ROOMS_PER_SOCKET",
    roomsPerModel: "AKAN_LIVE_ROOMS_PER_MODEL",
  } as const;
  static #setting: LiveRoomLimitSetting = {};

  static configure(setting: LiveRoomLimitSetting) {
    LiveRoomLimit.#setting = { ...LiveRoomLimit.#setting, ...setting };
  }

  /** A positive count, or `off`/`0` to lift the limit; it wins over the code, so a deployment can raise it alone. */
  static applyEnv(env: Env = process.env) {
    for (const [field, name] of Object.entries(LiveRoomLimit.#envNames) as [keyof LiveRoomLimitSetting, string][]) {
      const raw = env[name]?.trim().toLowerCase();
      if (!raw) continue;
      if (raw === "off" || raw === "false" || raw === "0") LiveRoomLimit.#setting[field] = false;
      else if (/^\d+$/.test(raw)) LiveRoomLimit.#setting[field] = Number(raw);
      else LiveRoomLimit.#logger.warn(`${name}="${raw}" is not a positive count or "off"; it is ignored.`);
    }
  }

  static reset() {
    LiveRoomLimit.#setting = {};
  }

  static get roomsPerSocket(): number | null {
    return LiveRoomLimit.#resolve(LiveRoomLimit.#setting.roomsPerSocket, LiveRoomLimit.defaultRoomsPerSocket);
  }

  static get roomsPerModel(): number | null {
    return LiveRoomLimit.#resolve(LiveRoomLimit.#setting.roomsPerModel, LiveRoomLimit.defaultRoomsPerModel);
  }

  static #resolve(value: number | false | undefined, fallback: number): number | null {
    if (value === false) return null;
    const count = Math.floor(Number(value ?? fallback));
    return count >= 1 ? count : fallback;
  }
}
