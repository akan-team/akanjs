import { describe, expect, mock, test } from "bun:test";
import { Logger } from "akanjs/common";

interface FlightOptions {
  onError: (error: unknown) => string | undefined;
}
type Read = (options: FlightOptions, notFoundProbe: { hit: boolean }) => ReadableStreamReadResult<Uint8Array>;

//? React raises a control in the task that writes the chunks after it; only this reader leaves one between two chunks.
const reads: Read[] = [];
const notFoundProbe = { hit: false };
mock.module("react-server-dom-webpack/server.node", () => ({
  renderToReadableStream: async (_element: unknown, _manifest: unknown, options: FlightOptions) => ({
    getReader: () => ({
      read: async () => reads.shift()?.(options, notFoundProbe) ?? { done: true, value: undefined },
      cancel: async () => undefined,
      releaseLock: () => undefined,
    }),
  }),
}));
const { RscFlightStream } = await import("./rscFlightStream");

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const chunkOf =
  (text: string): Read =>
  () => ({ done: false, value: encoder.encode(text) });

const messagesOf = async (...script: Read[]) => {
  reads.splice(0, reads.length, ...script);
  notFoundProbe.hit = false;
  const messages: { type: string; data?: Uint8Array; location?: string }[] = [];
  const stream = new RscFlightStream(
    {
      logger: new Logger("RscFlightStreamTest"),
      send: (message) => void messages.push(message as (typeof messages)[number]),
      isCancelled: () => false,
      track: () => undefined,
      untrack: () => undefined,
      reportRenderError: () => "digest",
    },
    { requestId: "request-1", notFoundProbe },
  );
  await stream.render(null, {});
  return messages.map(({ type, data, location }) => (data ? `${type}:${decoder.decode(data)}` : (location ?? type)));
};

describe("RscFlightStream message order", () => {
  test("sends the chunks read before a late redirect ahead of it, and the ones after it behind", async () => {
    const redirect = { digest: "AKAN_REDIRECT", location: "/target", method: "replace", status: 307 };

    const messages = await messagesOf(
      chunkOf("first "),
      chunkOf("second "),
      (options) => {
        options.onError(redirect);
        return { done: false, value: encoder.encode("third") };
      },
      chunkOf(" fourth"),
    );

    expect(messages).toEqual(["meta", "chunk:first second ", "/target", "chunk:third fourth", "cache-state", "end"]);
  });

  test("sends the chunks read before a late not-found ahead of it", async () => {
    const messages = await messagesOf(chunkOf("first "), chunkOf("second "), (_options, probe) => {
      probe.hit = true;
      return { done: false, value: encoder.encode("third") };
    });

    expect(messages).toEqual(["meta", "chunk:first second ", "late-not-found", "chunk:third", "cache-state", "end"]);
  });
});
