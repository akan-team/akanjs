import "../../test/registerDom";
import { beforeEach, describe, expect, test } from "bun:test";
import { AgenticSurface, type AgentRunner, AgentSession } from "use-agentic";
import { ChatCommands } from "./ChatCommands";

const l = (key: string) => key;
const idle: AgentRunner = {
  async *run() {},
};

const sessionOf = (surface = new AgenticSurface()) => new AgentSession(surface, idle);
const commandOf = (name: string) => {
  const command = ChatCommands.find(name, l);
  if (!command) throw new Error(`/${name} is not a command`);
  return command;
};
const noteOf = (session: AgentSession) => session.messages[session.messages.length - 1]?.text ?? "";

let written: string[] = [];
let deny = false;
beforeEach(() => {
  written = [];
  deny = false;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string) => {
        if (deny) return Promise.reject(new Error("NotAllowedError"));
        written.push(text);
        return Promise.resolve();
      },
    },
  });
});

describe("ChatCommands", () => {
  test("lists one row per command and resolves an alias", () => {
    expect(ChatCommands.list(l).map((command) => command.name)).toEqual([
      "new",
      "retry",
      "compact",
      "copy",
      "help",
      "tools",
    ]);
    expect(ChatCommands.find("clear", l)?.name).toBe("new");
    expect(ChatCommands.find("new", l)?.name).toBe("new");
    expect(ChatCommands.find("planWeek", l)).toBeNull();
  });

  test("/new empties the transcript", async () => {
    const session = sessionOf();
    session.note("something");
    await ChatCommands.run(commandOf("new"), { session, l });
    expect(session.messages).toEqual([]);
  });

  test("/retry says so when there is nothing to send again", async () => {
    const session = sessionOf();
    await ChatCommands.run(commandOf("retry"), { session, l });
    expect(noteOf(session)).toBe("base.agentNothingToRetry");
  });

  test("/retry says a running turn is why, not that there is nothing to send", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], { name: "hold", confirm: true, run: () => 1 });
    const session = new AgentSession(surface, {
      async *run() {
        yield { type: "toolCall", id: "c1", name: "hold", args: {} };
        yield { type: "done", stop: "toolUse" };
      },
    });
    const sending = session.send("hold on");
    for (let i = 0; i < 200 && !session.pendingApproval; i += 1) await new Promise((done) => setTimeout(done, 0));
    await ChatCommands.run(commandOf("retry"), { session, l });
    expect(noteOf(session)).toBe("base.agentBusy");
    await session.reset();
    await sending;
  });

  test("/compact summarizes the whole conversation and says so", async () => {
    const session = new AgentSession(new AgenticSurface(), {
      async *run() {
        yield { type: "text", delta: "notes about it all" };
        yield { type: "done", stop: "end" };
      },
    });
    await session.send("do a thing");
    await ChatCommands.run(commandOf("compact"), { session, l });
    expect(session.messages.map((message) => message.text)).toEqual(["notes about it all", "base.agentCompacted"]);
    expect(session.messages[0].summary).toBe(true);
    expect(session.messages[1].local).toBe(true);
  });

  test("/compact says there is nothing to summarize on an empty transcript", async () => {
    const session = sessionOf();
    await ChatCommands.run(commandOf("compact"), { session, l });
    expect(noteOf(session)).toBe("base.agentNothingToCompact");
  });

  test("/help names every command it offers", async () => {
    const session = sessionOf();
    await ChatCommands.run(commandOf("help"), { session, l });
    const text = noteOf(session);
    for (const command of ChatCommands.list(l)) expect(text).toContain(`\`/${command.name}\``);
    expect(session.messages[0].local).toBe(true);
  });

  test("/tools lists the surface's tools, the session's own askUser, and the readable keys", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], {
      name: "submitTask",
      description: "Submit the task. Runs the whole flow.",
      run: () => 1,
    });
    surface.registerResource([], { name: "taskForm", read: () => ({}) });
    const session = sessionOf(surface);
    await ChatCommands.run(commandOf("tools"), { session, l });
    const text = noteOf(session);
    expect(text).toContain("`askUser`");
    // The first sentence only: a tool description is written for a model and runs long.
    expect(text).toContain("`submitTask` — Submit the task.");
    expect(text).not.toContain("Runs the whole flow.");
    expect(text).toContain("base.agentToolsState");
    expect(text).toContain("`taskForm`");
  });

  test("/copy writes the transcript and says it did", async () => {
    const session = sessionOf();
    await session.send("what is this page");
    session.note("a note of this chat's own");
    await ChatCommands.run(commandOf("copy"), { session, l });
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("**user**");
    expect(written[0]).toContain("what is this page");
    expect(written[0]).not.toContain("a note of this chat's own");
    expect(noteOf(session)).toBe("base.agentCopied");
  });

  test("/copy reports a clipboard the browser refuses", async () => {
    deny = true;
    const session = sessionOf();
    await ChatCommands.run(commandOf("copy"), { session, l });
    expect(noteOf(session)).toBe("base.agentCopyFailed");
  });

  test("transcriptOf records calls, results, and failures", () => {
    const text = ChatCommands.transcriptOf(
      [
        { role: "user", text: "remove it" },
        { role: "assistant", toolCalls: [{ id: "c1", name: "removeTask", args: { id: "7" } }] },
        { role: "tool", toolResults: [{ id: "c1", name: "removeTask", error: "The user declined." }] },
        { role: "assistant", error: "Stopped after 8 assistant turns without a final answer." },
      ],
      "https://app.test/tasks",
    );
    expect(text).toContain("https://app.test/tasks");
    expect(text).toContain('- call `removeTask` {"id":"7"}');
    expect(text).toContain("- error `removeTask` The user declined.");
    expect(text).toContain("- failed: Stopped after 8 assistant turns");
  });

  test("a command that throws is reported in the transcript", async () => {
    const session = sessionOf();
    await ChatCommands.run(
      {
        name: "boom",
        description: "",
        run: () => {
          throw new Error("no clipboard, no nothing");
        },
      },
      { session, l },
    );
    expect(session.messages[0].error).toBe("no clipboard, no nothing");
  });
});
