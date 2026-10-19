import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import {
  AgenticSurface,
  type ChatMessage,
  type SessionHistory,
  type SurfaceSource,
  type SurfaceView,
} from "use-agentic";
import { setTestEnv } from "../testHelpers.fixture";

let sessionView: typeof import("./agentSessionOf").sessionView;
let sessionHistoryOf: typeof import("./agentSessionOf").sessionHistoryOf;

beforeAll(async () => {
  setTestEnv("historytest");
  ({ sessionView, sessionHistoryOf } = await import("./agentSessionOf"));
});

// The web-storage branch loads synchronously; only a host's own history may answer with a promise.
const stored = (history: SessionHistory | undefined): ChatMessage[] | null => {
  const loaded = history?.load() ?? null;
  if (loaded instanceof Promise) throw new Error("expected a synchronous web-storage load");
  return loaded;
};

const runtimeSource: SurfaceSource = {
  tools: () => [
    { name: "navigate", run: async () => "went" },
    { name: "goBack", run: async () => "back" },
    { name: "readScreen", run: async () => "screen" },
    { name: "readState", run: async () => "state" },
    { name: "highlight", run: async () => "lit" },
  ],
};

const named = (view: SurfaceView) => view.snapshot().tools.map((tool) => tool.name);

describe("sessionView", () => {
  let surface: AgenticSurface;

  beforeAll(() => {
    surface = new AgenticSurface();
    surface.addSource(runtimeSource);
  });

  test("takes every built-in by default, and hands back the scoped view untouched", () => {
    expect(named(sessionView(surface, []))).toEqual(["goBack", "highlight", "navigate", "readScreen", "readState"]);
    expect(sessionView(surface, [], true)).toBe(surface);
  });

  test("`false` withholds them from the listing and from a call that names one anyway", async () => {
    const view = sessionView(surface, [], false);
    expect(named(view)).toEqual([]);
    expect(view.tool("navigate")).toBeNull();
    expect(view.call("navigate")).rejects.toThrow("Unknown tool: navigate");
  });

  test("an array keeps exactly what it names", async () => {
    const view = sessionView(surface, [], ["readScreen", "readState"]);
    expect(named(view)).toEqual(["readScreen", "readState"]);
    expect(await view.call("readScreen")).toBe("screen");
    expect(view.call("goBack")).rejects.toThrow("Unknown tool: goBack");
  });

  test("a tool the screen declares under a built-in name survives, because it is not the runtime's", async () => {
    const own = new AgenticSurface();
    own.addSource(runtimeSource);
    own.registerTool([], { name: "navigate", description: "the app's own", run: async () => "app" });
    const view = sessionView(own, [], false);
    expect(named(view)).toEqual(["navigate"]);
    expect(await view.call("navigate")).toBe("app");
  });

  test("a root declaration does not rescue the built-in inside a zone that withheld it", () => {
    const own = new AgenticSurface();
    own.addSource(runtimeSource);
    own.registerTool([], { name: "navigate", run: async () => "root" });
    own.registerTool(["panel"], { name: "pick", run: async () => "picked" });
    const view = sessionView(own, ["panel"], false);
    expect(named(view)).toEqual(["panel.pick"]);
  });
});

describe("sessionHistoryOf", () => {
  test("round-trips through sessionStorage under an app-scoped key", () => {
    const history = sessionHistoryOf(true);
    if (!history) throw new Error("expected a history");
    const messages: ChatMessage[] = [{ role: "user", text: "hi" }];
    history.save(messages);
    expect(window.sessionStorage.getItem("akan.agent.historytest")).toContain('"hi"');
    expect(stored(history)).toEqual(messages);
    history.clear();
    expect(stored(history)).toBeNull();
  });

  test("a reference keeps its pointer and loses its value, so a restored chat re-reads instead of guessing", () => {
    const history = sessionHistoryOf(true, "refs");
    if (!history) throw new Error("expected a history");
    history.save([
      {
        role: "user",
        text: "make this more dynamic",
        references: [
          { refName: "videoCut", refId: "6a1f", label: "Cut 3", path: "cutFrames.2.content", value: "a wide shot" },
          { refName: "videoCharacter", refId: "c1", label: "Karina", value: { name: "Karina" } },
        ],
      },
    ]);
    const raw = window.sessionStorage.getItem("akan.agent.historytest.refs") ?? "";
    expect(raw).not.toContain("a wide shot");
    expect(raw).toContain("videoCut");
    const [message] = stored(history) ?? [];
    expect(message.references).toEqual([
      {
        refName: "videoCut",
        refId: "6a1f",
        label: "Cut 3",
        path: "cutFrames.2.content",
        note: "the conversation was restored from storage, which keeps what the user pointed at but not the value it held",
      },
      {
        refName: "videoCharacter",
        refId: "c1",
        label: "Karina",
        note: "the conversation was restored from storage, which keeps what the user pointed at but not the value it held",
      },
    ]);
  });

  test("a zone path keys its own entry, and local storage is the explicit opt-up", () => {
    const zone = sessionHistoryOf(true, "comments");
    zone?.save([{ role: "user", text: "zone" }]);
    expect(window.sessionStorage.getItem("akan.agent.historytest.comments")).toContain('"zone"');
    const local = sessionHistoryOf({ storage: "local" });
    local?.save([{ role: "user", text: "kept" }]);
    expect(window.localStorage.getItem("akan.agent.historytest")).toContain('"kept"');
    zone?.clear();
    local?.clear();
  });

  test("a stale version envelope is discarded instead of replayed", () => {
    window.sessionStorage.setItem("akan.agent.historytest", JSON.stringify({ v: 0, messages: [{ role: "user" }] }));
    const history = sessionHistoryOf(true);
    expect(stored(history)).toBeNull();
    window.sessionStorage.removeItem("akan.agent.historytest");
  });

  test("a host's own history is handed back untouched, cap and attachment stripping included", async () => {
    const saved: ChatMessage[][] = [];
    const own: SessionHistory = {
      load: async () => [{ role: "user", text: "from the server" }],
      save: (messages) => void saved.push([...messages]),
      clear: () => undefined,
    };
    const history = sessionHistoryOf(own, "server");
    expect(history).toBe(own);
    expect(await history?.load()).toEqual([{ role: "user", text: "from the server" }]);
    history?.save([{ role: "user", text: "kept whole" }]);
    expect(saved).toEqual([[{ role: "user", text: "kept whole" }]]);
    expect(window.sessionStorage.getItem("akan.agent.historytest.server")).toBeNull();
  });

  test("only the newest messages survive the cap", () => {
    const history = sessionHistoryOf(true, "cap");
    const many: ChatMessage[] = Array.from({ length: 60 }, (_, idx) => ({ role: "user", text: `m${idx}` }));
    history?.save(many);
    const loaded = stored(history);
    expect(loaded).toHaveLength(50);
    expect(loaded?.[0]?.text).toBe("m10");
    history?.clear();
  });

  test("attachment content is left out of storage while the name and a url stay", () => {
    const history = sessionHistoryOf(true, "attach");
    history?.save([
      {
        role: "user",
        text: "read these",
        attachments: [
          { name: "shot.png", mimeType: "image/png", data: "AAAA" },
          { name: "spec.pdf", mimeType: "application/pdf", text: "a very long extraction" },
          { name: "hosted.png", mimeType: "image/png", url: "https://cdn/hosted.png" },
          { name: "kept.png", mimeType: "image/png", data: "BBBB", ref: "file_42" },
        ],
      },
    ]);
    const raw = window.sessionStorage.getItem("akan.agent.historytest.attach") ?? "";
    expect(raw).not.toContain("AAAA");
    expect(raw).not.toContain("a very long extraction");
    expect(stored(history)?.[0]?.attachments).toEqual([
      { name: "shot.png", mimeType: "image/png" },
      { name: "spec.pdf", mimeType: "application/pdf" },
      { name: "hosted.png", mimeType: "image/png", url: "https://cdn/hosted.png" },
      { name: "kept.png", mimeType: "image/png", ref: "file_42" },
    ]);
    history?.clear();
  });

  test("a picture a tool returned is left out of storage the same way", () => {
    const history = sessionHistoryOf(true, "toolfile");
    history?.save([
      { role: "user", text: "what is she wearing?" },
      { role: "assistant", toolCalls: [{ id: "c1", name: "viewImage", args: { src: "/card.jpg" } }] },
      {
        role: "tool",
        toolResults: [
          {
            id: "c1",
            name: "viewImage",
            result: "Attached card.jpg",
            attachments: [{ name: "card.jpg", mimeType: "image/jpeg", data: "CCCC" }],
          },
        ],
      },
    ]);
    expect(window.sessionStorage.getItem("akan.agent.historytest.toolfile") ?? "").not.toContain("CCCC");
    expect(stored(history)?.[2]?.toolResults).toEqual([
      {
        id: "c1",
        name: "viewImage",
        result: "Attached card.jpg",
        attachments: [{ name: "card.jpg", mimeType: "image/jpeg" }],
      },
    ]);
    history?.clear();
  });

  test("persist off or no window answers undefined", () => {
    expect(sessionHistoryOf(undefined)).toBeUndefined();
    expect(sessionHistoryOf(false)).toBeUndefined();
  });

  test("the cap can cut a call from its result, so what is stored is repaired before it is stored", () => {
    const history = sessionHistoryOf(true, "capped");
    if (!history) throw new Error("expected a history");
    const long: ChatMessage[] = [];
    for (let at = 0; at < 60; at += 1)
      long.push(
        at % 2
          ? { role: "tool", toolResults: [{ id: `c${at}`, name: "bump", result: at }] }
          : { role: "assistant", toolCalls: [{ id: `c${at + 1}`, name: "bump", args: {} }] },
      );
    history.save(long);
    const kept = stored(history) ?? [];
    const calls = kept.flatMap((message) => message.toolCalls ?? []).map((call) => call.id);
    const answers = kept.flatMap((message) => message.toolResults ?? []).map((result) => result.id);
    expect(answers.every((id) => calls.includes(id))).toBe(true);
    expect(calls.every((id) => answers.includes(id))).toBe(true);
    history.clear();
  });
});
