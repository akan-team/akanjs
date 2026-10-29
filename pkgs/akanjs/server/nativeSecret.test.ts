import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDesktopServer } from "../../@akanjs/native/packages/desktop/src/server.ts";
import type { AkanIpcMessage } from "../service/ipcTypes";
import { NativeSecret } from "./nativeSecret";
import { SelfExec } from "./selfExec";

const home = mkdtempSync(path.join(tmpdir(), "akan-native-secret-"));
const realSend = process.send;
const realTimeout = NativeSecret.timeoutMs;
const carry = () => {
  process.env.BUN_BE_BUN = "1";
  SelfExec.adopt();
};
afterEach(() => {
  process.send = realSend;
  NativeSecret.timeoutMs = realTimeout;
  delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("akan.selfExec.beBun")];
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

/** Plays the desktop shell: answers each secret.request from `kept`, or with `refusal` when one is given. */
const shell = (kept: Map<string, string>, { refusal, silent }: { refusal?: string; silent?: boolean } = {}) => {
  const asked: string[] = [];
  process.send = ((message: AkanIpcMessage) => {
    if (message.type !== "secret.request") return true;
    asked.push(`${message.op} ${message.key}`);
    if (silent) return true;
    const answer = (): { value?: string | null; error?: string } => {
      if (refusal) return { error: refusal };
      if (message.op === "get") return { value: kept.get(message.key) ?? null };
      if (message.op === "set") kept.set(message.key, message.value ?? "");
      else kept.delete(message.key);
      return {};
    };
    const reply = { type: "secret.answer", id: message.id, ...answer() };
    queueMicrotask(() => process.emit("message" as never, reply as never));
    return true;
  }) as typeof process.send;
  return asked;
};

describe("NativeSecret", () => {
  test("keeps, reads and removes a secret through the desktop app that carries the server", async () => {
    carry();
    const kept = new Map<string, string>();
    const asked = shell(kept);
    expect(NativeSecret.available).toBe(true);
    expect(await NativeSecret.get("llm.apiKey")).toBeNull();
    await NativeSecret.set("llm.apiKey", "sk-한글 ✓");
    expect(await NativeSecret.get("llm.apiKey")).toBe("sk-한글 ✓");
    await NativeSecret.remove("llm.apiKey");
    expect(await NativeSecret.get("llm.apiKey")).toBeNull();
    expect(asked).toEqual([
      "get llm.apiKey",
      "set llm.apiKey",
      "get llm.apiKey",
      "remove llm.apiKey",
      "get llm.apiKey",
    ]);
  });

  test("rejects with the shell's refusal, and when the shell does not answer", async () => {
    carry();
    shell(new Map(), { refusal: "the Secret Service is not running" });
    await expect(NativeSecret.set("k", "v")).rejects.toThrow(
      'refused the secret "k": the Secret Service is not running',
    );

    shell(new Map(), { silent: true });
    NativeSecret.timeoutMs = 20;
    await expect(NativeSecret.get("k")).rejects.toThrow('did not answer for the secret "k"');
  });

  test("sends nothing from a server no desktop app carries, a gateway's replica included", async () => {
    const asked = shell(new Map([["k", "v"]]));
    expect(NativeSecret.available).toBe(false);
    await expect(NativeSecret.get("k")).rejects.toThrow("only by the desktop app that carries this server");
    expect(asked).toEqual([]);
  });

  test("the carried server keeps its secret in the real shell's store over its IPC channel", async () => {
    const resources = path.join(home, "Resources");
    mkdirSync(path.join(resources, "server"), { recursive: true });
    writeFileSync(path.join(resources, "server.bunfig.toml"), "");
    writeFileSync(
      path.join(resources, "server", "main.js"),
      `import { SelfExec } from ${JSON.stringify(path.join(import.meta.dir, "selfExec.ts"))};
import { NativeSecret } from ${JSON.stringify(path.join(import.meta.dir, "nativeSecret.ts"))};
SelfExec.adopt();
await NativeSecret.set("token", "s3cr3t");
console.info("read", await NativeSecret.get("token"));
await NativeSecret.set("", "x").catch((error) => console.info("refused", error.message));
process.send({ type: "ready", pid: process.pid });`,
    );
    const lines: string[] = [];
    const realInfo = console.info;
    console.info = (...args: unknown[]) => void lines.push(args.join(" "));
    const kept = new Map<string, string>();
    const server = createDesktopServer({
      resources,
      dataDir: path.join(home, "data", "server"),
      manifest: { entry: "main.js", env: {} },
      freePort: async () => 1,
      secrets: {
        get: async (key) => kept.get(key) ?? null,
        set: async (key, value) => void kept.set(key, value),
        remove: (key) => void kept.delete(key),
      },
    });
    const refused = `[server] refused The desktop app refused the secret "": a secret's key must be a non-empty string`;
    try {
      expect((await server.start()).ready).toBe(true);
      //? "ready" comes over IPC and the lines over stdout, so the last line can land after it.
      const until = Date.now() + 5_000;
      while (!lines.includes(refused) && Date.now() < until) await Bun.sleep(10);
    } finally {
      console.info = realInfo;
      await server.stop();
    }
    expect(kept.get("token")).toBe("s3cr3t");
    expect(lines).toContain("[server] read s3cr3t");
    expect(lines).toContain(refused);
  }, 20_000);
});
