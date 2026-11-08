import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
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
  readonly closed = Promise.withResolvers<void>();
  #buffer = "";
  #socket: Awaited<ReturnType<typeof Bun.connect>> | null = null;
  static async connect(target: string | { port: number }) {
    const client = new Client();
    const socket = {
      data: (_socket: unknown, data: Buffer) => {
        client.#buffer += data.toString();
        const parts = client.#buffer.split("\n");
        client.#buffer = parts.pop() ?? "";
        for (const part of parts) if (part) client.lines.push(JSON.parse(part));
      },
      close: () => client.closed.resolve(),
    };
    client.#socket = await (typeof target === "string"
      ? Bun.connect({ unix: target, socket })
      : Bun.connect({ hostname: "127.0.0.1", port: target.port, socket }));
    return client;
  }
  raw(text: string) {
    this.#socket?.write(text);
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
    expect(CodeAgentRpcListener.parse("tcp::7000")).toEqual({ hostname: "127.0.0.1", port: 7000 });
    expect(CodeAgentRpcListener.parse("localhost:7000")).toEqual({ hostname: "localhost", port: 7000 });
    expect(() => CodeAgentRpcListener.parse("tcp:nope")).toThrow("--rpc-listen");
  });

  test("a bind other machines could reach is refused unless it is asked for", () => {
    expect(() => CodeAgentRpcListener.parse("0.0.0.0:7000")).toThrow("--rpc-bind-any");
    expect(() => CodeAgentRpcListener.parse("tcp:192.168.0.2:7000")).toThrow("--rpc-bind-any");
    expect(CodeAgentRpcListener.parse("0.0.0.0:7000", { anyHost: true })).toEqual({ hostname: "0.0.0.0", port: 7000 });
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

  describe("over tcp", () => {
    const opened = () => {
      const agent = new FakeAgent();
      const listener = new CodeAgentRpcListener(new CodeAgentRpcHost(agent as unknown as CodeAgent, null), {
        hostname: "127.0.0.1",
        port: 0,
      }).listen();
      return { agent, listener, port: listener.port ?? 0 };
    };

    test("a connection opened with the token is answered, and one without it is closed unheard", async () => {
      const { agent, listener, port } = opened();
      try {
        expect(listener.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const anonymous = await Client.connect({ port });
        anonymous.send("1", { type: "prompt", message: "hi" });
        await anonymous.closed.promise;
        expect(anonymous.lines).toEqual([{ type: "reply", id: "auth", ok: false, error: "unauthorized" }]);

        const wrong = await Client.connect({ port });
        wrong.raw(`${JSON.stringify({ auth: "not-the-token" })}\n`);
        await wrong.closed.promise;
        expect(agent.seq).toBe(1);

        const client = await Client.connect({ port });
        client.raw(
          `${JSON.stringify({ auth: listener.token })}\n${JSON.stringify({ id: "2", command: { type: "prompt", message: "hi" } })}\n`,
        );
        expect((await client.reply("auth")).ok).toBe(true);
        expect((await client.reply("2")).ok).toBe(true);
        expect(client.lines.findIndex((line) => (line as { id?: string }).id === "auth")).toBe(0);
        client.close();
      } finally {
        listener.stop();
      }
    });

    test("a connection that speaks anything but a JSON frame is dropped at its first byte", async () => {
      const { listener, port } = opened();
      try {
        const browser = await Client.connect({ port });
        browser.raw("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
        await browser.closed.promise;
        expect(browser.lines).toEqual([]);
      } finally {
        listener.stop();
      }
    });

    test("a connection that has not authenticated does not displace the client that has", async () => {
      const { listener, port } = opened();
      try {
        const client = await Client.connect({ port });
        client.raw(`${JSON.stringify({ auth: listener.token })}\n`);
        await client.reply("auth");
        const other = await Client.connect({ port });
        other.raw("{");
        await Bun.sleep(30);
        client.send("3", { type: "get_state", sinceSeq: 0 });
        expect((await client.reply("3")).ok).toBe(true);
        other.close();
        client.close();
      } finally {
        listener.stop();
      }
    });
  });

  test.skipIf(process.platform === "win32")(
    "a unix socket is its owner's alone, and needs no token, though one is accepted",
    async () => {
      const agent = new FakeAgent();
      const unix = path.join(dir, "owned.sock");
      const listener = new CodeAgentRpcListener(new CodeAgentRpcHost(agent as unknown as CodeAgent, null), { unix });
      listener.listen();
      try {
        expect(listener.token).toBeNull();
        expect(statSync(unix).mode & 0o777).toBe(0o600);
        const client = await Client.connect(unix);
        client.raw(`${JSON.stringify({ auth: "anything" })}\n`);
        expect((await client.reply("auth")).ok).toBe(true);
        client.send("4", { type: "get_state", sinceSeq: 0 });
        expect((await client.reply("4")).ok).toBe(true);
        client.close();
      } finally {
        listener.stop();
      }
    },
  );
});
