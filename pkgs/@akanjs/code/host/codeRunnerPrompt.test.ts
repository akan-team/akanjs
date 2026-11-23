import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { Workspace } from "@akanjs/devkit/commandDecorators";
import { codeAgentPresets } from "akanjs/common";
import { WorkspaceTrust } from "../agent/WorkspaceTrust";
import { AkanCodeRunner, type CodeRunOptions } from "./AkanCodeRunner";
import { CodeTrustPrompt } from "./CodeTrustPrompt";

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

describe("AkanCodeRunner.canPrompt", () => {
  test("a pod prompts only when a host is on the wire, and the env overrides either way", () => {
    const pod = codeAgentPresets.pod("/w");
    expect(AkanCodeRunner.canPrompt(pod, false)).toBe(false);
    expect(AkanCodeRunner.canPrompt(pod, true)).toBe(true);
    process.env.AKAN_CODE_CAN_PROMPT = "0";
    expect(AkanCodeRunner.canPrompt(pod, true)).toBe(false);
    process.env.AKAN_CODE_CAN_PROMPT = "1";
    expect(AkanCodeRunner.canPrompt(pod, false)).toBe(true);
  });

  test("a one-shot run has nobody to answer, so it never prompts unless the env says to", () => {
    const local = codeAgentPresets.local("/w");
    expect(AkanCodeRunner.canPrompt(local, false, true)).toBe(true);
    expect(AkanCodeRunner.canPrompt(local, false, false)).toBe(false);
    process.env.AKAN_CODE_CAN_PROMPT = "1";
    expect(AkanCodeRunner.canPrompt(local, false, false)).toBe(true);
  });
});

describe("AkanCodeRunner.profileOf", () => {
  test("the local profile asks before an unlisted host unless told not to", () => {
    expect(AkanCodeRunner.profileOf(runOptions(), { hostAttached: false }).network.askOutside).toContain("github.com");
    const quiet = AkanCodeRunner.profileOf(runOptions({ askNetwork: false }), { hostAttached: false });
    expect(quiet.network.askOutside).toBeUndefined();
  });

  test("the local profile asks before a shell command unless told not to, and no flag makes another profile ask", () => {
    expect(AkanCodeRunner.profileOf(runOptions(), { hostAttached: false }).approval).toBe("commands");
    expect(AkanCodeRunner.profileOf(runOptions({ askCommands: false }), { hostAttached: false }).approval).toBe(
      "never",
    );
    const web = AkanCodeRunner.profileOf(runOptions({ profile: "web", askCommands: false }), { hostAttached: true });
    expect(web.approval).toBe("writes");
  });

  test("--no-ask stops the local profile asking about a shell command and an unlisted host, and changes nothing else", () => {
    const asking = AkanCodeRunner.profileOf(runOptions(), { hostAttached: false });
    const quiet = AkanCodeRunner.profileOf(runOptions({ ask: false }), { hostAttached: false });
    expect(quiet.approval).toBe("never");
    expect(quiet.network.askOutside).toBeUndefined();
    expect({ ...quiet, approval: asking.approval, network: asking.network }).toEqual(asking);
    expect(AkanCodeRunner.profileOf(runOptions({ ask: true }), { hostAttached: false })).toEqual(asking);
  });

  test("--no-ask leaves a profile other than local as it is", () => {
    for (const profile of ["pod", "review", "web"] as const) {
      const plain = AkanCodeRunner.profileOf(runOptions({ profile }), { hostAttached: true });
      expect(AkanCodeRunner.profileOf(runOptions({ profile, ask: false }), { hostAttached: true })).toEqual(plain);
    }
  });

  test("a session started with --no-ask says once that it runs commands and network requests without asking", () => {
    const local = codeAgentPresets.local("/w");
    const lines = AkanCodeRunner.startWarnings(local, true).filter((line) => line.includes("not a sandbox"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toStartWith("--no-ask: this session runs shell commands and network requests without asking.");
    expect(AkanCodeRunner.startWarnings(local).join(" ")).not.toContain("--no-ask");
    expect(AkanCodeRunner.startWarnings(codeAgentPresets.pod("/w"), true)).toEqual(
      AkanCodeRunner.startWarnings(codeAgentPresets.pod("/w")),
    );
  });

  test("the local profile warns at start that it is not a sandbox, and a pod does not", () => {
    expect(AkanCodeRunner.startWarnings(codeAgentPresets.local("/w")).join(" ")).toContain("not a sandbox");
    expect(AkanCodeRunner.startWarnings(codeAgentPresets.pod("/w"))).toEqual([]);
  });
});

describe("AkanCodeRunner.trust", () => {
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
      expect(
        await AkanCodeRunner.trust(root, codeAgentPresets.local(root), { trustWorkspace: false, streams }),
      ).toEqual([]);
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
        expect(await AkanCodeRunner.trust(root, profile, { trustWorkspace: false, streams })).toEqual([
          CodeTrustPrompt.skipped(WorkspaceTrust.pending(root)),
        ]);
      }
      const [warning] = await AkanCodeRunner.trust(root, profile, { trustWorkspace: false });
      expect(warning).toContain("--trust-workspace");
      expect(WorkspaceTrust.isTrusted(root, "mcp")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--trust-workspace starts them for this run without writing anything down", async () => {
    const root = repo();
    try {
      expect(await AkanCodeRunner.trust(root, codeAgentPresets.local(root), { trustWorkspace: true })).toEqual([]);
      expect(WorkspaceTrust.isTrusted(root, "mcp")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a profile with MCP off is not asked about servers it would never start", async () => {
    const root = repo();
    try {
      expect(await AkanCodeRunner.trust(root, codeAgentPresets.pod(root), { trustWorkspace: false })).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
