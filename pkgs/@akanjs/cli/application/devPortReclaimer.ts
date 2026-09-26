import { HostProcessProbe } from "./hostProcessProbe";

export interface PortHolder {
  /** The process that will actually be signalled: the topmost akan process above the listener. */
  pid: number;
  command: string;
  port: number;
  /** The process bound to the port, which is often a child of `pid`. */
  listenerPid: number;
  /** Whether the command line identifies it as something `akan start` owns. */
  akan: boolean;
}

export interface ReclaimReport {
  killed: PortHolder[];
  foreign: PortHolder[];
}

/**
 * Frees the ports a dev session is about to bind.
 *
 * A port is claimed by whoever got there first, which in a monorepo is usually this workspace's own
 * orphan or another checkout's dev server — neither of which the developer can name a pid for. So
 * `--kill` resolves the holder from the port rather than from an app name, which is why a *different*
 * app on the same port is reclaimed too.
 *
 * **A holder that is not recognisably an akan process is reported, never killed.** The flag is a
 * convenience for reclaiming dev servers; a database, a tunnel or an unrelated service that happens to
 * sit on 8282 is a conflict the developer has to see, and killing it silently would be the kind of
 * damage a convenience flag must not be able to do.
 *
 * **What gets signalled is the top of the dev tree, not the process on the port.** A dev server's
 * listener is a backend replica whose dev host watches it and restarts it on exit — measured: killing
 * the listener alone frees the port for about a second and then the host puts a replacement on it, so
 * the session that asked for the port fails to bind anyway.
 */
export class DevPortReclaimer {
  /** How long a signalled holder may take to release the port before it is reported as still holding. */
  static readonly releaseTimeoutMs = 8_000;
  /** Depth cap on the ancestry walk, so a pathological process table cannot loop it. */
  static readonly maxAncestorDepth = 8;
  static readonly #releasePollMs = 100;
  /** A gateway also binds `port + 10_000` for websockets, so reclaiming one without the other is useless. */
  static readonly wsPortOffset = 10_000;

  static portsFor(ports: number[]): number[] {
    return [...new Set(ports.flatMap((port) => [port, port + DevPortReclaimer.wsPortOffset]))].sort(
      (left, right) => left - right,
    );
  }

  /** `true` for a command line that belongs to an akan dev tree — the CLI, an app entry, or a worker. */
  static isAkanCommand(command: string): boolean {
    const normalized = command.replaceAll("\\", "/");
    return (
      /(^|\/)akan(\.exe)?"?(\s|$)/.test(normalized) ||
      normalized.includes("@akanjs/cli") ||
      normalized.includes("akanjs/server") ||
      /\bapps\/[^/\s]+\/main\.ts\b/.test(normalized) ||
      normalized.includes("incrementalBuilder.proc") ||
      normalized.includes("rscWorker")
    );
  }

  readonly #probe: HostProcessProbe;

  constructor(probe = new HostProcessProbe()) {
    this.#probe = probe;
  }

  async reclaim(ports: number[]): Promise<ReclaimReport> {
    const killed: PortHolder[] = [];
    const foreign: PortHolder[] = [];
    const seen = new Set<number>();
    for (const port of DevPortReclaimer.portsFor(ports)) {
      for (const holder of await this.holdersOf(port)) {
        // One process binds both the http and the websocket port; signal it once.
        if (seen.has(holder.pid)) continue;
        seen.add(holder.pid);
        if (!holder.akan) {
          foreign.push(holder);
          continue;
        }
        if (await this.#terminate(holder.pid)) killed.push(holder);
        else foreign.push(holder);
      }
    }
    return { killed, foreign };
  }

  async holdersOf(port: number): Promise<PortHolder[]> {
    const holders: PortHolder[] = [];
    for (const listenerPid of await this.#probe.listenersOn(port)) {
      // Never this process or its parent: `--kill` runs before the session boots, so the only tree on
      // these ports that includes us would be one we are about to create.
      if (listenerPid === process.pid || listenerPid === process.ppid) continue;
      const command = await this.#probe.commandOf(listenerPid);
      if (!command) continue;
      if (!DevPortReclaimer.isAkanCommand(command)) {
        holders.push({ pid: listenerPid, command, port, listenerPid, akan: false });
        continue;
      }
      const root = await this.#akanRootOf(listenerPid, command);
      holders.push({ pid: root.pid, command: root.command, port, listenerPid, akan: true });
    }
    return holders;
  }

  /** The highest ancestor still recognisable as part of the same akan dev tree. */
  async #akanRootOf(pid: number, command: string): Promise<{ pid: number; command: string }> {
    let root = { pid, command };
    for (let depth = 0; depth < DevPortReclaimer.maxAncestorDepth; depth += 1) {
      const parentPid = await this.#probe.parentOf(root.pid);
      if (parentPid === null || parentPid <= 1 || parentPid === process.pid || parentPid === process.ppid) break;
      const parentCommand = await this.#probe.commandOf(parentPid);
      if (!parentCommand || !DevPortReclaimer.isAkanCommand(parentCommand)) break;
      root = { pid: parentPid, command: parentCommand };
    }
    return root;
  }

  /**
   * SIGTERM first so a dev server runs its own shutdown — it has children of its own, and a SIGKILLed
   * gateway strands them. SIGKILL only once the grace period is gone.
   */
  async #terminate(pid: number): Promise<boolean> {
    //? Windows has no SIGTERM — `process.kill` is TerminateProcess on that one pid — so the whole tree goes at once.
    if (this.#probe.platform === "win32") {
      await HostProcessProbe.run(["taskkill", "/PID", String(pid), "/T", "/F"]);
      return await this.#released(pid);
    }
    if (!this.#signal(pid, "SIGTERM")) return !this.#alive(pid);
    if (await this.#released(pid)) return true;
    this.#signal(pid, "SIGKILL");
    await Bun.sleep(DevPortReclaimer.#releasePollMs);
    return !this.#alive(pid);
  }

  async #released(pid: number): Promise<boolean> {
    const deadline = Date.now() + DevPortReclaimer.releaseTimeoutMs;
    while (Date.now() < deadline) {
      if (!this.#alive(pid)) return true;
      await Bun.sleep(DevPortReclaimer.#releasePollMs);
    }
    return false;
  }

  #signal(pid: number, signal: "SIGTERM" | "SIGKILL"): boolean {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      // Already gone, or not ours to signal; `#alive` decides which.
      return false;
    }
  }

  #alive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "EPERM";
    }
  }
}
