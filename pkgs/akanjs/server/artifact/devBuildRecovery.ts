import type { DevBuildStatus } from "./ipcTypes";

export class DevBuildRecovery {
  //? A route's status speaks for that route alone: its own ok recovers it at the failure's generation or later, and
  //? another route's ok never does, whatever its generation. Otherwise a newer generation recovers a failure, and of
  //? the same generation only a backend that came back.
  static recovers(previous: DevBuildStatus | undefined, status: DevBuildStatus): boolean {
    if (!previous || previous.ok || !status.ok) return false;
    if (status.phase === "route" && status.scope !== undefined && previous.scope !== undefined)
      return status.scope === previous.scope && status.generation >= previous.generation;
    if (status.generation !== previous.generation) return status.generation > previous.generation;
    return status.phase === "backend";
  }
}
