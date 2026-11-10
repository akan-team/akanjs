const PS_RSS_TIMEOUT_MS = 2_000;

export class ProcessRss {
  static async bytesOf(pid: number): Promise<number | null> {
    if (process.platform === "win32")
      return await ProcessRss.#readRssKbVia(
        ["tasklist", "/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        ProcessRss.#tasklistRssKb,
      );
    if (process.platform === "darwin") {
      const footprintBytes = await ProcessRss.#readRssKbVia(
        ["footprint", "-p", String(pid), "-f", "bytes"],
        ProcessRss.#footprintKb,
      );
      if (footprintBytes !== null) return footprintBytes;
    }
    const status = await Bun.file(`/proc/${pid}/status`)
      .text()
      .catch(() => null);
    const vmRssKb = status === null ? null : /VmRSS:\s+(\d+) kB/.exec(status)?.[1];
    if (vmRssKb) return Number(vmRssKb) * 1024;
    return await ProcessRss.#readRssKbVia(["ps", "-o", "rss=", "-p", String(pid)], (output) => Number(output.trim()));
  }

  // Bounded: a `ps` that hangs under load would silently cancel the recycle awaiting it.
  static async #readRssKbVia(
    command: string[],
    parseKb: (output: string) => number,
    timeoutMs = PS_RSS_TIMEOUT_MS,
  ): Promise<number | null> {
    let proc: Bun.Subprocess<"ignore", "pipe", "ignore">;
    try {
      proc = Bun.spawn(command, { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return null;
    }
    const killer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    try {
      const output = await new Response(proc.stdout).text();
      await proc.exited;
      const rssKb = parseKb(output);
      return Number.isFinite(rssKb) && rssKb > 0 ? rssKb * 1024 : null;
    } catch {
      return null;
    } finally {
      clearTimeout(killer);
    }
  }

  // `Mem Usage` is the working set (what `process.memoryUsage.rss()` reports on Windows) in locale-grouped KB.
  static #tasklistRssKb(output: string): number {
    const memUsage = /"([^"]*)"\s*$/m.exec(output)?.[1];
    return memUsage ? Number(memUsage.replace(/\D/g, "")) : Number.NaN;
  }

  // The footprint is what `process.memoryUsage.rss()` reports on macOS; `ps` also counts pages freed for reuse.
  static #footprintKb(output: string): number {
    const bytes = /Footprint: (\d+) B\b/.exec(output)?.[1];
    return bytes ? Number(bytes) / 1024 : Number.NaN;
  }
}
