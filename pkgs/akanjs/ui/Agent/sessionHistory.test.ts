import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { ChatMessage, SessionHistory } from "use-agentic";

// The web-storage branch loads synchronously; only a host's own history may answer with a promise.
const stored = (history: SessionHistory | undefined): ChatMessage[] | null => {
  const loaded = history?.load() ?? null;
  if (loaded instanceof Promise) throw new Error("expected a synchronous web-storage load");
  return loaded;
};

let sessionHistoryOf: typeof import("./sessionHistory").sessionHistoryOf;

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "historytest";
  process.env.AKAN_PUBLIC_REPO_NAME = "historytest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  ({ sessionHistoryOf } = await import("./sessionHistory"));
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
    // Nothing restored answers a call the window cut away, and nothing restored is left unanswered.
    expect(answers.every((id) => calls.includes(id))).toBe(true);
    expect(calls.every((id) => answers.includes(id))).toBe(true);
    history.clear();
  });
});
