import { describe, expect, test } from "bun:test";
import { Logger } from "akanjs/common";
import { markFailureLogged } from "../common/loggedFailure";
import { RscRenderFallbacks } from "./rscRenderFallbacks";

const answer = async (error: unknown) => {
  const logger = new Logger("RscRenderFallbacksTest");
  const errors: string[] = [];
  logger.error = (line: unknown) => void errors.push(String(line));
  const sent: unknown[] = [];
  const fallbacks = new RscRenderFallbacks((message) => sent.push(message), {
    logger,
    stats: {},
    clientManifest: () => ({}),
    runInRequestScope: async (_request: Request, fn: () => Promise<boolean>) => await fn(),
  } as unknown as ConstructorParameters<typeof RscRenderFallbacks>[1]);
  await fallbacks.answerThrown(
    { requestId: "r1", url: "http://localhost/broken" },
    { url: null, match: null, request: null },
    error,
  );
  return { errors, sent };
};

describe("RscRenderFallbacks.answerThrown", () => {
  test("writes the render failure line only when no request line has logged the error", async () => {
    const untold = await answer(new TypeError("render broke"));
    expect(untold.errors).toHaveLength(1);
    expect(untold.errors[0]).toContain("render[r1] failed url=http://localhost/broken: TypeError: render broke");
    expect(untold.sent).toEqual([{ type: "error", requestId: "r1", message: "render broke" }]);

    const logged = new TypeError("render broke");
    markFailureLogged(logged);
    const told = await answer(logged);
    expect(told.errors).toEqual([]);
    expect(told.sent).toEqual([{ type: "error", requestId: "r1", message: "render broke" }]);
  });
});
