import { afterEach, describe, expect, test } from "bun:test";
import { BuilderRpc } from "./builderRpc";
import type { BuilderMessage, BuilderResponse, BuildFrameworkPayload } from "./ipcTypes";

const originalSend = process.send;

const answerWith = (answer: (id: number) => BuilderResponse) => {
  const sent: BuilderMessage[] = [];
  process.send = ((message: BuilderMessage) => {
    sent.push(message);
    if ("id" in message) {
      const { id } = message;
      queueMicrotask(() => process.emit("message", answer(id), undefined));
    }
    return true;
  }) as unknown as typeof process.send;
  return sent;
};

afterEach(() => {
  process.send = originalSend;
});

describe("BuilderRpc", () => {
  test("asks the builder for the framework map and answers with what it sends back", async () => {
    const payload: BuildFrameworkPayload = { workspaceRoot: "/ws", framework: null };
    const sent = answerWith((id) => ({ type: "build-graph-res", id, ok: true, data: payload }));
    const rpc = new BuilderRpc();
    try {
      expect(await rpc.buildFramework()).toEqual(payload);
      expect(sent).toEqual([{ type: "build-graph", id: 1, framework: true }]);
    } finally {
      rpc.dispose();
    }
  });

  test("rejects with the builder's error when the framework map fails", async () => {
    answerWith((id) => ({ type: "build-graph-res", id, ok: false, error: "boom" }));
    const rpc = new BuilderRpc();
    try {
      await expect(rpc.buildFramework()).rejects.toThrow("[builder] build-graph-res failed: boom");
    } finally {
      rpc.dispose();
    }
  });
});
