import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { type CodeAgentEvent, type CodeAgentProfile, codeAgentPresets } from "akanjs/common";
import { WorkspaceExecutor } from "../../executors";
import { isolateEnv, tempDirs } from "../../testHelpers";
import { AkanCodePlugins } from "../tools/AkanCodePlugins";
import { akanCodeDefaultModel } from "./akanCodeModel";
import { akanCodePaths } from "./akanCodePaths";
import { CodeAgent, type CodeAgentOptions } from "./CodeAgent";
import { CodeAgentSuspended } from "./CodeAgentSuspended";
import { SubagentPool } from "./SubagentPool";

isolateEnv();
const makeTempRoot = tempDirs("akan-code-agent-");

const chunk = (delta: object, finish: string | null = null) =>
  `data: ${JSON.stringify({
    id: "c1",
    object: "chat.completion.chunk",
    created: 0,
    model: akanCodeDefaultModel.id,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;

const usageChunk = (promptTokens: number) =>
  `data: ${JSON.stringify({
    id: "c1",
    object: "chat.completion.chunk",
    created: 0,
    model: akanCodeDefaultModel.id,
    choices: [],
    usage: { prompt_tokens: promptTokens, completion_tokens: 1, total_tokens: promptTokens + 1 },
  })}\n\n`;

let llm: ReturnType<typeof Bun.serve>;
let llmCalls = 0;
let reportedTokens = 0;
beforeAll(() => {
  llm = Bun.serve({
    port: 0,
    fetch: () => {
      llmCalls += 1;
      const usage = reportedTokens ? usageChunk(reportedTokens) : "";
      return new Response(
        `${chunk({ role: "assistant", content: "ok" })}${chunk({}, "stop")}${usage}data: [DONE]\n\n`,
        {
          headers: { "content-type": "text/event-stream" },
        },
      );
    },
  });
});
afterAll(() => llm.stop(true));

const useProxy = (root: string) => {
  process.env.AKAN_CODE_HOME = path.join(root, "home");
  process.env.AKAN_CODE_PROXY_URL = `http://127.0.0.1:${llm.port}/llm/{provider}/v1`;
  process.env.AKAN_CODE_PROXY_TOKEN = "test-token";
};

const quietProfile = (root: string): CodeAgentProfile => {
  const web = codeAgentPresets.web(root);
  return {
    ...web,
    tools: { builtin: [], akan: false, mcp: "off", subagent: false, web: { fetch: false, search: false } },
    context: { projectFiles: false, skills: false },
  };
};

const createAgent = async (root: string, options: Partial<CodeAgentOptions> = {}) => {
  useProxy(root);
  return await CodeAgent.create({
    workspace: new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" }),
    profile: quietProfile(root),
    ...options,
  });
};

describe("CodeAgent", () => {
  test("a prompt typed instead of an answer drops the parked asks", async () => {
    const root = await makeTempRoot();
    const agent = await createAgent(root);
    try {
      await agent.ask({ prompt: "Which app?", kind: "select", options: [{ key: "a", label: "akan" }] });
      const suspendedFile = CodeAgentSuspended.fileOf(akanCodePaths.sessionsDir(root), agent.sessionId) ?? "";
      expect(existsSync(suspendedFile)).toBe(true);

      await agent.prompt("Do something else instead.");

      const events: CodeAgentEvent[] = [];
      agent.on((event) => events.push(event));
      agent.announce();
      expect(events.filter((event) => event.type === "question")).toEqual([]);
      expect(existsSync(suspendedFile)).toBe(false);
    } finally {
      agent.dispose();
    }
  });

  test("autocompact is carried from creation, announced on the session frame, and refuses a step it lacks", async () => {
    const root = await makeTempRoot();
    const agent = await createAgent(root, { autoCompactAt: 60 });
    try {
      const events: CodeAgentEvent[] = [];
      agent.on((event) => events.push(event));
      expect(agent.info.autoCompactAt).toBe(60);
      expect(() => agent.setAutoCompactAt(55)).toThrow("steps of 10");
      expect(agent.info.autoCompactAt).toBe(60);
      agent.setAutoCompactAt(100);
      expect(agent.info.autoCompactAt).toBeUndefined();
      expect(events.filter((event) => event.type === "session")).toHaveLength(1);
    } finally {
      agent.dispose();
    }
  });

  test("a chosen share reaches the engine: a reply reported past it compacts, and the default lets it pass", async () => {
    const compactions = async (options: Partial<CodeAgentOptions>) => {
      const agent = await createAgent(await makeTempRoot(), options);
      const reasons: string[] = [];
      agent.on((event) => {
        if (event.type === "compaction" && event.phase === "start") reasons.push(event.reason);
      });
      try {
        // The 20k most recent tokens are kept, so a summary needs an older turn behind the filler.
        for (const text of ["hello", "filler ".repeat(20_000)]) {
          await agent.prompt(text);
          await agent.waitForIdle();
        }
        reportedTokens = 650_000;
        await agent.prompt("next");
        await agent.waitForIdle();
      } finally {
        reportedTokens = 0;
        agent.dispose();
      }
      return reasons;
    };
    expect(await compactions({})).toEqual([]);
    expect(await compactions({ autoCompactAt: 60 })).toEqual(["threshold"]);
  });

  test("a sub-agent hands its plugins the token tally of the tree that opened it", async () => {
    const root = await makeTempRoot();
    const build = AkanCodePlugins.build;
    const seen: unknown[] = [];
    const spy = spyOn(AkanCodePlugins, "build").mockImplementation(async (options) => {
      seen.push(options.subagentSpend);
      return await build.call(AkanCodePlugins, options);
    });
    const subagentSpend = { tokens: 7, running: 0 };
    try {
      const agent = await createAgent(root, { subagentSpend, depth: 1 });
      agent.dispose();
      expect(seen).toHaveLength(1);
      expect(seen[0]).toBe(subagentSpend);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("a sub-agent its parent stops before the sub-agent's run is live", () => {
  type ToolExecute = (
    id: string,
    params: never,
    signal?: AbortSignal,
  ) => Promise<{ content: { text: string }[] } | undefined>;

  const runTask = async (root: string, parent: AbortController, notices: string[]) => {
    useProxy(root);
    const profile = quietProfile(root);
    const pool = SubagentPool.extensionFor({
      workspace: new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" }),
      cwd: root,
      parent: { ...profile, tools: { ...profile.tools, subagent: { maxDepth: 2, maxConcurrent: 3, budget: 1_000 } } },
      depth: 0,
      onNotice: (message) => notices.push(message),
    });
    let execute: ToolExecute | undefined;
    if (pool && "factory" in pool)
      pool.factory({
        registerTool: (tool: { execute: ToolExecute }) => {
          execute = tool.execute;
        },
      } as never);
    const result = await execute?.("c1", { description: "d", prompt: "p" } as never, parent.signal);
    return result?.content[0]?.text;
  };

  test("stopped while it is being created, it never reaches the model and says it stopped", async () => {
    const root = await makeTempRoot();
    const parent = new AbortController();
    const create = CodeAgent.create;
    const spy = spyOn(CodeAgent, "create").mockImplementation(async (options) => {
      const agent = await create.call(CodeAgent, options);
      parent.abort();
      return agent;
    });
    const notices: string[] = [];
    try {
      const calls = llmCalls;
      expect(await runTask(root, parent, notices)).toBe("(no answer)");
      expect(llmCalls).toBe(calls);
      expect(notices.at(-1)).toBe("explore sub-agent stopped, 0 tokens (0 of 1000 spent)");
    } finally {
      spy.mockRestore();
    }
  });

  test("stopped after it exists but before its run is live, it is stopped as soon as the run starts", async () => {
    const root = await makeTempRoot();
    const parent = new AbortController();
    const stopBeforeTheRun: InlineExtension = {
      name: "stop-before-the-run",
      factory: (pi: ExtensionAPI) => {
        pi.on("before_agent_start", () => {
          parent.abort();
        });
      },
    };
    const create = CodeAgent.create;
    const spy = spyOn(CodeAgent, "create").mockImplementation(
      async (options) => await create.call(CodeAgent, { ...options, extensions: [stopBeforeTheRun] }),
    );
    const notices: string[] = [];
    try {
      expect(await runTask(root, parent, notices)).toBe("(no answer)");
      expect(notices.at(-1)).toMatch(/^explore sub-agent stopped, /);
    } finally {
      spy.mockRestore();
    }
  });
});
