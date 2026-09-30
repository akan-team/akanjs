import { SelfExec } from "../selfExec";

//? A desktop app's shell starts its server as the leader of a process group of its own and ends that group after
//? the server; a shell that crashed or was killed ends nothing, so the server ends the group, and itself with it.
export class OrphanGroup {
  static exit(code: number, { leads = SelfExec.carried && process.platform !== "win32", graceMs = 1_000 } = {}) {
    if (!leads) process.exit(code);
    process.removeAllListeners("SIGTERM");
    process.on("SIGTERM", () => undefined);
    OrphanGroup.#signal("SIGTERM");
    setTimeout(() => {
      OrphanGroup.#signal("SIGKILL");
      process.exit(code);
    }, graceMs);
  }

  static #signal(signal: NodeJS.Signals) {
    try {
      process.kill(-process.pid, signal);
    } catch {
      // ESRCH: this process leads no group, so nothing it started is in one.
    }
  }
}
