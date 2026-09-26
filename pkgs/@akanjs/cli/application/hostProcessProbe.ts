import { readdirSync, readFileSync, readlinkSync } from "node:fs";

export interface HostProcess {
  pid: number;
  ppid: number;
  command: string | null;
  /** Epoch ms, where the OS reports it; Windows needs it to tell a parent from a reused pid. */
  startedAt: number | null;
}

/**
 * Who listens on a port, and what a process is, read with what the OS ships: `lsof` and `ps` on macOS,
 * `/proc` on Linux (a slim image carries neither `lsof` nor `ps`), and `netstat` plus one CIM query on
 * Windows. Every lookup answers empty rather than throwing, so a missing tool reads as "nobody there".
 */
export class HostProcessProbe {
  static readonly timeoutMs = 3_000;
  //? PowerShell alone takes seconds to start on a small VM, and the CIM query runs behind it.
  static readonly win32TimeoutMs = 20_000;
  //? `0A` is TCP_LISTEN in the kernel's socket state enum (include/net/tcp_states.h).
  static readonly #procTcpListen = "0A";
  static readonly #win32ProcessQuery =
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,CreationDate | ConvertTo-Json -Compress";

  readonly platform: NodeJS.Platform;
  #win32Table: Map<number, HostProcess> | null = null;

  constructor(platform: NodeJS.Platform = process.platform) {
    this.platform = platform;
  }

  async listenersOn(port: number): Promise<number[]> {
    if (this.platform === "win32")
      return HostProcessProbe.parseNetstat(await HostProcessProbe.run(["netstat", "-ano"]), port);
    if (this.platform === "linux") return HostProcessProbe.#procListenersOn(port);
    const output = await HostProcessProbe.run(["lsof", "-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
    return [
      ...new Set(
        output
          .split("\n")
          .map((line) => Number(line.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0),
      ),
    ];
  }

  async parentOf(pid: number): Promise<number | null> {
    if (this.platform === "win32") {
      const child = await this.#win32Process(pid);
      const parent = child ? await this.#win32Process(child.ppid) : null;
      return child && parent ? HostProcessProbe.parentPidOf(child, parent) : null;
    }
    if (this.platform === "linux") {
      const stat = HostProcessProbe.#readProc(pid, "stat");
      return stat === null ? null : HostProcessProbe.parseProcStatPpid(stat);
    }
    const parsed = Number((await HostProcessProbe.run(["ps", "-p", String(pid), "-o", "ppid="])).trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  async commandOf(pid: number): Promise<string | null> {
    if (this.platform === "win32") return (await this.#win32Process(pid))?.command ?? null;
    if (this.platform === "linux") {
      const cmdline = HostProcessProbe.#readProc(pid, "cmdline");
      return cmdline?.split("\0").filter(Boolean).join(" ") || null;
    }
    return (await HostProcessProbe.run(["ps", "-ww", "-p", String(pid), "-o", "command="])).trim() || null;
  }

  //? Windows never reparents, so a dead parent's pid can already belong to a process started after the child.
  static parentPidOf(child: HostProcess, parent: HostProcess): number | null {
    if (child.ppid !== parent.pid) return null;
    if (parent.startedAt !== null && child.startedAt !== null && parent.startedAt > child.startedAt) return null;
    return parent.pid;
  }

  static parseNetstat(output: string, port: number): number[] {
    const pids = new Set<number>();
    for (const line of output.split(/\r?\n/)) {
      const fields = line.trim().split(/\s+/);
      if (fields[0] !== "TCP" || fields.length < 5) continue;
      const [, local, remote] = fields;
      //? The state column is localized ("ABHÖREN", "수신 대기"), so a listener is told apart by its zero remote port.
      if (!local?.endsWith(`:${port}`) || !remote?.endsWith(":0")) continue;
      const pid = Number(fields.at(-1));
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
    return [...pids];
  }

  static parseProcNetTcp(text: string, port: number): string[] {
    const inodes: string[] = [];
    for (const line of text.split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/);
      const [, local, , state, , , , , , inode] = fields;
      if (!local || !inode || state !== HostProcessProbe.#procTcpListen || inode === "0") continue;
      if (Number.parseInt(local.slice(local.lastIndexOf(":") + 1), 16) === port) inodes.push(inode);
    }
    return inodes;
  }

  static parseProcStatPpid(stat: string): number | null {
    //? `comm` is parenthesized and may itself hold spaces or parentheses, so fields are counted from the last `)`.
    const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    return Number.isInteger(ppid) && ppid > 0 ? ppid : null;
  }

  static parseWin32Processes(json: string): Map<number, HostProcess> {
    const table = new Map<number, HostProcess>();
    let parsed: unknown;
    try {
      parsed = JSON.parse(json.trim() || "[]");
    } catch {
      return table;
    }
    //? `ConvertTo-Json` unwraps a one-element array into a bare object.
    const rows = (Array.isArray(parsed) ? parsed : [parsed]) as ({
      ProcessId?: number;
      ParentProcessId?: number;
      CommandLine?: string | null;
      CreationDate?: string | null;
    } | null)[];
    for (const row of rows) {
      if (typeof row?.ProcessId !== "number") continue;
      table.set(row.ProcessId, {
        pid: row.ProcessId,
        ppid: row.ParentProcessId ?? 0,
        command: row.CommandLine?.trim() || null,
        startedAt: HostProcessProbe.#parseCimDate(row.CreationDate),
      });
    }
    return table;
  }

  /** Bounded, and empty when the tool is missing: `Bun.spawn` throws synchronously for an unknown executable. */
  static async run(command: string[], timeoutMs = HostProcessProbe.timeoutMs): Promise<string> {
    let proc: Bun.Subprocess<"ignore", "pipe", "ignore">;
    try {
      proc = Bun.spawn(command, { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    } catch {
      return "";
    }
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    try {
      return await new Response(proc.stdout).text();
    } catch {
      return "";
    } finally {
      clearTimeout(timer);
    }
  }

  async #win32Process(pid: number): Promise<HostProcess | null> {
    this.#win32Table ??= await HostProcessProbe.#queryWin32Processes();
    if (!this.#win32Table.has(pid)) this.#win32Table = await HostProcessProbe.#queryWin32Processes();
    return this.#win32Table.get(pid) ?? null;
  }

  static async #queryWin32Processes() {
    const output = await HostProcessProbe.run(
      ["powershell", "-NoProfile", "-NonInteractive", "-Command", HostProcessProbe.#win32ProcessQuery],
      HostProcessProbe.win32TimeoutMs,
    );
    return HostProcessProbe.parseWin32Processes(output);
  }

  //? PowerShell 5.1 serializes a CIM datetime as `/Date(<ms>)/`, PowerShell 7 as ISO 8601.
  static #parseCimDate(value: string | null | undefined): number | null {
    if (!value) return null;
    const legacy = /\/Date\((\d+)/.exec(value)?.[1];
    const ms = legacy ? Number(legacy) : Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }

  static #procListenersOn(port: number): number[] {
    const inodes = new Set(
      ["tcp", "tcp6"].flatMap((table) =>
        HostProcessProbe.parseProcNetTcp(HostProcessProbe.#readProc("net", table) ?? "", port),
      ),
    );
    if (!inodes.size) return [];
    const pids: number[] = [];
    for (const entry of HostProcessProbe.#listDir("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      const holds = HostProcessProbe.#listDir(`/proc/${entry}/fd`).some((fd) => {
        const inode = /^socket:\[(\d+)\]$/.exec(HostProcessProbe.#readLink(`/proc/${entry}/fd/${fd}`))?.[1];
        return !!inode && inodes.has(inode);
      });
      if (holds) pids.push(Number(entry));
    }
    return pids;
  }

  static #readProc(pid: number | "net", file: string): string | null {
    try {
      return readFileSync(`/proc/${pid}/${file}`, "utf8");
    } catch {
      return null;
    }
  }

  static #listDir(dir: string): string[] {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  }

  static #readLink(link: string): string {
    try {
      return readlinkSync(link);
    } catch {
      return "";
    }
  }
}
