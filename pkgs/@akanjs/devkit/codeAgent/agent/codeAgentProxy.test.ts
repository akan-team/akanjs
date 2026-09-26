import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AkanCodeServices } from "./AkanCodeServices";
import { akanCodeDefaultModel, akanCodeModel } from "./akanCodeModel";
import { CodeAgentProxy } from "./CodeAgentProxy";

const seen: { path: string; auth: string | null }[] = [];
let proxy: ReturnType<typeof Bun.serve>;
let home = "";
let realHome: string | undefined;
let realKey: string | undefined;

const chunk = (delta: object, finish: string | null = null) =>
  `data: ${JSON.stringify({
    id: "c1",
    object: "chat.completion.chunk",
    created: 0,
    model: akanCodeDefaultModel.id,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;

beforeAll(() => {
  home = mkdtempSync(path.join(tmpdir(), "akan-code-proxy-test-"));
  realHome = process.env.AKAN_CODE_HOME;
  realKey = process.env.DEEPSEEK_API_KEY;
  process.env.AKAN_CODE_HOME = home;
  process.env.DEEPSEEK_API_KEY = "real-provider-key-must-not-leave";
  proxy = Bun.serve({
    port: 0,
    fetch: (req) => {
      seen.push({ path: new URL(req.url).pathname, auth: req.headers.get("authorization") });
      const body = `${chunk({ role: "assistant", content: "pong" })}${chunk({}, "stop")}data: [DONE]\n\n`;
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    },
  });
});

afterAll(() => {
  proxy.stop(true);
  rmSync(home, { recursive: true, force: true });
  if (realHome === undefined) delete process.env.AKAN_CODE_HOME;
  else process.env.AKAN_CODE_HOME = realHome;
  if (realKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = realKey;
});

describe("CodeAgentProxy", () => {
  test("sends every request to the proxy with the token read from its file at that moment", async () => {
    const tokenFile = path.join(home, "token");
    writeFileSync(tokenFile, "session-token-1\n");
    const codeProxy = new CodeAgentProxy({
      baseUrl: `http://127.0.0.1:${proxy.port}/llm/{provider}/v1`,
      providers: [akanCodeDefaultModel.provider],
      tokenFile,
    });
    const runtime = await AkanCodeServices.runtime(home, codeProxy);
    const model = await akanCodeModel(runtime);
    expect(model?.provider).toBe("deepseek");
    const context = { messages: [{ role: "user" as const, content: "ping", timestamp: Date.now() }] };
    if (!model) throw new Error("no model");
    const first = await runtime.completeSimple(model, context);
    writeFileSync(tokenFile, "session-token-2\n");
    await runtime.completeSimple(model, context);
    expect(first.content).toEqual([expect.objectContaining({ type: "text", text: "pong" })]);
    expect(seen.map((request) => request.auth)).toEqual(["Bearer session-token-1", "Bearer session-token-2"]);
    expect(seen.every((request) => request.path.startsWith("/llm/deepseek/v1/"))).toBe(true);
  });

  test("refuses to start with a proxy URL and no token source", () => {
    expect(() => new CodeAgentProxy({ baseUrl: "https://proxy", providers: ["deepseek"] })).toThrow("TOKEN");
  });
});
