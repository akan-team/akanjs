import { afterAll, expect, test } from "bun:test";
import { fileBlob, fileStream } from "../src/files.ts";
import { parseRange } from "../src/kernel.ts";

// Architecture review stage 4: big FileRefs are read in Range pieces, as the hosts serve them.

const bytes = new TextEncoder().encode("0123456789");
const requests: (string | null)[] = [];
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    const range = req.headers.get("range");
    requests.push(range);
    if (url.pathname === "/missing") return new Response("no", { status: 404 });
    if (url.pathname === "/plain") return new Response(bytes); // no Range support
    const data = url.pathname === "/empty" ? new Uint8Array(0) : bytes;
    const answer = parseRange(range, data.length);
    if (answer.status === 416)
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${data.length}` } });
    if (answer.status === 200) return new Response(data, { headers: { "accept-ranges": "bytes" } });
    const { start, end } = answer;
    return new Response(data.slice(start, end + 1), {
      status: 206,
      headers: { "content-range": `bytes ${start}-${end}/${data.length}` },
    });
  },
});
afterAll(() => server.stop(true));
const at = (path: string) => `http://localhost:${server.port}${path}`;

test("pieces of chunkSize until the end; the Blob keeps the FileRef's type", async () => {
  requests.length = 0;
  const chunks: string[] = [];
  const reader = fileStream(at("/file"), { chunkSize: 3 }).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new TextDecoder().decode(value));
  }
  expect(chunks).toEqual(["012", "345", "678", "9"]);
  expect(requests).toEqual(["bytes=0-2", "bytes=3-5", "bytes=6-8", "bytes=9-11"]);
  const blob = await fileBlob({ url: at("/file"), mime: "image/jpeg", size: 10 }, { chunkSize: 4 });
  expect([await blob.text(), blob.type]).toEqual(["0123456789", "image/jpeg"]);
});

test("a server without Range is streamed as it answers; empty and missing files", async () => {
  expect(await (await fileBlob(at("/plain"), { chunkSize: 3 })).text()).toBe("0123456789");
  expect((await fileBlob(at("/empty"))).size).toBe(0);
  const error = await fileBlob(at("/missing")).catch((e) => e);
  expect(error.code).toBe("NOT_FOUND");
});
