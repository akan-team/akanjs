import { describe, expect, test } from "bun:test";
import { HostProcessProbe } from "./hostProcessProbe";

describe("HostProcessProbe parsers", () => {
  test("netstat: a listener on the port, whatever language the state column is in", () => {
    const output = [
      "",
      "활성 연결",
      "",
      "  프로토콜  로컬 주소              외부 주소              상태            PID",
      "  TCP    0.0.0.0:8282           0.0.0.0:0              수신 대기       4120",
      "  TCP    [::]:8282              [::]:0                 수신 대기       4120",
      "  TCP    0.0.0.0:18282          0.0.0.0:0              LISTENING       4121",
      "  TCP    127.0.0.1:8282         127.0.0.1:53011        ESTABLISHED     4120",
      "  TCP    127.0.0.1:53011        127.0.0.1:8282         ESTABLISHED     9000",
      "  TCP    0.0.0.0:82820          0.0.0.0:0              LISTENING       7777",
      "  TCP    127.0.0.1:8282         127.0.0.1:53012        TIME_WAIT       0",
      "  UDP    0.0.0.0:8282           *:*                                    5555",
    ].join("\r\n");

    expect(HostProcessProbe.parseNetstat(output, 8282)).toEqual([4120]);
    expect(HostProcessProbe.parseNetstat(output, 18282)).toEqual([4121]);
    expect(HostProcessProbe.parseNetstat(output, 1)).toEqual([]);
  });

  test("/proc/net/tcp: only listening sockets on the port, by inode", () => {
    const text = [
      "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode",
      "   0: 00000000:205A 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 31337 1 0000000000000000 100 0 0 10 0",
      "   1: 0100007F:205A 0100007F:CF13 01 00000000:00000000 00:00000000 00000000     0        0 31338 1 0000000000000000 20 4 30 10 -1",
      "   2: 00000000:470A 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 31339 1 0000000000000000 100 0 0 10 0",
      "",
    ].join("\n");

    expect(HostProcessProbe.parseProcNetTcp(text, 8282)).toEqual(["31337"]);
    expect(HostProcessProbe.parseProcNetTcp(text, 18186)).toEqual(["31339"]);
    expect(HostProcessProbe.parseProcNetTcp(text, 53011)).toEqual([]);
  });

  test("/proc/<pid>/stat: the parent survives a command name with spaces and parentheses", () => {
    expect(HostProcessProbe.parseProcStatPpid("412 (bun) S 77 412 77 0 -1 4194560")).toBe(77);
    expect(HostProcessProbe.parseProcStatPpid("413 (Web Content (x)) S 1 413 1 0 -1")).toBe(1);
    expect(HostProcessProbe.parseProcStatPpid("garbage")).toBeNull();
  });

  test("Win32_Process: both PowerShell date shapes, and a one-row answer that is not an array", () => {
    const table = HostProcessProbe.parseWin32Processes(
      JSON.stringify([
        {
          ProcessId: 10,
          ParentProcessId: 4,
          CommandLine: "bun.exe apps\\demo\\main.ts",
          CreationDate: "/Date(1727330000000)/",
        },
        { ProcessId: 11, ParentProcessId: 10, CommandLine: null, CreationDate: "2026-09-26T10:00:00+09:00" },
      ]),
    );
    expect(table.get(10)).toEqual({
      pid: 10,
      ppid: 4,
      command: "bun.exe apps\\demo\\main.ts",
      startedAt: 1727330000000,
    });
    expect(table.get(11)).toEqual({
      pid: 11,
      ppid: 10,
      command: null,
      startedAt: Date.parse("2026-09-26T10:00:00+09:00"),
    });

    const single = HostProcessProbe.parseWin32Processes(JSON.stringify({ ProcessId: 7, ParentProcessId: 1 }));
    expect([...single.keys()]).toEqual([7]);
    expect(HostProcessProbe.parseWin32Processes("").size).toBe(0);
    expect(HostProcessProbe.parseWin32Processes("not json").size).toBe(0);
  });

  test("a Windows parent pid names the parent only if that process is older than the child", () => {
    const at = (pid: number, ppid: number, startedAt: number | null) => ({ pid, ppid, command: null, startedAt });

    expect(HostProcessProbe.parentPidOf(at(20, 10, 2_000), at(10, 1, 1_000))).toBe(10);
    expect(HostProcessProbe.parentPidOf(at(20, 10, 2_000), at(10, 1, 3_000))).toBeNull();
    expect(HostProcessProbe.parentPidOf(at(20, 10, null), at(10, 1, 3_000))).toBe(10);
  });

  test("a tool that does not exist answers empty instead of throwing", async () => {
    expect(await HostProcessProbe.run(["akan-no-such-tool-for-sure"])).toBe("");
  });
});
