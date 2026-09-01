import { describe, expect, test } from "bun:test";
import { AgentAbort } from "./AgentAbort";
import { AgenticSurface } from "./AgenticSurface";
import { AgentProgress } from "./AgentProgress";
import { AgentSession } from "./AgentSession";
import { Compaction } from "./Compaction";
import { ToolOutput } from "./ToolOutput";
import { Transcript } from "./Transcript";
import type { AgentRunner, ChatMessage, RunnerEvent, RunnerRequest } from "./types";

const scripted = (...turns: RunnerEvent[][]): { runner: AgentRunner; requests: RunnerRequest[] } => {
  const requests: RunnerRequest[] = [];
  let index = 0;
  return {
    requests,
    runner: {
      async *run(request) {
        requests.push(request);
        const turn = turns[Math.min(index, turns.length - 1)];
        index += 1;
        yield* turn;
      },
    },
  };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 200 && !predicate(); i += 1) await tick();
  if (!predicate()) throw new Error("condition never met");
};

describe("AgentSession", () => {
  test("a text-only turn lands as one streamed assistant message", async () => {
    const surface = new AgenticSurface();
    const { runner, requests } = scripted([
      { type: "text", delta: "Hello " },
      { type: "text", delta: "there" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(surface, runner, { instructions: "Be brief" });
    await session.send("hi");
    expect(session.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(session.messages[1].text).toBe("Hello there");
    expect(session.isRunning).toBe(false);
    expect(requests[0].instructions).toBe("Be brief");
    expect(requests[0].messages.map((message) => message.role)).toEqual(["user"]);
  });

  test("a tool turn executes, reports changes, and feeds results into the next turn", async () => {
    const surface = new AgenticSurface();
    let count = 0;
    surface.registerResource([], { name: "count", read: () => count });
    surface.registerTool([], {
      name: "bump",
      run: () => {
        count += 1;
      },
    });
    const { runner, requests } = scripted(
      [
        { type: "toolCall", id: "c1", name: "bump", args: {} },
        { type: "done", stop: "toolUse" },
      ],
      [
        { type: "text", delta: "Done" },
        { type: "done", stop: "end" },
      ],
    );
    const session = new AgentSession(surface, runner);
    await session.send("bump it");
    const toolMessage = session.messages.find((message) => message.role === "tool");
    expect(toolMessage?.toolResults).toEqual([{ id: "c1", name: "bump", changes: [{ name: "count", value: 1 }] }]);
    expect(requests).toHaveLength(2);
    expect(requests[1].messages.filter((message) => message.role === "tool")).toHaveLength(1);
    expect(requests[0].tools.map((tool) => tool.name)).toEqual(["bump", "askUser"]);
    expect(session.messages[session.messages.length - 1].text).toBe("Done");
  });

  test("a guard refusal and an unknown tool are tool results, not crashes", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], { name: "gated", guard: () => "stale index", run: () => "never" });
    const { runner } = scripted(
      [
        { type: "toolCall", id: "c1", name: "gated", args: {} },
        { type: "toolCall", id: "c2", name: "missing", args: {} },
        { type: "done", stop: "toolUse" },
      ],
      [
        { type: "text", delta: "Understood" },
        { type: "done", stop: "end" },
      ],
    );
    const session = new AgentSession(surface, runner);
    await session.send("try");
    const results = session.messages.find((message) => message.role === "tool")?.toolResults;
    expect(results?.[0].error).toBe("stale index");
    expect(results?.[1].error).toBe("Unknown tool: missing");
    expect(session.messages[session.messages.length - 1].text).toBe("Understood");
  });

  test("a confirm tool pauses on pendingApproval and runs on approve", async () => {
    const surface = new AgenticSurface();
    let ran = 0;
    surface.registerTool([], {
      name: "render",
      confirm: "Render now? It spends credits.",
      run: () => {
        ran += 1;
      },
    });
    const { runner } = scripted(
      [
        { type: "toolCall", id: "c1", name: "render", args: {} },
        { type: "done", stop: "toolUse" },
      ],
      [
        { type: "text", delta: "Rendering" },
        { type: "done", stop: "end" },
      ],
    );
    const session = new AgentSession(surface, runner);
    const turn = session.send("render");
    await until(() => session.pendingApproval !== null);
    expect(session.pendingApproval?.message).toBe("Render now? It spends credits.");
    expect(ran).toBe(0);
    session.pendingApproval?.approve();
    await turn;
    expect(ran).toBe(1);
    expect(session.pendingApproval).toBeNull();
  });

  test("a rejected approval becomes the tool's error result", async () => {
    const surface = new AgenticSurface();
    let ran = 0;
    surface.registerTool([], {
      name: "render",
      confirm: true,
      run: () => {
        ran += 1;
      },
    });
    const { runner } = scripted(
      [
        { type: "toolCall", id: "c1", name: "render", args: {} },
        { type: "done", stop: "toolUse" },
      ],
      [
        { type: "text", delta: "Okay, skipped." },
        { type: "done", stop: "end" },
      ],
    );
    const session = new AgentSession(surface, runner);
    const turn = session.send("render");
    await until(() => session.pendingApproval !== null);
    expect(session.pendingApproval?.message).toBe("Run render?");
    session.pendingApproval?.reject("too expensive right now");
    await turn;
    expect(ran).toBe(0);
    const results = session.messages.find((message) => message.role === "tool")?.toolResults;
    expect(results?.[0].error).toBe("too expensive right now");
  });

  test("abort settles a pending approval and ends the loop without another turn", async () => {
    const surface = new AgenticSurface();
    let ran = 0;
    surface.registerTool([], {
      name: "render",
      confirm: true,
      run: () => {
        ran += 1;
      },
    });
    const { runner, requests } = scripted([
      { type: "toolCall", id: "c1", name: "render", args: {} },
      { type: "done", stop: "toolUse" },
    ]);
    const session = new AgentSession(surface, runner);
    const turn = session.send("render");
    await until(() => session.pendingApproval !== null);
    session.abort();
    await turn;
    expect(ran).toBe(0);
    expect(session.isRunning).toBe(false);
    expect(requests).toHaveLength(1);
  });

  test("the loop stops at maxTurns and records why", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], { name: "spin", run: () => null });
    const { runner, requests } = scripted([
      { type: "toolCall", id: "c", name: "spin", args: {} },
      { type: "done", stop: "toolUse" },
    ]);
    const session = new AgentSession(surface, runner, { maxTurns: 2 });
    await session.send("go");
    expect(requests).toHaveLength(2);
    expect(session.messages[session.messages.length - 1].error).toContain("Stopped after 2");
  });

  test("a runner error lands on the assistant draft", async () => {
    const surface = new AgenticSurface();
    const { runner } = scripted([{ type: "error", message: "upstream 500" }]);
    const session = new AgentSession(surface, runner);
    await session.send("hi");
    const last = session.messages[session.messages.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.error).toBe("upstream 500");
    expect(session.isRunning).toBe(false);
  });

  test("surface guides fold into the turn's instructions after the session's own", async () => {
    const surface = new AgenticSurface();
    surface.registerGuide([], "This screen edits the draft.");
    const { runner, requests } = scripted([
      { type: "text", delta: "ok" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(surface, runner, { instructions: "Be brief." });
    await session.send("hi");
    expect(requests[0].instructions).toBe("Be brief.\n\nThis screen edits the draft.");
  });

  test("prewritten messages ride as the user's turn, and report lands a host failure", async () => {
    const { runner, requests } = scripted([
      { type: "text", delta: "reviewed" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner);
    await session.send([
      { role: "user", text: "Review this task." },
      { role: "user", text: "[resource akan://task/1]" },
    ]);
    expect(requests[0].messages).toHaveLength(2);
    expect(session.messages.at(-1)?.text).toBe("reviewed");
    session.report("/reviewTask failed: not permitted");
    expect(session.messages.at(-1)).toEqual({ role: "assistant", error: "/reviewTask failed: not permitted" });
  });

  test("send while a turn is running is refused", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], { name: "wait", confirm: true, run: () => null });
    const { runner } = scripted([
      { type: "toolCall", id: "c1", name: "wait", args: {} },
      { type: "done", stop: "toolUse" },
    ]);
    const session = new AgentSession(surface, runner);
    const turn = session.send("first");
    await until(() => session.pendingApproval !== null);
    await expect(session.send("second")).rejects.toThrow("A turn is already running.");
    session.abort();
    await turn;
  });

  test("the default context carries scopes and resources", async () => {
    const surface = new AgenticSurface();
    surface.openScope([], { id: "task-list", kind: "task" });
    surface.registerResource([], { name: "total", read: () => 3 });
    const { runner, requests } = scripted([{ type: "done", stop: "end" }]);
    await new AgentSession(surface, runner).send("ctx");
    expect(requests[0].context).toEqual([
      { kind: "screen", scopes: [{ path: "task-list", kind: "task" }] },
      { kind: "resources", resources: [{ name: "total", value: 3 }] },
    ]);
  });
});

describe("AgentSession settle and progress", () => {
  test("settle runs after a changing call and before its report, and never after a query", async () => {
    const surface = new AgenticSurface();
    let count = 0;
    let settles = 0;
    surface.registerResource([], { name: "count", read: () => count });
    // Lands a tick later, like a store action that fires `void fetch.*` and commits when the answer arrives.
    surface.registerTool([], {
      name: "bumpLater",
      run: () => {
        setTimeout(() => {
          count += 1;
        }, 0);
      },
    });
    surface.registerTool([], { name: "peek", settle: false, run: () => count });
    const { runner } = scripted(
      [
        { type: "toolCall", id: "c1", name: "bumpLater", args: {} },
        { type: "toolCall", id: "c2", name: "peek", args: {} },
        { type: "done", stop: "toolUse" },
      ],
      [{ type: "done", stop: "end" }],
    );
    const session = new AgentSession(surface, runner, {
      settle: async () => {
        settles += 1;
        await tick();
      },
    });
    await session.send("bump");
    const results = session.messages.find((message) => message.role === "tool")?.toolResults;
    expect(results?.[0].changes).toEqual([{ name: "count", value: 1 }]);
    expect(results?.[1].result).toBe(1);
    expect(settles).toBe(1);
  });

  test("a tool reports progress while it runs, and the slot empties after it", async () => {
    const surface = new AgenticSurface();
    const seen: (string | undefined)[] = [];
    let session: AgentSession | null = null;
    surface.registerTool([], {
      name: "upload",
      run: async () => {
        AgentProgress.report("uploading 1/2", { done: 1, total: 2 });
        seen.push(session?.progress?.message);
        await tick();
        AgentProgress.report("uploading 2/2", { done: 2, total: 2 });
        seen.push(session?.progress?.message);
        return "uploaded";
      },
    });
    const { runner } = scripted(
      [
        { type: "toolCall", id: "c1", name: "upload", args: {} },
        { type: "done", stop: "toolUse" },
      ],
      [{ type: "done", stop: "end" }],
    );
    session = new AgentSession(surface, runner);
    await session.send("upload it");
    expect(seen).toEqual(["uploading 1/2", "uploading 2/2"]);
    expect(session.progress).toBeNull();
    // Nothing is listening outside a call, so the same code is a no-op in a test or on the server.
    expect(AgentProgress.watching).toBe(false);
  });

  test("the turn cap asks whether to keep going, and the answer rides as the user's turn", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], { name: "spin", run: () => null });
    const { runner, requests } = scripted([
      { type: "toolCall", id: "c", name: "spin", args: {} },
      { type: "done", stop: "toolUse" },
    ]);
    const session = new AgentSession(surface, runner, {
      maxTurns: 1,
      continueAsk: () => ({ question: "Still working. Keep going?", keep: "Keep going" }),
    });
    const turn = session.send("go");
    await until(() => session.pendingQuestion !== null);
    expect(session.pendingQuestion?.choices).toEqual(["Keep going"]);
    session.pendingQuestion?.answer("look at the second tab instead");
    await until(() => session.pendingQuestion !== null);
    session.pendingQuestion?.dismiss();
    await turn;
    expect(requests).toHaveLength(2);
    expect(requests[1].messages.at(-1)).toEqual({ role: "user", text: "look at the second tab instead" });
    expect(session.messages.at(-1)?.error).toContain("Stopped after 2");
  });
});

describe("AgentSession askUser", () => {
  const asking = (args: Record<string, unknown>) =>
    scripted(
      [
        { type: "toolCall", id: "q1", name: "askUser", args },
        { type: "done", stop: "toolUse" },
      ],
      [
        { type: "text", delta: "Understood" },
        { type: "done", stop: "end" },
      ],
    );

  test("the built-in rides on every turn, needing no confirmation of its own", async () => {
    const { runner, requests } = scripted([{ type: "done", stop: "end" }]);
    await new AgentSession(new AgenticSurface(), runner).send("hi");
    const ask = requests[0].tools.find((tool) => tool.name === "askUser");
    expect(ask?.needsConfirm).toBe(false);
    expect(ask?.parameters?.required).toEqual(["question"]);
  });

  test("a pick parks the turn on pendingQuestion and comes back as the tool result", async () => {
    const { runner } = asking({ question: "  Which theme?  ", choices: ["Dark", " Light ", "Dark", "", 7] });
    const session = new AgentSession(new AgenticSurface(), runner);
    const turn = session.send("set a theme");
    await until(() => session.pendingQuestion !== null);
    expect(session.pendingQuestion?.question).toBe("Which theme?");
    expect(session.pendingQuestion?.choices).toEqual(["Dark", "Light"]);
    expect(session.pendingQuestion?.multiple).toBe(false);
    session.pendingQuestion?.answer("Dark");
    await turn;
    expect(session.messages.find((message) => message.role === "tool")?.toolResults).toEqual([
      { id: "q1", name: "askUser", result: "Dark" },
    ]);
    expect(session.pendingQuestion).toBeNull();
    expect(session.messages.at(-1)?.text).toBe("Understood");
  });

  test("several picks ride back as a list", async () => {
    const { runner } = asking({ question: "Which columns?", choices: ["Name", "Status"], multiple: true });
    const session = new AgentSession(new AgenticSurface(), runner);
    const turn = session.send("pick columns");
    await until(() => session.pendingQuestion !== null);
    expect(session.pendingQuestion?.multiple).toBe(true);
    session.pendingQuestion?.answer(["Name", "Status"]);
    await turn;
    expect(session.messages.find((message) => message.role === "tool")?.toolResults?.[0].result).toEqual([
      "Name",
      "Status",
    ]);
  });

  test("a dismissal is the tool's error result, and so is a question with no text", async () => {
    const session = new AgentSession(new AgenticSurface(), asking({ question: "Which theme?" }).runner);
    const turn = session.send("ask me");
    await until(() => session.pendingQuestion !== null);
    session.pendingQuestion?.dismiss();
    await turn;
    expect(session.messages.find((message) => message.role === "tool")?.toolResults?.[0].error).toContain("dismissed");
    const empty = new AgentSession(new AgenticSurface(), asking({ choices: ["A"] }).runner);
    await empty.send("ask me");
    expect(empty.pendingQuestion).toBeNull();
    expect(empty.messages.find((message) => message.role === "tool")?.toolResults?.[0].error).toBe(
      "askUser needs a question to ask.",
    );
  });

  test("a surface tool of the same name shadows the built-in instead of doubling it", async () => {
    const surface = new AgenticSurface();
    let asked = 0;
    surface.registerTool([], {
      name: "askUser",
      run: () => {
        asked += 1;
        return "the screen answered";
      },
    });
    const { runner, requests } = asking({ question: "Which theme?" });
    const session = new AgentSession(surface, runner);
    await session.send("ask me");
    expect(requests[0].tools.filter((tool) => tool.name === "askUser")).toHaveLength(1);
    expect(asked).toBe(1);
    expect(session.pendingQuestion).toBeNull();
  });

  test("abort settles a pending question and ends the loop", async () => {
    const { runner, requests } = asking({ question: "Which theme?" });
    const session = new AgentSession(new AgenticSurface(), runner);
    const turn = session.send("ask me");
    await until(() => session.pendingQuestion !== null);
    session.abort();
    await turn;
    expect(session.pendingQuestion).toBeNull();
    expect(session.isRunning).toBe(false);
    expect(requests).toHaveLength(1);
  });
});

describe("AgentSession history", () => {
  const memoryHistory = (initial: import("./types").ChatMessage[] | null = null) => {
    const state = { stored: initial, saves: 0, cleared: 0, loads: 0 };
    return {
      state,
      history: {
        load: () => {
          state.loads += 1;
          return state.stored;
        },
        save: (messages: readonly import("./types").ChatMessage[]) => {
          state.stored = [...messages];
          state.saves += 1;
        },
        clear: () => {
          state.stored = null;
          state.cleared += 1;
        },
      },
    };
  };

  test("restores settled messages and drops an assistant draft a reload cut short", () => {
    const { history } = memoryHistory([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
      { role: "assistant" },
    ]);
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, { history });
    expect(session.messages).toEqual([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hello" },
    ]);
  });

  test("saves after a turn, debounced, and reset clears both transcript and storage", async () => {
    const { state, history } = memoryHistory();
    const { runner } = scripted([
      { type: "text", delta: "answer" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner, { history });
    await session.send("question");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(state.saves).toBe(1);
    expect(state.stored?.map((message) => message.text)).toEqual(["question", "answer"]);
    await session.reset();
    expect(session.messages).toEqual([]);
    expect(state.cleared).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(state.saves).toBe(1);
    expect(state.stored).toBeNull();
  });

  test("an async load lands into an untouched transcript and reports while it is in flight", async () => {
    let settle: (messages: import("./types").ChatMessage[]) => void = () => undefined;
    const pending = new Promise<import("./types").ChatMessage[]>((resolve) => {
      settle = resolve;
    });
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, {
      history: { load: () => pending, save: () => undefined, clear: () => undefined },
    });
    expect(session.isRestoring).toBe(true);
    expect(session.messages).toEqual([]);
    const seen: number[] = [];
    session.subscribe(() => seen.push(session.version));
    settle([{ role: "user", text: "restored" }]);
    await pending;
    await Promise.resolve();
    expect(session.isRestoring).toBe(false);
    expect(session.messages).toEqual([{ role: "user", text: "restored" }]);
    expect(seen.length).toBe(1);
  });

  test("an async load that arrives after the user sent something is dropped, not merged", async () => {
    let settle: (messages: import("./types").ChatMessage[]) => void = () => undefined;
    const pending = new Promise<import("./types").ChatMessage[]>((resolve) => {
      settle = resolve;
    });
    const { runner } = scripted([
      { type: "text", delta: "answer" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner, {
      history: { load: () => pending, save: () => undefined, clear: () => undefined },
    });
    await session.send("question");
    settle([{ role: "user", text: "restored" }]);
    await pending;
    await Promise.resolve();
    expect(session.messages.map((message) => message.text)).toEqual(["question", "answer"]);
  });

  test("an async load that rejects leaves the chat empty and usable", async () => {
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, {
      history: { load: () => Promise.reject(new Error("offline")), save: () => undefined, clear: () => undefined },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.isRestoring).toBe(false);
    expect(session.messages).toEqual([]);
  });

  test("async saves run one at a time and a clear queues behind them", async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, {
      history: {
        load: () => null,
        save: async () => {
          const slow = first;
          first = false;
          if (slow) await held;
          order.push(slow ? "save:slow" : "save:fast");
        },
        clear: () => {
          order.push("clear");
        },
      },
    });
    session.note("one");
    await new Promise((resolve) => setTimeout(resolve, 350));
    session.note("two");
    await new Promise((resolve) => setTimeout(resolve, 350));
    const cleared = session.reset();
    release();
    await cleared;
    expect(order).toEqual(["save:slow", "save:fast", "clear"]);
  });

  test("a history attached before the first turn restores, and saves from then on", async () => {
    const { state, history } = memoryHistory([{ role: "user", text: "earlier" }]);
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, {});
    expect(session.messages).toEqual([]);
    session.setHistory(history);
    expect(session.messages).toEqual([{ role: "user", text: "earlier" }]);
    session.note("later");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(state.saves).toBe(1);
    expect(state.stored?.map((message) => message.text)).toEqual(["earlier", "later"]);
  });

  test("a history attached after the conversation moved on saves without restoring, and is never asked to load", () => {
    const { state, history } = memoryHistory([{ role: "user", text: "from another visit" }]);
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, {});
    session.note("already said");
    session.setHistory(history);
    expect(session.messages.map((message) => message.text)).toEqual(["already said"]);
    // Not merely discarded on arrival: a store is never asked for a transcript that would be thrown away.
    expect(state.loads).toBe(0);
  });

  test("detaching stops the saving", async () => {
    const { state, history } = memoryHistory();
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, {});
    session.setHistory(history);
    session.note("kept");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(state.saves).toBe(1);
    session.setHistory(null);
    session.note("not kept");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(state.saves).toBe(1);
  });

  test("whoever attached last owns the slot, and a stale detach leaves it alone", async () => {
    const first = memoryHistory();
    const second = memoryHistory();
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, {});
    const detachFirst = session.setHistory(first.history);
    session.setHistory(second.history);
    // The order a remount arrives in: the newcomer is already installed when the old one's cleanup runs.
    detachFirst();
    session.note("after the handover");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(second.state.saves).toBe(1);
    expect(first.state.saves).toBe(0);
    expect(second.state.stored?.map((message) => message.text)).toEqual(["after the handover"]);
  });

  test("an attached async history reports while it loads, exactly as a constructed one does", async () => {
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, {});
    const pending = Promise.resolve([{ role: "user" as const, text: "from the server" }]);
    session.setHistory({ load: () => pending, save: () => undefined, clear: () => undefined });
    expect(session.isRestoring).toBe(true);
    await pending;
    await Promise.resolve();
    expect(session.isRestoring).toBe(false);
    expect(session.messages).toEqual([{ role: "user", text: "from the server" }]);
  });

  test("setOnCompact attaches the hook a constructed session takes as an option", async () => {
    const cuts: number[] = [];
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, {
      history: {
        load: () => [
          { role: "user", text: "x".repeat(30_000) },
          { role: "assistant", text: "ok" },
        ],
        save: () => undefined,
        clear: () => undefined,
      },
      compact: { summarize: async () => "notes" },
    });
    session.setOnCompact((replaced) => cuts.push(replaced.length));
    expect(await session.compact()).toBe(true);
    expect(cuts).toEqual([2]);
    session.setOnCompact(null);
  });

  test("a history that throws never breaks the chat", async () => {
    const broken = {
      load: () => {
        throw new Error("quota");
      },
      save: () => {
        throw new Error("quota");
      },
      clear: () => {
        throw new Error("quota");
      },
    };
    const { runner } = scripted([
      { type: "text", delta: "fine" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner, { history: broken });
    await session.send("hi");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(session.messages.at(-1)?.text).toBe("fine");
    session.reset();
    expect(session.messages).toEqual([]);
  });

  test("a note is rendered in the transcript and withheld from the model", async () => {
    const { runner, requests } = scripted([
      { type: "text", delta: "ok" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner);
    session.note("Copied to the clipboard.");
    await session.send("hi");
    expect(session.messages.map((message) => message.local ?? false)).toEqual([true, false, false]);
    expect(requests[0].messages.map((message) => message.text)).toEqual(["hi"]);
  });

  test("retry re-sends the last user message and drops what the attempt produced", async () => {
    const { runner, requests } = scripted([
      { type: "text", delta: "second try" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner);
    await session.send("earlier");
    session.note("a command said something");
    expect(await session.retry()).toBe(true);
    expect(session.messages.map((message) => message.text)).toEqual(["earlier", "second try"]);
    // The replay is one user turn, so the model never sees the failed attempt it is replacing.
    expect(requests[1].messages.map((message) => message.text)).toEqual(["earlier"]);
  });

  test("retry keeps what came before the last user message", async () => {
    const { runner } = scripted([
      { type: "text", delta: "again" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner);
    await session.send([
      { role: "user", text: "context from a prompt" },
      { role: "assistant", text: "preamble" },
      { role: "user", text: "the ask" },
    ]);
    await session.retry();
    expect(session.messages.map((message) => message.text)).toEqual([
      "context from a prompt",
      "preamble",
      "the ask",
      "again",
    ]);
  });

  test("attachments ride the turn, and a message carrying only files is still retryable", async () => {
    const { runner, requests } = scripted([
      { type: "text", delta: "a chart" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner);
    const attachments = [{ name: "q3.png", mimeType: "image/png", data: "AAAA" }];
    await session.send([{ role: "user", attachments }]);
    expect(requests[0].messages).toEqual([{ role: "user", attachments }]);
    expect(await session.retry()).toBe(true);
    expect(requests[1].messages).toEqual([{ role: "user", attachments }]);
  });

  test("retry refuses when there is nothing to send again", async () => {
    const { runner } = scripted([{ type: "done", stop: "end" }]);
    const session = new AgentSession(new AgenticSurface(), runner);
    expect(await session.retry()).toBe(false);
    session.note("only a note");
    expect(await session.retry()).toBe(false);
    expect(session.messages).toHaveLength(1);
  });

  test("reset ends a running turn instead of silently doing nothing", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], { name: "wait", confirm: true, run: () => "ran" });
    const { runner } = scripted([
      { type: "toolCall", id: "c1", name: "wait", args: {} },
      { type: "done", stop: "toolUse" },
    ]);
    const session = new AgentSession(surface, runner);
    const sending = session.send("do it");
    await until(() => !!session.pendingApproval);
    await session.reset();
    await sending;
    expect(session.messages).toEqual([]);
    expect(session.isRunning).toBe(false);
    expect(session.pendingApproval).toBeNull();
  });
});

describe("AgentSession compaction", () => {
  const bulky = (mark: string): ChatMessage[] => [
    { role: "user", text: `${mark} ${"x".repeat(30_000)}` },
    { role: "assistant", text: "noted" },
  ];
  const restored = (messages: ChatMessage[]) => ({
    load: () => messages,
    save: () => undefined,
    clear: () => undefined,
  });

  test("a transcript past the threshold is summarized before the turn that would have overflowed", async () => {
    const { runner, requests } = scripted([
      { type: "text", delta: "answered" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner, {
      history: restored([...bulky("first"), { role: "user", text: "second" }, { role: "assistant", text: "ok" }]),
      compact: { at: 1_000, keep: 2, summarize: async (digest) => `notes: ${digest.slice(0, 20)}` },
    });
    await session.send("third");
    // The cut lands on the newest user message, so the summary covers everything the turn was carrying until now.
    expect(session.messages.map((message) => message.summary === true)).toEqual([true, false, false]);
    expect(session.messages[0].text).toStartWith("notes: user: first");
    expect(session.messages.map((message) => message.role)).toEqual(["user", "user", "assistant"]);
    // The summary rides as history, and the messages it replaced are gone from the request as well as the screen.
    expect(requests[0].messages[0]).toMatchObject({ role: "user", summary: true });
    expect(requests[0].messages.map((message) => message.text)).toEqual([session.messages[0].text, "third"]);
  });

  test("the summarizing turn carries no tools and no screen context", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], { name: "bump", run: () => 1 });
    const { runner, requests } = scripted([
      { type: "text", delta: "summary" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(surface, runner, {
      history: restored(bulky("first")),
      compact: { at: 1_000, keep: 0 },
    });
    expect(await session.compact()).toBe(true);
    expect(requests[0].tools).toEqual([]);
    expect(requests[0].context).toEqual([]);
    expect(requests[0].instructions).toContain("Summarize the conversation");
    expect(session.messages).toEqual([{ role: "user", text: "summary", summary: true }]);
  });

  test("a transcript under the threshold is left alone", async () => {
    const { runner, requests } = scripted([
      { type: "text", delta: "hi" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner, {
      history: restored([{ role: "user", text: "short" }]),
      compact: { at: 1_000, keep: 1, summarize: async () => "never" },
    });
    await session.send("also short");
    expect(session.messages.some((message) => message.summary)).toBe(false);
    expect(requests).toHaveLength(1);
  });

  test("a summary that cannot be produced leaves the transcript alone and the turn still goes out", async () => {
    const { runner, requests } = scripted([
      { type: "text", delta: "answered anyway" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner, {
      history: restored(bulky("first")),
      compact: {
        at: 1_000,
        keep: 2,
        summarize: () => Promise.reject(new Error("the summarizer is down too")),
      },
    });
    await session.send("carry on");
    expect(session.messages.some((message) => message.summary)).toBe(false);
    expect(session.messages.at(-1)?.text).toBe("answered anyway");
    expect(requests).toHaveLength(1);
  });

  test("a transcript that cannot shrink is not re-summarized on every turn", async () => {
    let summaries = 0;
    const { runner } = scripted([
      { type: "text", delta: "ok" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner, {
      history: restored(bulky("first")),
      compact: {
        at: 1_000,
        keep: 2,
        summarize: async () => {
          summaries += 1;
          // Still over the threshold afterwards, which is what a single enormous kept message looks like.
          return "y".repeat(30_000);
        },
      },
    });
    await session.send("one");
    await session.send("two");
    expect(summaries).toBe(1);
  });

  test("a turn that grows past the threshold on its own tool calls is compacted mid-turn", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], { name: "read", run: () => "y".repeat(4_000) });
    const { runner, requests } = scripted(
      ...Array.from({ length: 8 }, (_, at) => [
        { type: "toolCall" as const, id: `c${at}`, name: "read", args: {} },
        { type: "done" as const, stop: "toolUse" as const },
      ]),
      [
        { type: "text", delta: "done" },
        { type: "done", stop: "end" },
      ],
    );
    const session = new AgentSession(surface, runner, {
      maxTurns: 20,
      compact: { at: 4_000, keep: 4, summarize: async () => "notes" },
    });
    await session.send("read it repeatedly");
    // Nothing but the one user message opens this transcript, so a cut that insists on a user boundary never finds
    // one and the request grows until the provider refuses it.
    expect(session.messages.some((message) => message.summary)).toBe(true);
    expect(Compaction.tokensOf(session.messages)).toBeLessThan(4_000);
    expect(requests.at(-1)?.messages[0]).toMatchObject({ text: "notes", summary: true });
  });

  test("a tool result too large for the window is bounded before it enters the transcript", async () => {
    const surface = new AgenticSurface();
    // What a `readState` of one record with inlined bytes looks like: small on screen, megabytes on the wire.
    surface.registerTool([], { name: "readState", run: () => ({ video: "x".repeat(2_000_000) }) });
    const { runner, requests } = scripted(
      [
        { type: "toolCall", id: "c1", name: "readState", args: { key: "videoSliceList" } },
        { type: "done", stop: "toolUse" },
      ],
      [
        { type: "text", delta: "too big to read whole" },
        { type: "done", stop: "end" },
      ],
    );
    const session = new AgentSession(surface, runner, { compact: { at: 0 } });
    await session.send("read the slice list");
    const returned = session.messages.find((message) => message.role === "tool")?.toolResults?.[0].result;
    expect(String(returned)).toContain("Truncated");
    expect(Compaction.tokensOf(session.messages)).toBeLessThan(6_000);
    // The bound holds on the wire too, which is the half that would have been refused.
    expect(JSON.stringify(requests[1].messages).length).toBeLessThan(ToolOutput.limit * 2);
  });

  test("the session says when it is summarizing, since that turn answers nothing the user asked", async () => {
    const { runner } = scripted([
      { type: "text", delta: "answered" },
      { type: "done", stop: "end" },
    ]);
    const seen: boolean[] = [];
    const session = new AgentSession(new AgenticSurface(), runner, {
      history: restored(bulky("first")),
      compact: {
        at: 1_000,
        keep: 2,
        summarize: async () => {
          seen.push(session.isCompacting);
          return "notes";
        },
      },
    });
    session.subscribe(() => seen.push(session.isCompacting));
    await session.send("carry on");
    expect(seen).toContain(true);
    expect(session.isCompacting).toBe(false);
  });

  test("a summarizer that failed once is asked again on the next turn", async () => {
    let summaries = 0;
    const { runner } = scripted([
      { type: "text", delta: "ok" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner, {
      history: restored(bulky("first")),
      compact: {
        at: 1_000,
        keep: 2,
        summarize: () => {
          summaries += 1;
          return Promise.reject(new Error("the summarizer is down"));
        },
      },
    });
    await session.send("one");
    await session.send("two");
    expect(summaries).toBe(2);
  });

  test("retry never replays a summary, which is history rather than the ask it stands in for", async () => {
    const { runner } = scripted([
      { type: "text", delta: "notes" },
      { type: "done", stop: "end" },
    ]);
    const session = new AgentSession(new AgenticSurface(), runner, { history: restored(bulky("first")) });
    expect(await session.compact()).toBe(true);
    expect(session.messages).toEqual([{ role: "user", text: "notes", summary: true }]);
    expect(await session.retry()).toBe(false);
  });

  test("onCompact reports the cut, so a host can move its own summary watermark to the same place", async () => {
    const cuts: { replaced: number; summary: string | undefined }[] = [];
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, {
      history: restored([...bulky("first"), { role: "user", text: "second" }, { role: "assistant", text: "ok" }]),
      compact: { summarize: async () => "notes" },
      onCompact: (replaced, summary) => cuts.push({ replaced: replaced.length, summary: summary.text }),
    });
    expect(await session.compact()).toBe(true);
    expect(cuts).toEqual([{ replaced: 4, summary: session.messages[0].text }]);
    expect(session.messages[0].summary).toBe(true);
  });

  test("a host that throws from onCompact does not undo the cut the transcript already took", async () => {
    const session = new AgentSession(new AgenticSurface(), scripted([]).runner, {
      history: restored(bulky("first")),
      compact: { summarize: async () => "notes" },
      onCompact: () => {
        throw new Error("watermark store is down");
      },
    });
    expect(await session.compact()).toBe(true);
    expect(session.messages.map((message) => message.summary === true)).toEqual([true]);
  });

  test("compact refuses while a turn is running, and reports nothing to do on an empty transcript", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], { name: "hold", confirm: true, run: () => 1 });
    const session = new AgentSession(surface, {
      async *run() {
        yield { type: "toolCall", id: "c1", name: "hold", args: {} };
        yield { type: "done", stop: "toolUse" };
      },
    });
    expect(await session.compact()).toBe(false);
    const sending = session.send("hold on");
    await until(() => !!session.pendingApproval);
    expect(await session.compact()).toBe(false);
    await session.reset();
    await sending;
  });
});

describe("AgentSession long tools", () => {
  test("a tool that waits holds the turn without a model round trip", async () => {
    const surface = new AgenticSurface();
    let status = "generating";
    surface.registerResource([], { name: "status", read: () => status });
    // The shape an app writes: the tool does not return until the work it started is done.
    surface.registerTool([], {
      name: "generate",
      run: async () => {
        for (let at = 0; at < 5; at += 1) await tick();
        status = "ready";
      },
    });
    const { runner, requests } = scripted(
      [
        { type: "toolCall", id: "c1", name: "generate", args: {} },
        { type: "done", stop: "toolUse" },
      ],
      [{ type: "done", stop: "end" }],
    );
    const session = new AgentSession(surface, runner);
    await session.send("generate it");
    const results = session.messages.find((message) => message.role === "tool")?.toolResults;
    // The model was asked twice: the turn that called the tool, and the one that read its result. Never in between.
    expect(requests).toHaveLength(2);
    expect(results?.[0].changes).toEqual([{ name: "status", value: "ready" }]);
  });

  test("stop ends a turn parked in a long tool instead of waiting the tool out", async () => {
    const surface = new AgenticSurface();
    let started = false;
    surface.registerTool([], {
      name: "forever",
      run: () => {
        started = true;
        return new Promise(() => {});
      },
    });
    const { runner } = scripted([
      { type: "toolCall", id: "c1", name: "forever", args: {} },
      { type: "done", stop: "toolUse" },
    ]);
    const session = new AgentSession(surface, runner);
    const turn = session.send("wait for it");
    await until(() => started);
    session.abort();
    await turn;
    expect(session.isRunning).toBe(false);
    const results = session.messages.find((message) => message.role === "tool")?.toolResults;
    expect(results?.[0].error).toBe("The user aborted the turn.");
  });

  test("a tool reads the signal through AgentAbort, so it can stop its own work", async () => {
    const surface = new AgenticSurface();
    let stopped = false;
    let watching = false;
    surface.registerTool([], {
      name: "poll",
      run: () =>
        new Promise((resolve) => {
          const timer = setInterval(() => {}, 10);
          AgentAbort.current?.addEventListener("abort", () => {
            clearInterval(timer);
            stopped = true;
            resolve("stopped");
          });
          watching = true;
        }),
    });
    const { runner } = scripted([
      { type: "toolCall", id: "c1", name: "poll", args: {} },
      { type: "done", stop: "toolUse" },
    ]);
    const session = new AgentSession(surface, runner);
    const turn = session.send("poll it");
    await until(() => watching);
    session.abort();
    await turn;
    expect(stopped).toBe(true);
    // The slot is per call, so nothing outside one can reach a signal that is no longer live.
    expect(AgentAbort.current).toBeNull();
  });

  test("a tool that ignores the signal is left running rather than having its result thrown away", async () => {
    const surface = new AgenticSurface();
    let finished = false;
    let release: (() => void) | null = null;
    surface.registerTool([], {
      name: "stubborn",
      run: () =>
        new Promise<string>((resolve) => {
          release = () => {
            finished = true;
            resolve("done anyway");
          };
        }),
    });
    const { runner } = scripted([
      { type: "toolCall", id: "c1", name: "stubborn", args: {} },
      { type: "done", stop: "toolUse" },
    ]);
    const session = new AgentSession(surface, runner);
    const turn = session.send("go");
    await until(() => !!release);
    session.abort();
    await turn;
    expect(finished).toBe(false);
    release?.();
    await tick();
    expect(finished).toBe(true);
  });

  test("Stop between two calls answers the one that never ran, so the next turn is still sendable", async () => {
    const surface = new AgenticSurface();
    let running = false;
    let finishFirst: () => void = () => undefined;
    surface.registerTool([], {
      name: "first",
      run: () =>
        new Promise<string>((resolve) => {
          finishFirst = () => resolve("first done");
          running = true;
        }),
    });
    surface.registerTool([], { name: "second", run: () => "second done" });
    const { runner, requests } = scripted(
      [
        { type: "toolCall", id: "c1", name: "first", args: {} },
        { type: "toolCall", id: "c2", name: "second", args: {} },
        { type: "done", stop: "toolUse" },
      ],
      [
        { type: "text", delta: "ok" },
        { type: "done", stop: "end" },
      ],
    );
    const session = new AgentSession(surface, runner);
    const turn = session.send("do both");
    await until(() => running);
    session.abort();
    finishFirst();
    await turn;
    const results = session.messages.find((message) => message.role === "tool")?.toolResults;
    expect(results?.map((result) => result.id)).toEqual(["c1", "c2"]);
    expect(results?.[1].error).toBe(Transcript.unanswered);
    // Every dialect refuses an assistant message whose calls have no results, on this turn and on every later one.
    await session.send("carry on");
    const posted = requests[requests.length - 1].messages;
    const calls = posted.flatMap((message) => message.toolCalls ?? []).map((call) => call.id);
    const answers = posted.flatMap((message) => message.toolResults ?? []).map((result) => result.id);
    expect(calls.every((id) => answers.includes(id))).toBe(true);
  });

  test("Stop while the calls are still arriving leaves none of them unanswered", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], { name: "slow", run: () => "never reached" });
    let streaming = false;
    let finishTurn: () => void = () => undefined;
    const runner: AgentRunner = {
      async *run() {
        yield { type: "toolCall", id: "c1", name: "slow", args: {} };
        await new Promise<void>((resolve) => {
          finishTurn = resolve;
          streaming = true;
        });
        yield { type: "done", stop: "toolUse" };
      },
    };
    const session = new AgentSession(surface, runner);
    const turn = session.send("go");
    await until(() => streaming);
    session.abort();
    finishTurn();
    await turn;
    const answered = session.messages.flatMap((message) => message.toolResults ?? []);
    expect(session.messages.flatMap((message) => message.toolCalls ?? [])).toHaveLength(1);
    expect(answered).toEqual([{ id: "c1", name: "slow", error: Transcript.unanswered }]);
  });
});
