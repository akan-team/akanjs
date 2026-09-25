import { describe, expect, test } from "bun:test";
import { act } from "react";
import { AgenticSurface } from "./AgenticSurface";
import { AgentProvider } from "./AgentProvider";
import { AgentSession } from "./AgentSession";
import { mount } from "./test/mount";
import type { AgentRunner } from "./types";
import { useAgent } from "./useAgent";

describe("useAgent", () => {
  test("a provider with a runner holds one session and re-renders on its changes", async () => {
    const surface = new AgenticSurface();
    const runner: AgentRunner = {
      async *run() {
        yield { type: "text", delta: "Hello" };
        yield { type: "done", stop: "end" };
      },
    };
    let sendText: ((text: string) => Promise<void>) | null = null;
    const Chat = () => {
      const { messages, send, isRunning } = useAgent();
      sendText = send;
      return <output>{`${isRunning}:${messages.map((message) => message.text ?? "").join("|")}`}</output>;
    };
    const app = mount(
      <AgentProvider runner={runner} surface={surface}>
        <Chat />
      </AgentProvider>,
    );
    expect(app.container.textContent).toBe("false:");
    await act(async () => {
      await sendText?.("hi");
    });
    expect(app.container.textContent).toBe("false:hi|Hello");
    app.unmount();
  });

  test("a provider with a prebuilt session exposes the session's own surface", () => {
    const surface = new AgenticSurface();
    const runner: AgentRunner = {
      async *run() {
        yield { type: "done", stop: "end" };
      },
    };
    const session = new AgentSession(surface, runner);
    const seen: { surface: AgenticSurface | null } = { surface: null };
    const Probe = () => {
      seen.surface = useAgent().surface;
      return null;
    };
    const app = mount(
      <AgentProvider session={session}>
        <Probe />
      </AgentProvider>,
    );
    expect(seen.surface).toBe(surface);
    app.unmount();
  });
});
