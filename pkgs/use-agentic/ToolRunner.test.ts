import { describe, expect, test } from "bun:test";
import { AgenticSurface } from "./AgenticSurface";
import { AgentProgress } from "./AgentProgress";
import { type ToolProgress, ToolRunner } from "./ToolRunner";
import type { ToolActionEntry, ToolActivity, ToolCallRequest, ToolCardEntry, ToolEntry } from "./types";

const call = (name: string, args: Record<string, unknown> = {}, id = "c1"): ToolCallRequest => ({ id, name, args });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 200 && !predicate(); i += 1) await tick();
  if (!predicate()) throw new Error("condition never met");
};

const surfaceWith = (...entries: (Partial<ToolActionEntry> & { name: string })[]) => {
  const surface = new AgenticSurface();
  for (const entry of entries) surface.registerTool([], { run: () => undefined, ...entry });
  return surface;
};

const surfaceWithCard = (entry: Partial<ToolCardEntry> & { name: string; card: ToolCardEntry["card"] }) => {
  const surface = new AgenticSurface();
  surface.registerTool([], entry);
  return surface;
};

describe("ToolRunner approval", () => {
  test("a host that cannot ask refuses a tool that has to be asked about, and never runs it", async () => {
    let ran = 0;
    const surface = surfaceWith({
      name: "removeTask",
      confirm: true,
      run: () => {
        ran += 1;
      },
    });
    const runner = new ToolRunner(surface);
    const result = await runner.run(call("removeTask"), new AbortController().signal);
    expect(ran).toBe(0);
    expect(result.error).toContain("approval");
  });

  test("an approved call runs and a refused one becomes the tool's error result", async () => {
    let ran = 0;
    const surface = surfaceWith({
      name: "removeTask",
      confirm: "Really remove it?",
      run: () => {
        ran += 1;
        return "gone";
      },
    });
    const asked: string[] = [];
    const yes = new ToolRunner(surface, {
      approve: async (request) => {
        asked.push(request.message);
        return true;
      },
    });
    expect((await yes.run(call("removeTask"), new AbortController().signal)).result).toBe("gone");
    expect(asked).toEqual(["Really remove it?"]);
    const no = new ToolRunner(surface, { approve: async () => "The user declined." });
    expect((await no.run(call("removeTask"), new AbortController().signal)).error).toBe("The user declined.");
    expect(ran).toBe(1);
  });

  test("a tool nobody has to be asked about needs no approval host", async () => {
    const runner = new ToolRunner(surfaceWith({ name: "bump", run: () => "done" }));
    expect((await runner.run(call("bump"), new AbortController().signal)).result).toBe("done");
  });

  test("confirmMessage reads the entry's own verdict, arguments included", () => {
    const entry = (confirm: ToolEntry["confirm"]): ToolEntry => ({ name: "x", confirm, run: () => undefined });
    expect(ToolRunner.confirmMessage("x", entry(undefined), {})).toBeNull();
    expect(ToolRunner.confirmMessage("x", entry(false), {})).toBeNull();
    expect(ToolRunner.confirmMessage("x", entry(true), {})).toBe("Run x?");
    expect(ToolRunner.confirmMessage("x", entry("Sure?"), {})).toBe("Sure?");
    expect(
      ToolRunner.confirmMessage(
        "x",
        entry((args) => args.force === true),
        { force: true },
      ),
    ).toBe("Run x?");
    expect(
      ToolRunner.confirmMessage(
        "x",
        entry((args) => args.force === true),
        { force: false },
      ),
    ).toBeNull();
  });
});

describe("ToolRunner lookup", () => {
  test("an unknown name is a result rather than a throw, and a fallback answers it", async () => {
    const bare = new ToolRunner(surfaceWith({ name: "bump" }));
    expect((await bare.run(call("nope"), new AbortController().signal)).error).toBe("Unknown tool: nope");
    const asked: string[] = [];
    const withFallback = new ToolRunner(surfaceWith({ name: "bump" }), {
      fallback: (request) => {
        asked.push(request.name);
        return { id: request.id, name: request.name, result: "answered elsewhere" };
      },
    });
    expect((await withFallback.run(call("askUser"), new AbortController().signal)).result).toBe("answered elsewhere");
    expect(asked).toEqual(["askUser"]);
  });

  test("a registered tool of the same name shadows the fallback", async () => {
    const runner = new ToolRunner(surfaceWith({ name: "askUser", run: () => "the screen's own" }), {
      fallback: (request) => ({ id: request.id, name: request.name, result: "the built-in" }),
    });
    expect((await runner.run(call("askUser"), new AbortController().signal)).result).toBe("the screen's own");
  });

  test("a guard refusal is the tool's error result", async () => {
    const runner = new ToolRunner(surfaceWith({ name: "navigate", guard: () => "path must be internal." }));
    expect((await runner.run(call("navigate"), new AbortController().signal)).error).toBe("path must be internal.");
  });
});

describe("ToolRunner reporting", () => {
  test("settle runs after a changing call and before its report, and never after a read", async () => {
    let count = 0;
    const surface = new AgenticSurface();
    surface.registerResource([], { name: "count", read: () => count });
    surface.registerTool([], {
      name: "bump",
      run: () => {
        // The screen has not caught up yet: the change lands only once settle has been waited out.
        setTimeout(() => (count += 1), 0);
      },
    });
    surface.registerTool([], { name: "peek", settle: false, run: () => count });
    const settles: string[] = [];
    const runner = new ToolRunner(surface, {
      settle: async () => {
        settles.push("settled");
        await tick();
      },
    });
    const bumped = await runner.run(call("bump"), new AbortController().signal);
    expect(settles).toEqual(["settled"]);
    expect(bumped.changes).toEqual([{ name: "count", value: 1 }]);
    const peeked = await runner.run(call("peek"), new AbortController().signal);
    expect(settles).toEqual(["settled"]);
    expect(peeked.result).toBe(1);
  });

  test("a value past the ceiling is bounded before it leaves the runner", async () => {
    const runner = new ToolRunner(surfaceWith({ name: "readState", run: () => ({ video: "x".repeat(200_000) }) }));
    const result = await runner.run(call("readState"), new AbortController().signal);
    expect(String(result.result)).toContain("Truncated");
    expect(JSON.stringify(result).length).toBeLessThan(30_000);
  });

  test("progress rides with the call's own id and the clear only lands for that call", async () => {
    const surface = surfaceWith({
      name: "sync",
      run: () => {
        AgentProgress.report("halfway", { done: 1, total: 2 });
      },
    });
    const seen: ToolProgress[] = [];
    const runner = new ToolRunner(surface, { progress: (progress) => seen.push(progress) });
    await runner.run(call("sync", {}, "call-7"), new AbortController().signal);
    expect(seen).toEqual([
      { callId: "call-7", report: { message: "halfway", done: 1, total: 2 } },
      { callId: "call-7", report: null },
    ]);
  });
});

describe("ToolRunner serialization", () => {
  test("two runners never have a call in flight at the same time", async () => {
    const trace: string[] = [];
    const slow = (name: string) =>
      new ToolRunner(
        surfaceWith({
          name,
          run: async () => {
            trace.push(`${name} in`);
            await tick();
            await tick();
            trace.push(`${name} out`);
          },
        }),
      );
    const signal = new AbortController().signal;
    // Started together on purpose: the module slots `AgentAbort` and `AgentProgress` use cannot tell two
    // overlapping calls apart, so the queue is what keeps the invariant they assume.
    await Promise.all([slow("a").run(call("a"), signal), slow("b").run(call("b"), signal)]);
    expect(trace).toEqual(["a in", "a out", "b in", "b out"]);
  });

  test("an approval parked in front of the user does not hold the queue", async () => {
    let decide = null as ((verdict: true | string) => void) | null;
    const gated = new ToolRunner(surfaceWith({ name: "removeTask", confirm: true }), {
      approve: () => new Promise<true | string>((resolve) => (decide = resolve)),
    });
    const free = new ToolRunner(surfaceWith({ name: "bump", run: () => "bumped" }));
    const signal = new AbortController().signal;
    const parked = gated.run(call("removeTask"), signal);
    await until(() => !!decide);
    expect((await free.run(call("bump"), signal)).result).toBe("bumped");
    decide?.("The user declined.");
    expect((await parked).error).toBe("The user declined.");
  });

  test("a call aborted while it waited in the queue never starts", async () => {
    let release: () => void = () => undefined;
    const busy = new ToolRunner(
      surfaceWith({ name: "wait", run: () => new Promise<void>((resolve) => (release = resolve)) }),
    );
    let ran = 0;
    const queued = new ToolRunner(
      surfaceWith({
        name: "removeTask",
        run: () => {
          ran += 1;
        },
      }),
    );
    const first = busy.run(call("wait"), new AbortController().signal);
    await tick();
    const controller = new AbortController();
    const second = queued.run(call("removeTask"), controller.signal);
    controller.abort();
    release();
    await first;
    expect((await second).error).toBe("The call was stopped before it ran.");
    expect(ran).toBe(0);
  });

  test("an approval covers the tool the user read, not one the screen put in its place meanwhile", async () => {
    let decide = null as ((verdict: true | string) => void) | null;
    const surface = new AgenticSurface();
    let ran = "";
    const unregister = surface.registerTool([], {
      name: "removeTask",
      description: "Remove one task.",
      confirm: true,
      run: () => {
        ran = "first";
      },
    });
    const runner = new ToolRunner(surface, {
      approve: () => new Promise<true | string>((resolve) => (decide = resolve)),
    });
    const parked = runner.run(call("removeTask"), new AbortController().signal);
    await until(() => !!decide);
    unregister();
    surface.registerTool([], {
      name: "removeTask",
      description: "Remove every task in the project.",
      confirm: true,
      run: () => {
        ran = "second";
      },
    });
    decide?.(true);
    expect((await parked).error).toContain("changed on screen");
    expect(ran).toBe("");
  });

  // A list registers one declaration per row, and a row mounting while the user decides is a live insert, not a
  // different action: every registration takes the id as an argument, so the one the user approved still applies.
  test("an approval survives another row registering the same declaration while the user decides", async () => {
    let decide = null as ((verdict: true | string) => void) | null;
    const surface = new AgenticSurface();
    const removed: unknown[] = [];
    const row = (): ToolActionEntry => ({
      name: "removeTask",
      description: "Remove one task.",
      parameters: { type: "object", properties: { modelId: { type: "string" } }, required: ["modelId"] },
      confirm: true,
      run: (args) => {
        removed.push(args.modelId);
      },
    });
    surface.registerTool([], row());
    const runner = new ToolRunner(surface, {
      approve: () => new Promise<true | string>((resolve) => (decide = resolve)),
    });
    const parked = runner.run(call("removeTask", { modelId: "t1" }), new AbortController().signal);
    await until(() => !!decide);
    surface.registerTool([], row());
    decide?.(true);
    expect((await parked).error).toBeUndefined();
    expect(removed).toEqual(["t1"]);
  });

  test("an approval does not carry over to a declaration that asks something else for the same arguments", async () => {
    let decide = null as ((verdict: true | string) => void) | null;
    const surface = new AgenticSurface();
    let ran = 0;
    const declaration = (message: string): ToolActionEntry => ({
      name: "removeTask",
      description: "Remove one task.",
      confirm: () => message,
      run: () => {
        ran += 1;
      },
    });
    const unregister = surface.registerTool([], declaration("Remove the draft?"));
    const runner = new ToolRunner(surface, {
      approve: () => new Promise<true | string>((resolve) => (decide = resolve)),
    });
    const parked = runner.run(call("removeTask"), new AbortController().signal);
    await until(() => !!decide);
    unregister();
    surface.registerTool([], declaration("Remove the published task?"));
    decide?.(true);
    expect((await parked).error).toContain("changed on screen");
    expect(ran).toBe(0);
  });

  test("an aborted call releases the queue instead of jamming it", async () => {
    const stuck = new ToolRunner(surfaceWith({ name: "wait", run: () => new Promise<void>(() => undefined) }));
    const controller = new AbortController();
    const hanging = stuck.run(call("wait"), controller.signal);
    await tick();
    controller.abort();
    expect((await hanging).error).toContain("aborted");
    const after = new ToolRunner(surfaceWith({ name: "bump", run: () => "bumped" }));
    expect((await after.run(call("bump"), new AbortController().signal)).result).toBe("bumped");
  });
});

describe("ToolRunner activity", () => {
  const recorded = (host: Partial<ConstructorParameters<typeof ToolRunner>[1]> = {}) => {
    const events: string[] = [];
    return {
      events,
      host: { ...host, activity: (event: ToolActivity) => void events.push(`${event.phase}:${event.name}`) },
    };
  };

  test("a call announces itself starting and ending, with the arguments it was made with", async () => {
    const seen: ToolActivity[] = [];
    const surface = surfaceWith({ name: "submitTask", run: () => "done" });
    const runner = new ToolRunner(surface, { activity: (event) => void seen.push(event) });
    await runner.run(call("submitTask", { id: "7" }), new AbortController().signal);
    expect(seen.map((event) => event.phase)).toEqual(["start", "end"]);
    expect(seen[0]).toMatchObject({ callId: "c1", name: "submitTask", args: { id: "7" } });
    expect(seen[1].error).toBeUndefined();
  });

  test("a call that threw ends with the reason, so a host can draw the failure it caused", async () => {
    const surface = surfaceWith({
      name: "submitTask",
      run: () => {
        throw new Error("the server said no");
      },
    });
    const seen: ToolActivity[] = [];
    const runner = new ToolRunner(surface, { activity: (event) => void seen.push(event) });
    await runner.run(call("submitTask"), new AbortController().signal);
    expect(seen[1]).toMatchObject({ phase: "end", error: "the server said no" });
  });

  // Drawing one would say the agent is doing something to the page at the moment the user turned it down.
  test("nothing is announced for a call an approval or a guard turned back", async () => {
    const declined = recorded({ approve: async () => "no thanks" });
    const surface = surfaceWith({ name: "removeTask", confirm: true });
    await new ToolRunner(surface, declined.host).run(call("removeTask"), new AbortController().signal);
    expect(declined.events).toEqual([]);

    const unknown = recorded();
    await new ToolRunner(surfaceWith({ name: "other" }), unknown.host).run(
      call("nothingHere"),
      new AbortController().signal,
    );
    expect(unknown.events).toEqual([]);
  });

  // Drawing a click on the link a navigation is about to follow only works if the click lands first: the router
  // replaces the tree the link is in, so the element would already be gone by the time the pointer arrived.
  test("the start is awaited, so a host may draw something the call would otherwise outrun", async () => {
    const order: string[] = [];
    const surface = surfaceWith({
      name: "navigate",
      run: () => {
        order.push("ran");
        return "gone";
      },
    });
    const runner = new ToolRunner(surface, {
      activity: async (event) => {
        if (event.phase !== "start") return;
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push("drew");
      },
    });
    await runner.run(call("navigate"), new AbortController().signal);
    expect(order).toEqual(["drew", "ran"]);
  });

  test("a declaration swapped in while the start is drawn never runs in place of the approved one", async () => {
    const surface = new AgenticSurface();
    let ran = "";
    const seen: ToolActivity[] = [];
    const unregister = surface.registerTool([], {
      name: "removeTask",
      description: "Remove one task.",
      confirm: true,
      run: () => {
        ran = "approved";
      },
    });
    const runner = new ToolRunner(surface, {
      approve: async () => true,
      activity: (event) => {
        seen.push(event);
        if (event.phase !== "start") return;
        unregister();
        surface.registerTool([], {
          name: "removeTask",
          description: "Remove every task in the project.",
          confirm: true,
          run: () => {
            ran = "swapped";
          },
        });
      },
    });
    const result = await runner.run(call("removeTask"), new AbortController().signal);
    expect(result.error).toContain("changed on screen");
    expect(ran).toBe("");
    expect(seen.map((event) => event.phase)).toEqual(["start", "end"]);
    expect(seen[1].error).toContain("changed on screen");
  });

  test("a call that needed no asking does not run a declaration swapped in that would have asked", async () => {
    const surface = new AgenticSurface();
    let ran = "";
    const unregister = surface.registerTool([], {
      name: "archiveTasks",
      description: "Archive the tasks.",
      run: () => {
        ran = "unasked";
      },
    });
    const runner = new ToolRunner(surface, {
      approve: async () => true,
      activity: (event) => {
        if (event.phase !== "start") return;
        unregister();
        surface.registerTool([], {
          name: "archiveTasks",
          description: "Archive the tasks.",
          confirm: true,
          run: () => {
            ran = "asking";
          },
        });
      },
    });
    const result = await runner.run(call("archiveTasks"), new AbortController().signal);
    expect(result.error).toContain("changed on screen");
    expect(ran).toBe("");
  });

  // A guard runs inside `surface.call`, so the call has begun by then — the start is honest and the end carries why.
  test("a guard's refusal is an announced call that failed", async () => {
    const seen: ToolActivity[] = [];
    const surface = surfaceWith({ name: "navigate", guard: () => "path must be internal." });
    await new ToolRunner(surface, { activity: (event) => void seen.push(event) }).run(
      call("navigate"),
      new AbortController().signal,
    );
    expect(seen.map((event) => event.phase)).toEqual(["start", "end"]);
    expect(seen[1].error).toBe("path must be internal.");
  });
});

describe("ToolRunner cards", () => {
  const rendered = (entry: Parameters<typeof surfaceWithCard>[0]) => {
    const surface = surfaceWithCard(entry);
    return new ToolRunner(surface, {
      card: (request) =>
        new Promise((resolve) => {
          request.render({
            args: request.args,
            submit: (result) => resolve({ result }),
            cancel: (reason) => resolve({ error: reason ?? "The user closed the card." }),
          });
        }),
    });
  };

  test("a card tool parks instead of running, and what the card submits is the call's result", async () => {
    const runner = rendered({
      name: "collectContact",
      card: ({ submit }) => {
        submit({ name: "Bora", phone: "010-0000-0000" });
        return null;
      },
    });
    const result = await runner.run(call("collectContact"), new AbortController().signal);
    expect(result.result).toEqual({ name: "Bora", phone: "010-0000-0000" });
    expect(result.error).toBeUndefined();
  });

  test("the card's own cancel is the refusal the model reads", async () => {
    const runner = rendered({
      name: "collectContact",
      card: ({ cancel }) => {
        cancel("The user would rather not say.");
        return null;
      },
    });
    const result = await runner.run(call("collectContact"), new AbortController().signal);
    expect(result.result).toBeUndefined();
    expect(result.error).toBe("The user would rather not say.");
  });

  test("a host with nowhere to render one refuses the call instead of answering it itself", async () => {
    let drawn = 0;
    const surface = surfaceWithCard({
      name: "collectContact",
      card: () => {
        drawn += 1;
        return null;
      },
    });
    const result = await new ToolRunner(surface).run(call("collectContact"), new AbortController().signal);
    expect(drawn).toBe(0);
    expect(result.error).toContain("answered by the user");
  });

  test("a guard's refusal is answered without ever drawing the card", async () => {
    let drawn = 0;
    const runner = rendered({
      name: "collectContact",
      guard: () => "This screen is not asking for a contact.",
      card: () => {
        drawn += 1;
        return null;
      },
    });
    const result = await runner.run(call("collectContact"), new AbortController().signal);
    expect(drawn).toBe(0);
    expect(result.error).toBe("This screen is not asking for a contact.");
  });

  // The same property an approval has, and for the same reason: a form parked in front of somebody is not work,
  // so holding the execution lock across it would freeze every other agent on the page behind one unanswered card.
  test("a card waiting on the user does not hold the queue against another runner", async () => {
    const parked = surfaceWithCard({ name: "collectContact", card: () => null });
    const waiting = new ToolRunner(parked, { card: () => new Promise<never>(() => {}) });
    void waiting.run(call("collectContact"), new AbortController().signal);
    await tick();
    const other = new ToolRunner(surfaceWith({ name: "bump", run: () => "done" }));
    expect((await other.run(call("bump", {}, "c2"), new AbortController().signal)).result).toBe("done");
  });
});
