import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { WorkspaceTrust } from "@akanjs/devkit/codeAgent/agent/WorkspaceTrust";
import type { Workspace } from "@akanjs/devkit/commandDecorators";
import { codeAgentPresets } from "akanjs/common";
import { CodeTrustPrompt } from "./CodeTrustPrompt";
import { CodeRunner, type CodeRunOptions } from "./code.runner";

let codeHome: string;
let realCodeHome: string | undefined;

beforeAll(() => {
  realCodeHome = process.env.AKAN_CODE_HOME;
  codeHome = mkdtempSync(path.join(tmpdir(), "akan-code-runner-"));
  process.env.AKAN_CODE_HOME = codeHome;
});

afterAll(() => {
  if (realCodeHome === undefined) delete process.env.AKAN_CODE_HOME;
  else process.env.AKAN_CODE_HOME = realCodeHome;
  rmSync(codeHome, { recursive: true, force: true });
});

afterEach(() => {
  delete process.env.AKAN_CODE_CAN_PROMPT;
});

const runOptions = (patch: Partial<CodeRunOptions> = {}): CodeRunOptions => ({
  workspace: { workspaceRoot: "/w" } as unknown as Workspace,
  profile: "local",
  json: false,
  thinking: false,
  ...patch,
});

describe("CodeRunner.canPrompt", () => {
  test("a pod prompts only when a host is on the wire, and the env overrides either way", () => {
    const pod = codeAgentPresets.pod("/w");
    expect(CodeRunner.canPrompt(pod, false)).toBe(false);
    expect(CodeRunner.canPrompt(pod, true)).toBe(true);
    process.env.AKAN_CODE_CAN_PROMPT = "0";
    expect(CodeRunner.canPrompt(pod, true)).toBe(false);
    process.env.AKAN_CODE_CAN_PROMPT = "1";
    expect(CodeRunner.canPrompt(pod, false)).toBe(true);
  });

  test("a one-shot run has nobody to answer, so it never prompts unless the env says to", () => {
    const local = codeAgentPresets.local("/w");
    expect(CodeRunner.canPrompt(local, false, true)).toBe(true);
    expect(CodeRunner.canPrompt(local, false, false)).toBe(false);
    process.env.AKAN_CODE_CAN_PROMPT = "1";
    expect(CodeRunner.canPrompt(local, false, false)).toBe(true);
  });
});

describe("CodeRunner.profileOf", () => {
  test("the local profile asks before an unlisted host unless told not to", () => {
    expect(CodeRunner.profileOf(runOptions(), { hostAttached: false }).network.askOutside).toContain("github.com");
    const quiet = CodeRunner.profileOf(runOptions({ askNetwork: false }), { hostAttached: false });
    expect(quiet.network.askOutside).toBeUndefined();
  });

  test("the local profile warns at start that it is not a sandbox, and a pod does not", () => {
    expect(CodeRunner.startWarnings(codeAgentPresets.local("/w")).join(" ")).toContain("not a sandbox");
    expect(CodeRunner.startWarnings(codeAgentPresets.pod("/w"))).toEqual([]);
  });
});

describe("CodeRunner.trust", () => {
  const repo = () => {
    const root = mkdtempSync(path.join(tmpdir(), "akan-code-trust-"));
    mkdirSync(path.join(root, ".akan", "code"), { recursive: true });
    writeFileSync(
      path.join(root, ".akan", "code", "mcp.json"),
      JSON.stringify({ mcpServers: { tool: { command: "node", args: ["x.js"] } } }),
    );
    return root;
  };

  const terminal = (answer: string | null) => {
    const input = new PassThrough();
    const output = new PassThrough();
    let shown = "";
    output.on("data", (chunk: Buffer) => {
      shown += chunk.toString();
    });
    if (answer === null) input.end();
    else input.write(answer);
    return { streams: { input, output }, shown: () => shown };
  };

  test("a yes at the terminal is remembered until the content changes", async () => {
    const root = repo();
    try {
      const { streams, shown } = terminal("y\n");
      expect(await CodeRunner.trust(root, codeAgentPresets.local(root), { trustWorkspace: false, streams })).toEqual(
        [],
      );
      expect(shown()).toContain("tool: node x.js");
      expect(WorkspaceTrust.pending(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a no, a closed input or no terminal at all leaves them unstarted and says how to start them", async () => {
    const root = repo();
    try {
      const profile = codeAgentPresets.local(root);
      for (const answer of ["n\n", "\n", null]) {
        const { streams } = terminal(answer);
        expect(await CodeRunner.trust(root, profile, { trustWorkspace: false, streams })).toEqual([
          CodeTrustPrompt.skipped(WorkspaceTrust.pending(root)),
        ]);
      }
      const [warning] = await CodeRunner.trust(root, profile, { trustWorkspace: false });
      expect(warning).toContain("--trust-workspace");
      expect(WorkspaceTrust.isTrusted(root, "mcp")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--trust-workspace starts them for this run without writing anything down", async () => {
    const root = repo();
    try {
      expect(await CodeRunner.trust(root, codeAgentPresets.local(root), { trustWorkspace: true })).toEqual([]);
      expect(WorkspaceTrust.isTrusted(root, "mcp")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a profile with MCP off is not asked about servers it would never start", async () => {
    const root = repo();
    try {
      expect(await CodeRunner.trust(root, codeAgentPresets.pod(root), { trustWorkspace: false })).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
