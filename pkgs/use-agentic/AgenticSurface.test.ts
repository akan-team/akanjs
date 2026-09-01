import { describe, expect, test } from "bun:test";
import { AgenticSurface } from "./AgenticSurface";
import type { ToolEntry } from "./types";

const tool = (name: string, extra: Partial<ToolEntry> = {}): ToolEntry => ({
  name,
  run: () => `ran-${name}`,
  ...extra,
});

describe("AgenticSurface", () => {
  test("scoped names are folded into the MCP-safe charset", () => {
    const surface = new AgenticSurface();
    surface.registerTool(["scene:abc/1"], tool("delete"));
    expect(surface.snapshot().tools.map((entry) => entry.name)).toEqual(["scene-abc-1.delete"]);
  });

  test("the newest registration wins and unregistering restores the previous one", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], tool("pick", { run: () => "first" }));
    const off = surface.registerTool([], tool("pick", { run: () => "second" }));
    expect(await surface.call("pick")).toBe("second");
    off();
    expect(await surface.call("pick")).toBe("first");
    expect(surface.snapshot().tools).toHaveLength(1);
  });

  test("one description repeats without warning, and a second description under that name clashes", async () => {
    const surface = new AgenticSurface();
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      surface.registerTool([], tool("removeTask", { description: "Remove one task." }));
      surface.registerTool([], tool("removeTask", { description: "Remove one task.", run: () => "newest" }));
      expect(warnings).toEqual([]);
      expect(await surface.call("removeTask")).toBe("newest");
      expect(surface.snapshot().tools).toHaveLength(1);

      surface.registerTool([], tool("removeTask", { description: "Archive one task." }));
      expect(warnings).toHaveLength(1);
    } finally {
      console.warn = warn;
    }
  });

  test("a guard refusal throws its reason instead of running", async () => {
    const surface = new AgenticSurface();
    let ran = false;
    surface.registerTool(
      [],
      tool("gated", {
        guard: () => "the scene no longer exists",
        run: () => {
          ran = true;
        },
      }),
    );
    await expect(surface.call("gated")).rejects.toThrow("the scene no longer exists");
    expect(ran).toBe(false);
  });

  test("an unknown tool or resource is refused by name", async () => {
    const surface = new AgenticSurface();
    await expect(surface.call("nope")).rejects.toThrow("Unknown tool: nope");
    expect(() => surface.read("nope")).toThrow("Unknown resource: nope");
  });

  test("call passes named arguments through and awaits the result", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], tool("echo", { run: async (args) => args.value }));
    expect(await surface.call("echo", { value: 42 })).toBe(42);
  });

  test("a hook registration shadows a source entry of the same name", async () => {
    const surface = new AgenticSurface();
    surface.addSource({ tools: () => [tool("createUser", { run: () => "source" })] });
    expect(await surface.call("createUser")).toBe("source");
    surface.registerTool([], tool("createUser", { run: () => "hook" }));
    expect(await surface.call("createUser")).toBe("hook");
    expect(surface.snapshot().tools.filter((entry) => entry.name === "createUser")).toHaveLength(1);
  });

  test("removing a source removes its entries and unsubscribes it", () => {
    const surface = new AgenticSurface();
    let listener: (() => void) | null = null;
    const remove = surface.addSource({
      tools: () => [tool("fromSource")],
      subscribe: (fn) => {
        listener = fn;
        return () => {
          listener = null;
        };
      },
    });
    expect(surface.snapshot().tools).toHaveLength(1);
    expect(listener).not.toBeNull();
    remove();
    expect(surface.snapshot().tools).toHaveLength(0);
    expect(listener).toBeNull();
  });

  test("snapshot publishes declaration data, sorted, with values read and errors captured", () => {
    const surface = new AgenticSurface();
    surface.registerTool(
      [],
      tool("b", { description: "B", parameters: { type: "object" }, settle: false, confirm: true }),
    );
    surface.registerTool([], tool("a"));
    surface.registerResource([], { name: "ok", read: () => 42 });
    surface.registerResource([], {
      name: "boom",
      read: () => {
        throw new Error("masked");
      },
    });
    const snapshot = surface.snapshot();
    expect(snapshot.tools.map((entry) => entry.name)).toEqual(["a", "b"]);
    expect(snapshot.tools[1]).toEqual({
      name: "b",
      description: "B",
      parameters: { type: "object" },
      needsConfirm: true,
    });
    expect(snapshot.tools[0].needsConfirm).toBe(false);
    expect(snapshot.resources.find((entry) => entry.name === "ok")?.value).toBe(42);
    expect(snapshot.resources.find((entry) => entry.name === "boom")?.error).toBe("masked");
  });

  test("scopes publish their joined path, label, and kind", () => {
    const surface = new AgenticSurface();
    const parent = AgenticSurface.childPath([], "task-list");
    surface.openScope([], { id: "task-list", kind: "task" });
    surface.openScope(parent, { id: "t:1", label: "Fix login" });
    expect(surface.snapshot().scopes).toEqual([
      { path: "task-list", kind: "task" },
      { path: "task-list.t-1", label: "Fix login" },
    ]);
  });

  test("diffSince reports changed, added, and removed resources and skips report:false", () => {
    const surface = new AgenticSurface();
    let count = 0;
    let noisy = 0;
    surface.registerResource([], { name: "count", read: () => count });
    surface.registerResource([], { name: "noisy", report: false, read: () => noisy });
    surface.registerResource([], { name: "same", read: () => ({ stable: true }) });
    const offGone = surface.registerResource([], { name: "gone", read: () => "x" });
    const before = surface.snapshot();
    count = 1;
    noisy = 99;
    offGone();
    surface.registerResource([], { name: "fresh", read: () => "new" });
    const diffs = surface.diffSince(before);
    expect(diffs).toContainEqual({ name: "count", value: 1 });
    expect(diffs).toContainEqual({ name: "fresh", value: "new" });
    expect(diffs).toContainEqual({ name: "gone", removed: true });
    expect(diffs.find((diff) => diff.name === "noisy")).toBeUndefined();
    expect(diffs.find((diff) => diff.name === "same")).toBeUndefined();
  });

  test("guides stack in registration order and unregister cleanly", () => {
    const surface = new AgenticSurface();
    const offOuter = surface.registerGuide([], "Outer guidance.");
    surface.registerGuide([], "Inner guidance.");
    expect(surface.snapshot().guides).toEqual(["Outer guidance.", "Inner guidance."]);
    offOuter();
    expect(surface.snapshot().guides).toEqual(["Inner guidance."]);
  });

  test("registrations notify subscribers", () => {
    const surface = new AgenticSurface();
    let notified = 0;
    surface.subscribe(() => {
      notified += 1;
    });
    const off = surface.registerTool([], tool("ping"));
    off();
    expect(notified).toBe(2);
  });
});

describe("AgenticSurface views", () => {
  test("a zone view reads its own subtree; the root keeps reading everything", async () => {
    const surface = new AgenticSurface();
    surface.registerTool([], tool("rootPick"));
    surface.registerTool(["comments"], tool("approve"));
    surface.registerTool(["posts"], tool("publish"));
    surface.addSource({ tools: (view) => (view?.length ? [tool("zoneOnly")] : [tool("global")]) });
    const view = surface.view(["comments"]);
    expect(view.snapshot().tools.map((entry) => entry.name)).toEqual(["comments.approve", "zoneOnly"]);
    expect(surface.snapshot().tools.map((entry) => entry.name)).toEqual([
      "comments.approve",
      "global",
      "posts.publish",
      "rootPick",
    ]);
    expect(await view.call("comments.approve")).toBe("ran-approve");
    await expect(view.call("posts.publish")).rejects.toThrow("Unknown tool");
    await expect(view.call("rootPick")).rejects.toThrow("Unknown tool");
  });

  test("guides follow the layout cascade — ancestors and own apply, siblings never do", () => {
    const surface = new AgenticSurface();
    surface.registerGuide([], "App-wide.");
    surface.registerGuide(["comments"], "Comment rules.");
    surface.registerGuide(["posts"], "Post rules.");
    expect(surface.view(["comments"]).snapshot().guides).toEqual(["App-wide.", "Comment rules."]);
    expect(surface.snapshot().guides).toEqual(["App-wide.", "Comment rules.", "Post rules."]);
  });

  test("a zone view reads and diffs only its own resources", () => {
    const surface = new AgenticSurface();
    let count = 1;
    surface.registerResource(["comments"], { name: "count", read: () => count });
    const view = surface.view(["comments"]);
    expect(view.read("comments.count")).toBe(1);
    expect(() => surface.view(["posts"]).read("comments.count")).toThrow("Unknown resource");
    const before = view.snapshot();
    count = 2;
    expect(view.diffSince(before)).toEqual([{ name: "comments.count", value: 2 }]);
  });

  test("a zone scope entry stays visible in its own view's snapshot", () => {
    const surface = new AgenticSurface();
    surface.openScope([], { id: "comments", label: "Comments", kind: "zone" });
    surface.openScope(["comments"], { id: "thread-1" });
    surface.openScope([], { id: "posts" });
    expect(
      surface
        .view(["comments"])
        .snapshot()
        .scopes.map((scope) => scope.path),
    ).toEqual(["comments", "comments.thread-1"]);
  });
});
