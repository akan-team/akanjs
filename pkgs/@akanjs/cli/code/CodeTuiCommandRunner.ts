import type { CodeAgent } from "@akanjs/devkit/codeAgent";
import { SubagentPool } from "@akanjs/devkit/codeAgent/agent/SubagentPool";
import { WorkspaceTrust } from "@akanjs/devkit/codeAgent/agent/WorkspaceTrust";
import { McpServerConfig } from "@akanjs/devkit/codeAgent/tools/McpServerConfig";
import { McpSignIn } from "@akanjs/devkit/codeAgent/tools/McpSignIn";
import { McpTokenStore } from "@akanjs/devkit/codeAgent/tools/McpTokenStore";
import type { CodeAgentEffort, CodeTranscript } from "akanjs/common";
import { openBrowser } from "../openBrowser";
import type { CodeTuiExit } from "./CodeTui";
import { CodeTuiAutoCompact } from "./CodeTuiAutoCompact";
import { CodeTuiMcp } from "./CodeTuiMcp";
import { CodeTuiModels } from "./CodeTuiModels";
import type { CodeTuiOverlay } from "./CodeTuiOverlay";

interface CodeTuiCommandRunnerHost {
  say: (text: string) => void;
  fail: (error: unknown) => void;
  leave: (exit: CodeTuiExit) => void;
}

export class CodeTuiCommandRunner {
  readonly #agent: CodeAgent;
  readonly #transcript: CodeTranscript;
  readonly #overlay: CodeTuiOverlay;
  readonly #host: CodeTuiCommandRunnerHost;

  constructor(agent: CodeAgent, transcript: CodeTranscript, overlay: CodeTuiOverlay, host: CodeTuiCommandRunnerHost) {
    this.#agent = agent;
    this.#transcript = transcript;
    this.#overlay = overlay;
    this.#host = host;
  }

  fork(argument: string) {
    if (!this.#transcript.parts.some((part) => part.kind === "user"))
      return this.#overlay.open("fork", "Nothing has been said in this session yet, so a fork of it is a new session.");
    const from = this.#transcript.info?.sessionId ?? "";
    try {
      const forked = this.#agent.fork(argument.trim() || undefined);
      this.#host.leave({ id: forked.id, notice: `forked — the original is akan code --resume ${from}` });
    } catch (error: unknown) {
      this.#host.fail(error);
    }
  }

  agentList() {
    const budget = this.#agent.profile.tools.subagent;
    if (!budget) return "Sub-agents are off in this profile.";
    const column = Math.max(...Object.keys(SubagentPool.kinds).map((kind) => kind.length)) + 2;
    const kinds = Object.entries(SubagentPool.kinds).map(([kind, spec]) => `${kind.padEnd(column)}${spec.desc}`);
    return [
      ...kinds,
      "",
      `At most ${budget.maxConcurrent} at once, ${budget.maxDepth} deep, ${budget.budget} tokens for the whole tree.`,
      "",
      "Ask for one in a sentence — the model calls the tool. Its reading never enters this conversation.",
    ].join("\n");
  }

  mcp(argument: string) {
    const words = argument.split(" ").filter(Boolean);
    const local = words.includes("--local");
    const [verb, name, ...rest] = words.filter((word) => word !== "--local");
    const root = this.#agent.workspaceRoot;
    if (!verb) return this.#overlay.open("mcp", CodeTuiMcp.list(this.#mcpView()));
    if (verb === "reload") return this.#reload("reconnected the MCP servers");
    if (verb === "login" || verb === "logout") return this.#mcpAuth(verb, name);
    if (verb !== "add" && verb !== "remove") {
      const status = this.#agent.mcpServers().find((entry) => entry.name === verb);
      if (status) return this.#overlay.open(`mcp · ${verb}`, CodeTuiMcp.tools(status));
      return this.#overlay.open("mcp", [`There is no /mcp ${verb}.`, "", ...CodeTuiMcp.usage].join("\n"));
    }
    if (!name) return this.#overlay.open("mcp", [`Usage:`, "", ...CodeTuiMcp.usage].join("\n"));
    if (!CodeTuiMcp.namePattern.test(name))
      return this.#overlay.open("mcp", `"${name}" cannot name a server: letters, digits, dash and underscore only.`);
    try {
      if (verb === "remove") {
        const scope = WorkspaceTrust.carry(root, "mcp", () =>
          McpServerConfig.remove(root, name, local ? "workspace" : undefined),
        );
        const remaining = McpServerConfig.declared(root).find((entry) => entry.ref.name === name);
        if (!scope)
          return this.#overlay.open(
            "mcp",
            remaining
              ? `"${name}" is not declared in this repo's file; the ${remaining.scope} file declares it — /mcp remove ${name} removes it there.`
              : `No server named "${name}" is declared.`,
          );
        if (!remaining) return this.#reload(`removed ${name} from the ${scope} file`);
        return this.#reload(
          `removed ${name} from the ${scope} file — the ${remaining.scope} file still declares it, so it still applies; /mcp remove ${name} again to remove it there`,
        );
      }
      const scope = local ? "workspace" : "global";
      const ref = WorkspaceTrust.carry(root, "mcp", () => McpServerConfig.add(root, name, rest, scope));
      const where = scope === "global" ? "every repo" : "this repo";
      return this.#reload(`added ${name} · ${McpServerConfig.targetOf(ref)} · ${where}`);
    } catch (error: unknown) {
      this.#host.fail(error);
    }
  }

  // Sign-in is not awaited: it waits minutes on a person in the browser, and would freeze the prompt meanwhile.
  #mcpAuth(verb: "login" | "logout", name: string | undefined) {
    const root = this.#agent.workspaceRoot;
    if (!name) return this.#overlay.open("mcp", [`Usage: /mcp ${verb} <name>`, "", ...CodeTuiMcp.usage].join("\n"));
    const ref = McpServerConfig.read(root).find((entry) => entry.name === name);
    if (verb === "logout") {
      if (!McpTokenStore.clear(ref ?? { name })) return this.#overlay.open("mcp", `"${name}" is not signed in.`);
      return this.#reload(`signed out of ${name}`);
    }
    if (!ref) return this.#overlay.open("mcp", `No server named "${name}" is declared.`);
    this.#host.say(`signing in to ${name} — finish in the browser`);
    void McpSignIn.run(ref, { open: (url) => void openBrowser(url), onNotice: (message) => this.#host.say(message) })
      .then(() => this.#reload(`signed in to ${name}`))
      .catch((error: unknown) => this.#host.fail(error));
  }

  #mcpView() {
    const root = this.#agent.workspaceRoot;
    const problem = McpServerConfig.problem(root);
    return {
      status: this.#agent.mcpServers(),
      declared: McpServerConfig.declared(root),
      files: McpServerConfig.files(root),
      workspaceApproved: WorkspaceTrust.isTrusted(root, "mcp"),
      ...(problem ? { problem } : {}),
    };
  }

  // The engine binds its tool registry at construction, so a reload rebuilds the agent around this session.
  #reload(notice: string) {
    const id = this.#transcript.info?.sessionId;
    if (!id || !this.#agent.sessions().some((entry) => entry.id === id))
      return this.#overlay.open(
        "mcp",
        "This session is not on disk yet, so there is nothing to reopen. Say something first, or start a new `akan code`.",
      );
    this.#host.leave({ id, notice });
  }

  static peerList(peers: { id: string; name: string; cwd: string }[]) {
    if (!peers.length) return "No other akan code session is running in this workspace.";
    const column = Math.max(...peers.map((peer) => peer.name.length)) + 2;
    const rows = peers.map((peer) => `${peer.name.padEnd(column)}${peer.id.slice(0, 8)}  ${peer.cwd}`);
    return [...rows, "", "/msg <peer> <text> hands one of them a message."].join("\n");
  }

  message(argument: string) {
    const [target, ...rest] = argument.split(" ");
    const text = rest.join(" ").trim();
    if (!target || !text)
      return this.#overlay.open(
        "msg",
        `Usage: /msg <peer> <text>\n\n${CodeTuiCommandRunner.peerList(this.#agent.peers())}`,
      );
    try {
      const peer = this.#agent.send(target, text);
      this.#host.say(`sent to ${peer.name}`);
    } catch (error: unknown) {
      this.#host.fail(error);
    }
  }

  setEffort(argument: string) {
    const levels = this.#agent.efforts();
    if (!levels.length)
      return this.#overlay.open("effort", "This model does no reasoning, so it has no effort to set.");
    const wanted = argument.trim().toLowerCase();
    if (!levels.includes(wanted as CodeAgentEffort))
      return this.#overlay.open(
        "effort",
        `Usage: /effort <level>\n\nnow: ${this.#transcript.info?.effort ?? "unknown"}\n${levels.join(" · ")}`,
      );
    try {
      this.#agent.setEffort(wanted as CodeAgentEffort);
      // The engine clamps to what the provider serves, so the frame that came back is what actually took.
      this.#host.say(`effort ${this.#transcript.info?.effort ?? wanted}`);
    } catch (error: unknown) {
      this.#host.fail(error);
    }
  }

  setAutoCompact(argument: string) {
    const percent = CodeTuiAutoCompact.parse(argument);
    if (percent === undefined)
      return this.#overlay.open("autocompact", CodeTuiAutoCompact.usage(this.#transcript.info));
    try {
      this.#agent.setAutoCompactAt(percent);
      this.#host.say(CodeTuiAutoCompact.describe(this.#transcript.info));
    } catch (error: unknown) {
      this.#host.fail(error);
    }
  }

  setModel(argument: string) {
    const wanted = argument.trim();
    const [provider, ...rest] = wanted.split("/");
    if (provider && rest.length)
      return void this.#agent
        .setModel({ provider, id: rest.join("/") })
        .catch((error: unknown) => this.#host.fail(error));
    const catalogue = this.#agent.catalogue();
    if (wanted === "providers") return this.#overlay.open("model · providers", CodeTuiModels.providers(catalogue));
    if (!provider) return this.#overlay.open("model", CodeTuiModels.list(catalogue));
    const listing = CodeTuiModels.ofProvider(catalogue, provider);
    if (listing) return this.#overlay.open(`model · ${provider}`, listing);
    return this.#overlay.open(
      "model",
      [`There is no provider called "${provider}".`, "", ...CodeTuiModels.usage].join("\n"),
    );
  }
}
