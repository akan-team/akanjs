import { describe, expect, mock, test } from "bun:test";
import { Logger } from "akanjs/common";
import { RequestTrace } from "../signal/requestTrace";
import { runTraced, SignalTrace } from "../signal/trace";
import { ForwardedError, type SerializedError } from "./forwardedError";

interface FlightOptions {
  onError: (error: unknown) => string | undefined;
}

const thrown: unknown[] = [];
mock.module("react-server-dom-webpack/server.node", () => ({
  renderToReadableStream: async (_element: unknown, _manifest: unknown, options: FlightOptions) => {
    for (const error of thrown) options.onError(error);
    return {
      getReader: () => ({
        read: async () => ({ done: true, value: undefined }),
        cancel: async () => undefined,
        releaseLock: () => undefined,
      }),
    };
  },
}));
const { RscFlightRenderer } = await import("./rscFlightRenderer");

interface RenderErrorMessage {
  type: "render-error";
  error: SerializedError;
  digest: string;
  routeId: string | null;
  traceId: string | null;
}

const renderErrorsOf = async (...errors: unknown[]) => {
  thrown.splice(0, thrown.length, ...errors);
  const messages: { type: string }[] = [];
  const logger = new Logger("RscFlightRendererTest");
  logger.error = () => undefined;
  const renderer = new RscFlightRenderer(logger, (message) => void messages.push(message as { type: string }));
  const request = RequestTrace.fresh();
  const trace = SignalTrace.create("/:lang/orders/:orderId", "page", "page", request);
  await runTraced(trace, () =>
    renderer.renderFlightElement(
      null,
      {},
      { requestId: "render-1", trace: { pathname: "/en/orders/7", routeId: "/:lang/orders/:orderId", cache: "miss" } },
    ),
  );
  return { request, sent: messages.filter((message) => message.type === "render-error") as RenderErrorMessage[] };
};

describe("RscFlightRenderer render errors", () => {
  test("sends the host each failed render's error, digest, route pattern and request id, once", async () => {
    const failure = new TypeError("price was undefined", { cause: new Error("row 42 had no price") });
    const { request, sent } = await renderErrorsOf(failure, failure);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      type: "render-error",
      error: expect.any(Object),
      digest: "price was undefined",
      routeId: "/:lang/orders/:orderId",
      traceId: request.traceId,
    });
    const rebuilt = new ForwardedError(structuredClone(sent[0]?.error) as SerializedError);
    expect(rebuilt).toMatchObject({ name: "TypeError", message: "price was undefined", stack: failure.stack });
    expect(rebuilt.cause).toBeInstanceOf(ForwardedError);
    expect(rebuilt.cause).toMatchObject({ name: "Error", message: "row 42 had no price" });
  });

  test("sends nothing for a render the request aborted", async () => {
    const aborted = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    expect((await renderErrorsOf(aborted)).sent).toEqual([]);
  });
});

describe("ForwardedError", () => {
  test("keeps a cause chain to five levels and a thrown value that is no Error as text", () => {
    let deep: Error = new Error("level 7");
    for (let level = 6; level >= 0; level -= 1) deep = new Error(`level ${level}`, { cause: deep });
    let rebuilt: unknown = new ForwardedError(ForwardedError.serialize(deep));
    const messages: string[] = [];
    while (rebuilt instanceof ForwardedError) {
      messages.push(rebuilt.message);
      rebuilt = rebuilt.cause;
    }
    expect(messages).toEqual(["level 0", "level 1", "level 2", "level 3", "level 4", "level 5"]);
    expect(ForwardedError.serialize({ toString: () => "lost connection" })).toMatchObject({
      name: "NonError",
      message: "lost connection",
    });
  });
});
