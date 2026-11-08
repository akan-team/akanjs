import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AkanCodeEnv } from "./AkanCodeEnv";
import { AkanCodeServices } from "./AkanCodeServices";
import { akanCodeDefaultModel, akanCodeModel } from "./akanCodeModel";
import { akanCodePaths } from "./akanCodePaths";
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

describe("AkanCodeEnv", () => {
  const inRepo = (dotenv: string | null, run: () => void) => {
    const repo = mkdtempSync(path.join(tmpdir(), "akan-code-env-"));
    const cwd = process.cwd();
    const had = process.env.AKAN_CODE_PROXY_URL;
    try {
      if (dotenv !== null) writeFileSync(path.join(repo, ".env"), dotenv);
      process.chdir(repo);
      process.env.AKAN_CODE_PROXY_URL = "https://proxy.example/{provider}";
      run();
    } finally {
      process.chdir(cwd);
      if (had === undefined) delete process.env.AKAN_CODE_PROXY_URL;
      else process.env.AKAN_CODE_PROXY_URL = had;
      rmSync(repo, { recursive: true, force: true });
    }
  };

  test("a setting the repo's own dotenv file names is ignored, and the start warning says so", () => {
    inRepo("export AKAN_CODE_PROXY_URL=placeholder\n", () => {
      expect(AkanCodeEnv.get("AKAN_CODE_PROXY_URL")).toBeUndefined();
      expect(CodeAgentProxy.fromEnv()).toBeNull();
      expect(AkanCodeEnv.ignored()).toEqual([expect.stringContaining("AKAN_CODE_PROXY_URL is set in .env")]);
    });
  });

  test("a setting from the shell is read when no dotenv file names it", () => {
    inRepo("OTHER_KEY=placeholder\n", () => {
      expect(AkanCodeEnv.get("AKAN_CODE_PROXY_URL")).toBe("https://proxy.example/{provider}");
      expect(AkanCodeEnv.ignored()).toEqual([]);
    });
  });

  test.skipIf(process.platform === "win32")(
    "the home directory is made owner-only, even one made looser before",
    () => {
      const loose = path.join(home, "loose-home");
      mkdirSync(loose, { mode: 0o755 });
      chmodSync(loose, 0o755);
      process.env.AKAN_CODE_HOME = loose;
      try {
        akanCodePaths.ensureGlobalDir();
        expect(statSync(loose).mode & 0o777).toBe(0o700);
      } finally {
        process.env.AKAN_CODE_HOME = home;
      }
    },
  );
});
