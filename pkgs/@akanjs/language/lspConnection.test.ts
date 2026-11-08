import { describe, expect, it } from "bun:test";
import { PassThrough } from "node:stream";
import { LspConnection, type LspMessage } from "./lspConnection";

const frame = (body: string) => {
  const bytes = Buffer.from(body, "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${bytes.length}\r\n\r\n`), bytes]);
};

const open = () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const received: LspMessage[] = [];
  const sent: Buffer[] = [];
  output.on("data", (chunk: Buffer) => sent.push(chunk));
  const connection = new LspConnection(input, output, (message) => received.push(message));
  return { input, received, sent, connection };
};

describe("LspConnection", () => {
  it("frames by UTF-8 byte length across chunk boundaries", () => {
    const { input, received } = open();
    const message = { jsonrpc: "2.0", method: "note", params: { text: "메모 ✓" } } as const;
    const bytes = Buffer.concat([frame(JSON.stringify(message)), frame(JSON.stringify({ ...message, id: 1 }))]);
    for (const byte of bytes) input.write(Buffer.from([byte]));
    expect(received).toEqual([message, { ...message, id: 1 }]);
  });

  it("skips a header block without Content-Length and answers a body that is not JSON", () => {
    const { input, received, sent } = open();
    input.write(Buffer.from("Content-Type: text/plain\r\n\r\n"));
    input.write(frame("{not json"));
    input.write(frame(JSON.stringify({ jsonrpc: "2.0", method: "after" })));
    expect(received.map((message) => message.method)).toEqual(["after"]);
    expect(Buffer.concat(sent).toString()).toContain('"code":-32700');
  });

  it("writes Content-Length in bytes", () => {
    const { connection, sent } = open();
    connection.notify("note", { text: "메모" });
    const [header, body] = Buffer.concat(sent).toString("utf8").split("\r\n\r\n");
    expect(header).toBe(`Content-Length: ${Buffer.byteLength(body, "utf8")}`);
  });
});
