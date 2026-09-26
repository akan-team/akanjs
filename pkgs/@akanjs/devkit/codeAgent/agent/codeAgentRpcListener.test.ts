import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CodeAgentEvent } from "akanjs/common";
import type { CodeAgent } from "./CodeAgent";
import { CodeAgentRpcHost } from "./CodeAgentRpcHost";
import { CodeAgentRpcListener } from "./CodeAgentRpcListener";

const dir = mkdtempSync(path.join(tmpdir(), "akan-rpc-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

class FakeAgent {
  seq = 0;
  frames: CodeAgentEvent[] = [];
  disposed = false;
  aborted = false;
  #listener: (event: CodeAgentEvent) => void = () => {};
  on(listener: (event: CodeAgentEvent) => void) {
    this.#listener = listener;
    return () => {};
  }
  announce() {
    this.emit();
  }
  emit() {
    const event = { type: "idle", seq: ++this.seq } as CodeAgentEvent;
    this.frames.push(event);
    this.#listener(event);
  }
  async prompt() {
    this.emit();
  }
  async abort() {
    this.aborted = true;
  }
  async state({ sinceSeq }: { sinceSeq?: number } = {}) {
    return { replayFrom: 0, frames: this.frames.filter((event) => event.seq > (sinceSeq ?? Number.MAX_SAFE_INTEGER)) };
  }
  dispose() {
    this.disposed = true;
  }
}

class Client {
  lines: unknown[] = [];
  #buffer = "";
  #socket: Awaited<ReturnType<typeof Bun.connect>> | null = null;
  static async connect(unix: string) {
    const client = new Client();
    client.#socket = await Bun.connect({
      unix,
      socket: {
        data: (_socket, data) => {
          client.#buffer += data.toString();
          const parts = client.#buffer.split("\n");
          client.#buffer = parts.pop() ?? "";
          for (const part of parts) if (part) client.lines.push(JSON.parse(part));
        },
      },
    });
    return client;
  }
  send(id: string, command: object) {
    this.#socket?.write(`${JSON.stringify({ id, command })}\n`);
  }
  async reply(id: string) {
    for (let idx = 0; idx < 200; idx++) {
      const found = this.lines.find((line) => (line as { id?: string }).id === id);
      if (found) return found as { ok: boolean; data: { frames?: CodeAgentEvent[] } };
      await Bun.sleep(5);
    }
    throw new Error(`no reply ${id}`);
  }
  close() {
    this.#socket?.end();
  }
}

describe("CodeAgentRpcListener", () => {
  test("parses unix and tcp addresses, defaulting tcp to loopback", () => {
    expect(CodeAgentRpcListener.parse("unix:/tmp/a.sock")).toEqual({ unix: "/tmp/a.sock" });
    expect(CodeAgentRpcListener.parse("tcp:7000")).toEqual({ hostname: "127.0.0.1", port: 7000 });
    expect(CodeAgentRpcListener.parse("0.0.0.0:7000")).toEqual({ hostname: "0.0.0.0", port: 7000 });
    expect(() => CodeAgentRpcListener.parse("tcp:nope")).toThrow("--rpc-listen");
  });

  test("the agent outlives a dropped client, and the next one catches up by seq", async () => {
    const agent = new FakeAgent();
    const unix = path.join(dir, "agent.sock");
    const listener = new CodeAgentRpcListener(new CodeAgentRpcHost(agent as unknown as CodeAgent, null), { unix });
    listener.listen();
    const served = listener.serve();

    const first = await Client.connect(unix);
    first.send("1", { type: "prompt", message: "hi" });
    expect((await first.reply("1")).ok).toBe(true);
    first.close();
    await Bun.sleep(20);
    agent.emit();
    expect(agent.aborted).toBe(false);

    const second = await Client.connect(unix);
    second.send("2", { type: "get_state", sinceSeq: 2 });
    const state = await second.reply("2");
    expect(state.data.frames?.map((frame) => frame.seq)).toEqual([3]);

    second.send("3", { type: "shutdown" });
    await second.reply("3");
    await served;
    expect(agent.disposed).toBe(true);
  });
});
