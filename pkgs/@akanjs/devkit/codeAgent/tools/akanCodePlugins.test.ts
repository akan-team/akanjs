import { describe, expect, spyOn, test } from "bun:test";
import path from "node:path";
import { codeAgentPresets } from "akanjs/common";
import { makeCliTempWorkspace, tempRoots, writeText } from "../../testHelpers";
import { CodeAgent, type CodeAgentOptions } from "../agent/CodeAgent";
import { SubagentPool } from "../agent/SubagentPool";
import { DevLogFeedback } from "../feedback/DevLogFeedback";
import { PreviewView } from "../feedback/PreviewView";
import { TurnFeedback, type TurnFeedbackSource } from "../feedback/TurnFeedback";
import { AkanCodePlugins } from "./AkanCodePlugins";
import { AkanEditScope } from "./AkanEditScope";
import { AkanEnvKeys } from "./AkanEnvKeys";
import { AkanVerifier } from "./AkanVerifier";
import { McpClient } from "./McpClient";
import { McpToolPack } from "./McpToolPack";
import { SessionToolPack } from "./SessionToolPack";
import { WebToolPack } from "./WebToolPack";

const track = tempRoots();
const tempRoot = async () => track(await makeCliTempWorkspace()).root;

type ToolExecute = (
  id: string,
  params: never,
  signal?: AbortSignal,
) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const toolsOf = (extension: unknown) => {
  const tools = new Map<string, ToolExecute>();
  (extension as { factory: (pi: unknown) => void }).factory({
    registerTool: (tool: { name: string; execute: ToolExecute }) => tools.set(tool.name, tool.execute),
  });
  return tools;
};

const source = (key: string, findings: (string | undefined)[]): TurnFeedbackSource => {
  let call = 0;
  return {
    key,
    begin: () => {},
    observe: () => {
      const finding = findings[Math.min(call, findings.length - 1)];
      call += 1;
      return finding;
    },
  };
};

describe("TurnFeedback", () => {
  test("reports a finding as one message the agent can act on", async () => {
    const feedback = new TurnFeedback([source("a", ["dev server died"])], { budget: 2 });
    const message = await feedback.collect();
    expect(message).toContain("dev server died");
    expect(message).toContain("Fix them, then stop.");
  });

  test("says nothing when every source is quiet", async () => {
    const feedback = new TurnFeedback([source("a", [undefined])], { budget: 2 });
    expect(await feedback.collect()).toBeUndefined();
  });

  test("stops after the budget so one unfixable error cannot loop forever", async () => {
    const notices: string[] = [];
    const feedback = new TurnFeedback([source("a", ["still broken"])], { budget: 2, onNotice: (m) => notices.push(m) });
    expect(await feedback.collect()).toContain("still broken");
    expect(await feedback.collect()).toContain("still broken");
    expect(await feedback.collect()).toBeUndefined();
    expect(notices[0]).toContain("a reopened the turn");
    expect(notices.at(-1)).toContain("still failing after 2 attempts");
  });

  test("a source that goes quiet gets its budget back", async () => {
    const feedback = new TurnFeedback([source("a", ["broken", undefined, "broken again"])], { budget: 1 });
    expect(await feedback.collect()).toContain("broken");
    expect(await feedback.collect()).toBeUndefined();
    expect(await feedback.collect()).toContain("broken again");
  });

  test("budgets are per source, so one stuck source does not silence another", async () => {
    const feedback = new TurnFeedback([source("a", ["stuck"]), source("b", [undefined, "new"])], { budget: 1 });
    expect(await feedback.collect()).toContain("stuck");
    expect(await feedback.collect()).toContain("new");
  });

  test("a source that throws is skipped rather than taking the turn down", async () => {
    const angry: TurnFeedbackSource = {
      key: "angry",
      begin: () => {},
      observe: () => {
        throw new Error("no dev server");
      },
    };
    const feedback = new TurnFeedback([angry, source("b", ["real finding"])], { budget: 2 });
    expect(await feedback.collect()).toContain("real finding");
  });

  test("attaches images only when a source supplies them", async () => {
    const withImage: TurnFeedbackSource = {
      key: "preview",
      begin: () => {},
      observe: () => ({ text: "page is blank", images: [{ data: "AAA", mimeType: "image/png" }] }),
    };
    const message = await new TurnFeedback([withImage], { budget: 2 }).collect();
    expect(Array.isArray(message)).toBe(true);
    expect(message).toEqual([
      { type: "text", text: expect.stringContaining("page is blank") },
      { type: "image", data: "AAA", mimeType: "image/png" },
    ]);
  });
});

describe("AkanVerifier.summarize", () => {
  const scope = { paths: ["apps/a/x.ts"], apps: ["a"], libs: [], needsSync: false, touchesTsx: false };

  test("names the failing step and keeps only its tail", () => {
    const output = [...Array(100).keys()].map((n) => `line ${n}`).join("\n");
    const text = AkanVerifier.summarize(
      {
        ok: false,
        scope,
        steps: [
          { command: "akan lint a", ok: true, exitCode: 0, output: "" },
          { command: "akan typecheck a", ok: false, exitCode: 1, output },
        ],
      },
      { tailLines: 5 },
    );
    expect(text).toContain("Verification failed: akan typecheck a");
    expect(text).toContain("Passed: akan lint a");
    expect(text).toContain("line 99");
    expect(text).not.toContain("line 10\n");
  });

  test("says so plainly when everything passed", () => {
    const text = AkanVerifier.summarize({
      ok: true,
      scope,
      steps: [{ command: "akan lint a", ok: true, exitCode: 0, output: "" }],
    });
    expect(text).toContain("Verification passed");
  });

  test("an untouched workspace is not a failure", () => {
    expect(AkanVerifier.summarize({ ok: true, scope, steps: [] })).toContain("nothing to verify");
  });
});

describe("AkanEditScope", () => {
  test("derives apps, libs, sync need and tsx from a git status diff", async () => {
    const root = await tempRoot();
    await Bun.spawn(["git", "init", "-q"], { cwd: root, stdout: "ignore", stderr: "ignore" }).exited;
    const baseline = await AkanEditScope.baseline(root);
    await writeText(path.join(root, "apps", "demo", "lib", "post", "post.service.ts"), "export {};\n");
    await writeText(path.join(root, "libs", "shared", "ui", "Card.tsx"), "export const Card = () => null;\n");
    const scope = await AkanEditScope.since(root, baseline);
    expect(scope.apps).toEqual(["demo"]);
    expect(scope.libs).toEqual(["shared"]);
    expect(scope.needsSync).toBe(true);
    expect(scope.touchesTsx).toBe(true);
  });

  test("an unchanged tree implicates no target", async () => {
    const root = await tempRoot();
    await Bun.spawn(["git", "init", "-q"], { cwd: root, stdout: "ignore", stderr: "ignore" }).exited;
    const baseline = await AkanEditScope.baseline(root);
    const scope = await AkanEditScope.since(root, baseline);
    expect(scope).toEqual({ paths: [], apps: [], libs: [], needsSync: false, touchesTsx: false });
  });
});

describe("DevLogFeedback", () => {
  const logPath = (root: string, app: string) => path.join(root, "local", "apps", app, "runtime", "dev.log");

  const armed = async (root: string, feedback: DevLogFeedback) => {
    Bun.spawnSync(["git", "init", "-q"], { cwd: root });
    await feedback.begin();
    await writeText(path.join(root, "apps", "demo", "touched.ts"), "export const a = 1;\n");
  };

  test("reports only the errors written after the watermark", async () => {
    const root = await tempRoot();
    await writeText(logPath(root, "demo"), "[demo] boot ok\n");
    const feedback = new DevLogFeedback({ workspaceRoot: root, cwd: root, apps: ["demo"], graceMs: 0 });
    await armed(root, feedback);
    await writeText(logPath(root, "demo"), "[demo] boot ok\n[AkanApp]   ERROR  Port 8282 is already in use\n");
    const finding = await feedback.observe();
    expect(finding).toContain("Port 8282 is already in use");
    expect(finding).not.toContain("boot ok");
  });

  test("stays quiet when the new lines are only debug noise", async () => {
    const root = await tempRoot();
    await writeText(logPath(root, "demo"), "start\n");
    const feedback = new DevLogFeedback({ workspaceRoot: root, cwd: root, apps: ["demo"], graceMs: 0 });
    await armed(root, feedback);
    await writeText(logPath(root, "demo"), "start\n[McpRouter]   DEBUG  MCP catalogue: tools=3\n");
    expect(await feedback.observe()).toBeUndefined();
  });

  test("no dev server means nothing to say, not an error", async () => {
    const root = await tempRoot();
    const feedback = new DevLogFeedback({ workspaceRoot: root, cwd: root, apps: ["demo"], graceMs: 0 });
    await armed(root, feedback);
    expect(await feedback.observe()).toBeUndefined();
  });

  test("a turn that changed nothing is not told about a dev server somebody else is driving", async () => {
    const root = await tempRoot();
    Bun.spawnSync(["git", "init", "-q"], { cwd: root });
    await writeText(logPath(root, "demo"), "[demo] boot ok\n");
    const feedback = new DevLogFeedback({ workspaceRoot: root, cwd: root, apps: ["demo"], graceMs: 0 });
    await feedback.begin();
    await writeText(logPath(root, "demo"), "[demo] boot ok\n[AkanApp]   ERROR  Port 8282 is already in use\n");
    expect(await feedback.observe()).toBeUndefined();
  });

  test("reads the dev server's allocated URL back out of its own log", async () => {
    const root = await tempRoot();
    await writeText(
      logPath(root, "demo"),
      "[demo] demo ready (pid=1) — http://localhost:3000\n[demo] demo ready (pid=2) — http://localhost:8282\n",
    );
    expect(await DevLogFeedback.previewUrl(root, "demo")).toBe("http://localhost:8282");
    expect(await DevLogFeedback.previewUrl(root, "absent")).toBeUndefined();
  });
});

describe("AkanEnvKeys", () => {
  test("maps <PROVIDER>_API_KEY onto the engine's provider id without persisting it", async () => {
    const root = await tempRoot();
    await writeText(path.join(root, ".env"), '# comment\nDEEPSEEK_API_KEY="sk-test"\nSOMETHING_ELSE=1\n');
    const applied: [string, string][] = [];
    const fake = {
      setRuntimeApiKey: (provider: string, key: string) => {
        applied.push([provider, key]);
        return Promise.resolve();
      },
    };
    const providers = await AkanEnvKeys.apply(fake as never, root);
    expect(providers).toContain("deepseek");
    expect(applied).toContainEqual(["deepseek", "sk-test"]);
  });
});

describe("PreviewView", () => {
  test("reports whether this Bun build can drive a headless page at all", () => {
    expect(typeof PreviewView.available).toBe("boolean");
  });

  test.skipIf(!PreviewView.available)(
    "finds an empty body and a console error on a real page",
    async () => {
      const server = Bun.serve({
        port: 0,
        fetch: () =>
          new Response('<!doctype html><html><body></body><script>console.error("boom")</script></html>', {
            headers: { "content-type": "text/html" },
          }),
      });
      try {
        const probe = await PreviewView.probe(`http://localhost:${server.port}/`);
        expect(probe.pageErrors.join(" ")).toContain("rendered empty");
        expect(probe.consoleErrors.join(" ")).toContain("boom");
      } finally {
        server.stop(true);
      }
    },
    30_000,
  );
});

describe("SubagentPool", () => {
  const workspace = { workspaceRoot: "/tmp/akan" } as never;

  test("is absent when the profile disables sub-agents", () => {
    const profile = codeAgentPresets.local("/tmp/akan");
    const off = { ...profile, tools: { ...profile.tools, subagent: false as const } };
    expect(SubagentPool.extensionFor({ workspace, cwd: "/tmp/akan", parent: off, depth: 0 })).toBeUndefined();
  });

  test("is absent once the depth limit is reached, so a task cannot recurse forever", () => {
    const parent = codeAgentPresets.local("/tmp/akan");
    expect(SubagentPool.extensionFor({ workspace, cwd: "/tmp/akan", parent, depth: 0 })).toBeDefined();
    expect(SubagentPool.extensionFor({ workspace, cwd: "/tmp/akan", parent, depth: 2 })).toBeUndefined();
  });

  test("review allows one level only", () => {
    const parent = codeAgentPresets.review("/tmp/akan");
    expect(SubagentPool.extensionFor({ workspace, cwd: "/tmp/akan", parent, depth: 0 })).toBeDefined();
    expect(SubagentPool.extensionFor({ workspace, cwd: "/tmp/akan", parent, depth: 1 })).toBeUndefined();
  });

  test("an explore child cannot write or run anything, whatever its parent could", () => {
    const child = SubagentPool.childOf(codeAgentPresets.local("/tmp/akan"), "explore");
    expect(child.tools.builtin).toEqual(["read", "ls", "grep", "find"]);
  });

  test("a code child keeps the parent's tools, and never more than them", () => {
    const full = SubagentPool.childOf(codeAgentPresets.local("/tmp/akan"), "code");
    expect(full.tools.builtin).toContain("write");
    const reader = SubagentPool.childOf(codeAgentPresets.review("/tmp/akan"), "code");
    expect(reader.tools.builtin).not.toContain("write");
    expect(reader.tools.builtin).not.toContain("bash");
  });

  test("a refusal reports no running sub-agent", async () => {
    const parent = codeAgentPresets.local("/tmp/akan");
    const spent = { ...parent, tools: { ...parent.tools, subagent: { maxConcurrent: 0, maxDepth: 2, budget: 0 } } };
    const frames: unknown[][] = [];
    const extension = SubagentPool.extensionFor({
      workspace,
      cwd: "/tmp/akan",
      parent: spent,
      depth: 0,
      onAgents: (agents) => frames.push(agents),
    });
    const tools: { execute: (id: string, params: never) => Promise<{ isError?: boolean }> }[] = [];
    if (extension && "factory" in extension)
      extension.factory({ registerTool: (spec: never) => tools.push(spec) } as never);
    const result = await tools[0]?.execute("c0", { description: "d", prompt: "p" } as never);
    expect(result?.isError).toBe(true);
    expect(frames).toEqual([]);
  });

  const budgeted = (budget: number, maxConcurrent = 3) => {
    const parent = codeAgentPresets.local("/tmp/akan");
    return {
      ...parent,
      tools: { ...parent.tools, mcp: "off" as const, subagent: { maxConcurrent, maxDepth: 2, budget } },
    };
  };
  const openFakeAgents = (tokens: number[]) => {
    const opened: CodeAgentOptions[] = [];
    const spy = spyOn(CodeAgent, "create").mockImplementation(async (options) => {
      opened.push(options);
      const tokensUsed = tokens[opened.length - 1] ?? 0;
      return {
        on: () => {},
        prompt: async () => {},
        waitForIdle: async () => {},
        dispose: () => {},
        tokensUsed,
      } as never;
    });
    return { opened, spy };
  };
  const runTask = async (extension: unknown, id: string, signal?: AbortSignal) =>
    await toolsOf(extension).get("task")?.(id, { description: "d", prompt: "p" } as never, signal);
  const until = async (done: () => boolean) => {
    for (let tries = 0; tries < 500 && !done(); tries += 1) await Bun.sleep(2);
  };
  const poolOf = (child: CodeAgentOptions) =>
    SubagentPool.extensionFor({
      workspace,
      cwd: "/tmp/akan",
      parent: child.profile,
      depth: child.depth ?? 0,
      ...(child.subagentSpend ? { spend: child.subagentSpend } : {}),
    });

  test("every pool of one tree draws on one token budget", async () => {
    const { opened, spy } = openFakeAgents([150, 100]);
    try {
      const root = SubagentPool.extensionFor({ workspace, cwd: "/tmp/akan", parent: budgeted(200), depth: 0 });
      expect((await runTask(root, "c1"))?.isError).toBeUndefined();
      const [child] = opened;
      if (!child) throw new Error("no sub-agent was opened");
      const inner = SubagentPool.extensionFor({
        workspace,
        cwd: "/tmp/akan",
        parent: child.profile,
        depth: child.depth ?? 0,
        ...(child.subagentSpend ? { spend: child.subagentSpend } : {}),
      });
      expect((await runTask(inner, "c2"))?.isError).toBeUndefined();
      for (const pool of [root, inner]) {
        const refused = await runTask(pool, "c3");
        expect(refused?.isError).toBe(true);
        expect(refused?.content[0]?.text).toContain("token budget (200) is spent");
      }
      expect(opened).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  });

  test("the plugins a sub-agent builds hand its pool the tree's tally", async () => {
    const { opened, spy } = openFakeAgents([]);
    try {
      const plugins = await AkanCodePlugins.build({
        workspace,
        cwd: "/tmp/akan",
        profile: budgeted(200),
        apps: [],
        canSeeImages: false,
        depth: 1,
        currentSessionId: () => "",
        mailbox: () => undefined,
        subagentSpend: { tokens: 200, running: 0 },
      });
      const pool = plugins.extensions.find((extension) => extension.name === "akan-subagent");
      const refused = await runTask(pool, "c1");
      expect(refused?.isError).toBe(true);
      expect(opened).toHaveLength(0);
      plugins.dispose();
    } finally {
      spy.mockRestore();
    }
  });

  test("maxConcurrent counts every running sub-agent of the tree, and a full tree refuses a child's task instead of queueing it", async () => {
    const held = Promise.withResolvers<void>();
    const opened: CodeAgentOptions[] = [];
    const spy = spyOn(CodeAgent, "create").mockImplementation(async (options) => {
      opened.push(options);
      return {
        on: () => {},
        prompt: async () => await held.promise,
        waitForIdle: async () => {},
        dispose: () => {},
        tokensUsed: 0,
      } as never;
    });
    try {
      const root = SubagentPool.extensionFor({
        workspace,
        cwd: "/tmp/akan",
        parent: budgeted(1_000_000, 2),
        depth: 0,
      });
      const running = [runTask(root, "c1"), runTask(root, "c2")];
      await until(() => opened.length === 2);
      const [child] = opened;
      if (!child) throw new Error("no sub-agent was opened");
      const refused = await Promise.race([runTask(poolOf(child), "c3"), Bun.sleep(500).then(() => undefined)]);
      expect(refused?.isError).toBe(true);
      expect(refused?.content[0]?.text).toContain("limit 2 at once");
      expect(refused?.content[0]?.text).not.toContain("Wait");
      expect((await runTask(root, "c4"))?.content[0]?.text).toContain("Wait for one of yours");
      expect(opened).toHaveLength(2);
      held.resolve();
      await Promise.all(running);
      expect((await runTask(poolOf(child), "c5"))?.isError).toBeUndefined();
      expect(opened).toHaveLength(3);
    } finally {
      held.resolve();
      spy.mockRestore();
    }
  });

  test("a sub-agent that fails still spends from the tree's budget, once, and the notice says it failed", async () => {
    const opened: CodeAgentOptions[] = [];
    const spy = spyOn(CodeAgent, "create").mockImplementation(async (options) => {
      opened.push(options);
      return {
        on: () => {},
        prompt: async () => {
          throw new Error("provider went away");
        },
        waitForIdle: async () => {},
        dispose: () => {},
        tokensUsed: 150,
      } as never;
    });
    const notices: string[] = [];
    try {
      const root = SubagentPool.extensionFor({
        workspace,
        cwd: "/tmp/akan",
        parent: budgeted(100),
        depth: 0,
        onNotice: (message) => notices.push(message),
      });
      await expect(runTask(root, "c1")).rejects.toThrow("provider went away");
      expect(notices.at(-1)).toBe("explore sub-agent failed, 150 tokens (150 of 100 spent)");
      expect((await runTask(root, "c2"))?.content[0]?.text).toContain("token budget (100) is spent");
      expect(opened).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  test("a sub-agent its parent stops is counted once, and the notice says it stopped", async () => {
    const prompted = Promise.withResolvers<void>();
    const stopped = Promise.withResolvers<void>();
    const spy = spyOn(CodeAgent, "create").mockImplementation(
      async () =>
        ({
          on: () => {},
          prompt: async () => {
            prompted.resolve();
            await stopped.promise;
          },
          waitForIdle: async () => {},
          abort: async () => stopped.resolve(),
          dispose: () => {},
          tokensUsed: 120,
        }) as never,
    );
    const notices: string[] = [];
    try {
      const root = SubagentPool.extensionFor({
        workspace,
        cwd: "/tmp/akan",
        parent: budgeted(1_000),
        depth: 0,
        onNotice: (message) => notices.push(message),
      });
      const parent = new AbortController();
      const task = runTask(root, "c1", parent.signal);
      await prompted.promise;
      parent.abort();
      await task;
      expect(notices.at(-1)).toBe("explore sub-agent stopped, 120 tokens (120 of 1000 spent)");
    } finally {
      stopped.resolve();
      spy.mockRestore();
    }
  });

  test("a child keeps no session and cannot ask a human", () => {
    const child = SubagentPool.childOf(codeAgentPresets.local("/tmp/akan"), "explore");
    expect(child.session).toEqual({ store: "memory", crossSession: false });
    expect(child.ui.canPrompt).toBe(false);
    expect(child.context.projectFiles).toBe(false);
  });
});

describe("McpToolPack", () => {
  const serverSource = `
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
for await (const line of console) {
  if (!line.trim()) continue;
  const message = JSON.parse(line);
  if (message.method === "initialize") reply(message.id, { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "echo", version: "1" } });
  if (message.method === "tools/list")
    reply(message.id, { tools: [{ name: "echo", description: "Echo the text back.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } }] });
  if (message.method === "tools/call")
    reply(message.id, { content: [{ type: "text", text: "echo: " + message.params.arguments.text }] });
}
`;

  const withServer = async () => {
    const root = await tempRoot();
    const script = path.join(root, "echo-mcp.ts");
    await writeText(script, serverSource);
    await writeText(
      path.join(root, ".akan", "code", "mcp.json"),
      JSON.stringify({ mcpServers: { echo: { command: process.execPath, args: [script] } } }),
    );
    return root;
  };

  test("connects a declared stdio server, lists its tools and calls one", async () => {
    const root = await withServer();
    const pack = await McpToolPack.connect({ workspaceRoot: root, profile: codeAgentPresets.local(root) });
    expect(pack).toBeDefined();
    try {
      expect(pack?.toolNames).toEqual(["mcp__echo__echo"]);
      const client = await new McpClient({
        name: "echo",
        transport: "stdio",
        command: process.execPath,
        args: [path.join(root, "echo-mcp.ts")],
      }).connect();
      try {
        expect(await client.callTool("echo", { text: "hi" })).toEqual({ text: "echo: hi", isError: false });
      } finally {
        client.close();
      }
    } finally {
      pack?.close();
    }
  });

  test("a server that cannot start costs its own tools and nothing else", async () => {
    const root = await tempRoot();
    await writeText(
      path.join(root, ".akan", "code", "mcp.json"),
      JSON.stringify({ mcpServers: { broken: { command: "/nonexistent/binary" } } }),
    );
    const notices: string[] = [];
    const pack = await McpToolPack.connect({
      workspaceRoot: root,
      profile: codeAgentPresets.local(root),
      onNotice: (message) => notices.push(message),
    });
    expect(pack?.toolNames).toEqual([]);
    expect(notices.join(" ")).toContain("broken");
    expect(pack?.status).toEqual([
      { name: "broken", transport: "stdio", target: "/nonexistent/binary", tools: [], error: expect.any(String) },
    ]);
  });

  test("declares nothing when the profile turns MCP off", async () => {
    const root = await withServer();
    const pack = await McpToolPack.connect({ workspaceRoot: root, profile: codeAgentPresets.review(root) });
    expect(pack).toBeUndefined();
  });
});

describe("WebToolPack", () => {
  const root = "/tmp/akan-web";

  test("publishes only what the profile allows and the environment can serve", () => {
    const readOnly = codeAgentPresets.review(root);
    expect(new WebToolPack({ profile: readOnly }).names()).toEqual([]);
    expect(new WebToolPack({ profile: codeAgentPresets.local(root) }).names()).toContain("web_fetch");
  });

  test("registers web_search only when a provider key is present", () => {
    const profile = codeAgentPresets.local(root);
    const had = process.env.BRAVE_API_KEY;
    try {
      delete process.env.BRAVE_API_KEY;
      delete process.env.TAVILY_API_KEY;
      expect(new WebToolPack({ profile }).names()).not.toContain("web_search");
      process.env.BRAVE_API_KEY = "test";
      expect(new WebToolPack({ profile }).names()).toContain("web_search");
    } finally {
      if (had === undefined) delete process.env.BRAVE_API_KEY;
      else process.env.BRAVE_API_KEY = had;
    }
  });

  test("reads a page down to text and refuses a host the profile excludes", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(
          "<html><head><style>b{}</style></head><body><h1>Akan</h1><p>Hello &amp; welcome</p></body></html>",
          {
            headers: { "content-type": "text/html" },
          },
        ),
    });
    try {
      const profile = codeAgentPresets.local(root);
      const fetchTool = toolsOf(new WebToolPack({ profile }).extension()).get("web_fetch");
      const ok = await fetchTool?.("1", { url: `http://localhost:${server.port}/` } as never);
      expect(ok?.content[0]?.text).toContain("Akan");
      expect(ok?.content[0]?.text).toContain("Hello & welcome");
      expect(ok?.content[0]?.text).not.toContain("<h1>");

      const narrowed = new WebToolPack({ profile: { ...profile, network: { allowHosts: ["docs.akanjs.com"] } } });
      const refused = await toolsOf(narrowed.extension()).get("web_fetch")?.("1", {
        url: `http://localhost:${server.port}/`,
      } as never);
      expect(refused?.isError).toBe(true);
      expect(refused?.content[0]?.text).toContain("docs.akanjs.com");
    } finally {
      server.stop(true);
    }
  });
});

describe("SessionToolPack", () => {
  const options = (root: string, profile = codeAgentPresets.local(root)) => ({
    workspaceRoot: root,
    cwd: root,
    profile,
    currentSessionId: () => "current",
  });

  test("is absent when the profile forbids reaching other sessions", () => {
    const pack = new SessionToolPack(options("/tmp/akan", codeAgentPresets.review("/tmp/akan")));
    expect(pack.names()).toEqual([]);
    expect(pack.extension()).toBeUndefined();
  });

  test("publishes both readers when cross-session is on", () => {
    expect(new SessionToolPack(options("/tmp/akan")).names()).toEqual(["session_search", "session_read"]);
  });

  test("says so plainly when nothing earlier matches", async () => {
    const root = await tempRoot();
    const tools = toolsOf(new SessionToolPack(options(root)).extension());
    const result = await tools.get("session_search")?.("1", { query: "tunnel wire" } as never);
    expect(result?.content[0]?.text).toContain("No earlier session");
  });
});
