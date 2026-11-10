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

  test("marks a failure the dev host answered because no builder was there, and reads any other as a failed build", async () => {
    const kinds = new Map<number, string>([
      [1, "unavailable"],
      [3, "from-a-newer-host"],
    ]);
    answerWith(
      (id) =>
        ({
          type: "build-graph-res",
          id,
          ok: false,
          error: "builder is stopped; reload after the builder is ready",
          ...(kinds.has(id) ? { kind: kinds.get(id) } : {}),
        }) as BuilderResponse,
    );
    const rpc = new BuilderRpc();
    try {
      const errors: unknown[] = [];
      for (let idx = 0; idx < 3; idx++) errors.push(await rpc.buildGraph().catch((error: unknown) => error));
      expect(errors.map((error) => BuilderRpc.isUnavailable(error))).toEqual([true, false, false]);
      expect(errors.map((error) => BuilderRpc.isTimeout(error))).toEqual([false, false, false]);
      for (const error of errors)
        expect((error as Error).message).toBe(
          "[builder] build-graph-res failed: builder is stopped; reload after the builder is ready",
        );
    } finally {
      rpc.dispose();
    }
  });
});
