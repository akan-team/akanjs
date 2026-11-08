import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import type { AgentRunner, AgentSession, ChatMessage, RunnerRequest } from "use-agentic";
import { l, mount, setTestEnv } from "../testHelpers.fixture";

let Zone: typeof import("./Zone").Zone;
let History: typeof import("./History").History;
let st: typeof import("akanjs/store").st;
let useAgent: typeof import("use-agentic").useAgent;

beforeAll(async () => {
  setTestEnv("zonetest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }), fetch: {} });
  ({ Zone } = await import("./Zone"));
  ({ History } = await import("./History"));
  ({ st } = await import("akanjs/store"));
  ({ useAgent } = await import("use-agentic"));
});

const runnerOf = (reply: string, seen: RunnerRequest[]): AgentRunner => ({
  async *run(request) {
    seen.push(request);
    yield { type: "text", delta: reply };
    yield { type: "done", stop: "end" };
  },
});

describe("Agent.Zone", () => {
  test("two zones run parallel sessions, each reading only its own subtree", async () => {
    const seenA: RunnerRequest[] = [];
    const seenB: RunnerRequest[] = [];
    const sessions: Record<string, AgentSession> = {};
    const Probe = ({ name }: { name: string }) => {
      sessions[name] = useAgent();
      return null;
    };
    const ApproveTool = () => {
      st.tool("approveComment")
        .desc("Approve one comment.")
        .exec(() => undefined);
      return <p>comment queue text</p>;
    };
    const PublishTool = () => {
      st.tool("publishPost")
        .desc("Publish one post.")
        .exec(() => undefined);
      return <p>post editor text</p>;
    };
    const { unmount } = mount(
      <>
        <Zone id="comments" instructions="Comment zone rules." runner={runnerOf("A", seenA)}>
          <ApproveTool />
          <Probe name="comments" />
        </Zone>
        <Zone id="posts" runner={runnerOf("B", seenB)}>
          <PublishTool />
          <Probe name="posts" />
        </Zone>
      </>,
    );
    expect(sessions.comments).toBeDefined();
    expect(sessions.posts).toBeDefined();
    expect(sessions.comments).not.toBe(sessions.posts);

    await act(async () => {
      await Promise.all([sessions.comments.send("check the queue"), sessions.posts.send("draft status?")]);
    });
    const toolsA = seenA[0].tools.map((tool) => tool.name);
    const toolsB = seenB[0].tools.map((tool) => tool.name);
    expect(toolsA).toContain("comments.approveComment");
    expect(toolsA).not.toContain("posts.publishPost");
    expect(toolsB).toContain("posts.publishPost");
    expect(toolsB).not.toContain("comments.approveComment");
    expect(seenA[0].instructions).toContain("Comment zone rules.");
    expect(seenB[0].instructions ?? "").not.toContain("Comment zone rules.");
    expect(sessions.comments.messages.at(-1)?.text).toBe("A");
    expect(sessions.posts.messages.at(-1)?.text).toBe("B");

    const screenA = (await sessions.comments.surface.call("readScreen")) as string;
    expect(screenA).toContain("comment queue text");
    expect(screenA).not.toContain("post editor text");
    unmount();
  });

  test("builtins narrows what the runtime contributes to this zone, and only to this zone", async () => {
    const penned: RunnerRequest[] = [];
    const roaming: RunnerRequest[] = [];
    const sessions: Record<string, AgentSession> = {};
    const Probe = ({ name }: { name: string }) => {
      sessions[name] = useAgent();
      return null;
    };
    const { unmount } = mount(
      <>
        <Zone builtins={["readScreen", "readState"]} id="wizard" runner={runnerOf("A", penned)}>
          <Probe name="wizard" />
        </Zone>
        <Zone id="free" runner={runnerOf("B", roaming)}>
          <Probe name="free" />
        </Zone>
      </>,
    );
    await act(async () => {
      await Promise.all([sessions.wizard.send("stay"), sessions.free.send("go")]);
    });
    const penTools = penned[0].tools.map((tool) => tool.name);
    expect(penTools).toContain("readScreen");
    expect(penTools).not.toContain("navigate");
    expect(penTools).not.toContain("goBack");
    expect(sessions.wizard.surface.call("navigate", { path: "/elsewhere" })).rejects.toThrow("Unknown tool");
    expect(roaming[0].tools.map((tool) => tool.name)).toContain("navigate");
    unmount();
  });

  test("Agent.History backs the zone's transcript with the app's own store, from a leaf inside it", async () => {
    const seen: RunnerRequest[] = [];
    const saved: ChatMessage[][] = [];
    const held: { session: AgentSession | null } = { session: null };
    const Probe = () => {
      held.session = useAgent();
      return null;
    };
    const { unmount } = mount(
      <Zone id="draft" runner={runnerOf("A", seen)}>
        <History
          clear={() => undefined}
          load={() => [{ role: "user", text: "from an earlier visit" }]}
          save={(messages) => void saved.push([...messages])}
        />
        <Probe />
      </Zone>,
    );
    expect(held.session?.messages.map((message) => message.text)).toEqual(["from an earlier visit"]);
    await act(async () => {
      await held.session?.send("and now?");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(saved.at(-1)?.map((message) => message.text)).toEqual(["from an earlier visit", "and now?", "A"]);
    unmount();
  });

  test("a session the app hands in is used as-is and survives the zone that rendered it", async () => {
    const seen: RunnerRequest[] = [];
    const lib = await import("use-agentic");
    const { agentSessionOf } = await import("./agentSessionOf");
    const own = agentSessionOf({ l: (key) => key, view: ["held"], runner: runnerOf("A", seen) });
    const handed: AgentSession[] = [];
    const Probe = () => {
      handed.push(useAgent());
      return null;
    };
    const { unmount } = mount(
      <lib.AgentProvider surface={lib.AgenticSurface.shared}>
        <Zone id="held" onSession={(session) => handed.push(session)} session={own}>
          <Probe />
        </Zone>
      </lib.AgentProvider>,
    );
    expect(handed.length).toBeGreaterThan(1);
    expect(handed.every((session) => session === own)).toBe(true);
    unmount();
    await act(async () => {
      await own.send("still usable");
    });
    expect(own.messages.at(-1)?.text).toBe("A");
  });
});

describe("Agent.Zone account change", () => {
  const jwtOf = (sub: string) => `x.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.y`;
  const signIn = (sub: string | null) =>
    Object.defineProperty(document, "cookie", {
      get: () => (sub ? `__Host-jwt:zonetest=${jwtOf(sub)}` : ""),
      configurable: true,
    });
  const appHistory = () => {
    const state = { cleared: 0 };
    const history = {
      load: (): ChatMessage[] => [{ role: "user", text: "from u1" }],
      save: () => undefined,
      clear: () => {
        state.cleared += 1;
      },
    };
    return { state, history };
  };

  test("resets the zone's own conversation and leaves a session or history the app passed alone", async () => {
    const lib = await import("use-agentic");
    const owned = appHistory();
    const passed = appHistory();
    const own = new lib.AgentSession(lib.AgenticSurface.shared, runnerOf("A", []), { history: passed.history });
    const held: { owned?: AgentSession } = {};
    const Probe = () => {
      held.owned = useAgent();
      return null;
    };
    signIn("u1");
    const { unmount } = mount(
      <>
        <Zone id="ownedHistory" persist={owned.history} runner={runnerOf("A", [])}>
          <Probe />
        </Zone>
        <Zone id="passedSession" session={own}>
          <p>passed</p>
        </Zone>
      </>,
    );
    expect(held.owned?.messages.map((message) => message.text)).toEqual(["from u1"]);
    signIn("u2");
    await act(async () => {
      window.dispatchEvent(new Event("akan:auth"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(held.owned?.messages).toEqual([]);
    expect(own.messages.map((message) => message.text)).toEqual(["from u1"]);
    expect([owned.state.cleared, passed.state.cleared]).toEqual([0, 0]);
    unmount();
    signIn(null);
  });
});
