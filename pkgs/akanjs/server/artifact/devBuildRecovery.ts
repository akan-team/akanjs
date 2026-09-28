import type { DevBuildStatus } from "./ipcTypes";

export class DevBuildRecovery {
  //? A newer generation recovers a failure. Of the same generation, only a retry that reports the failure's own number
  //? again does: a backend that came back, or the same route built again. Another route's ok says nothing about it.
  static recovers(previous: DevBuildStatus | undefined, status: DevBuildStatus): boolean {
    if (!previous || previous.ok || !status.ok) return false;
    if (status.generation !== previous.generation) return status.generation > previous.generation;
    if (status.phase === "backend") return true;
    return status.phase === "route" && status.scope !== undefined && status.scope === previous.scope;
  }
}
