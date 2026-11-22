import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DeepSeekWeb } from "./DeepSeekWeb";

interface Received {
  path: string;
  body: { query?: string; count?: number; url?: string };
  auth: string | null;
}

const received: Received[] = [];
let answers: Response[] = [];
let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      received.push({
        path: new URL(request.url).pathname,
        body: (await request.json()) as Received["body"],
        auth: request.headers.get("authorization"),
      });
      return answers.shift() ?? Response.json({ results: [] });
    },
  });
});
afterAll(() => server.stop(true));

const client = () => new DeepSeekWeb("sk-test", `http://127.0.0.1:${server.port}/v1/tools`);
const rateLimited = () =>
  Response.json({ error: { message: "QPS exceeded" } }, { status: 429, headers: { "retry-after": "0.01" } });

describe("DeepSeekWeb", () => {
  test("search lists each page once, without tracking parameters, with its date and a clipped summary", async () => {
    answers = [
      Response.json({
        results: [
          {
            title: "Bun v1.3.13",
            url: "https://bun.com/blog/bun-v1.3.13?utm_source=x&utm_medium=y&ref=keep",
            summary: "word ".repeat(400),
            date: "2026-04-19T16:00:00+00:00",
          },
          { title: "Isolate issue", url: "https://github.com/oven-sh/bun/issues/31771#1", snippet: "only a snippet" },
          { title: "Same issue again", url: "https://github.com/oven-sh/bun/issues/31771", summary: "dup" },
        ],
      }),
    ];
    const text = await client().search("bun isolate", 5);
    expect(received.at(-1)).toEqual({
      path: "/v1/tools/search",
      body: { query: "bun isolate", count: 5 },
      auth: "Bearer sk-test",
    });
    expect(text).toContain("- Bun v1.3.13\n  https://bun.com/blog/bun-v1.3.13?ref=keep · 2026-04-19\n  word word");
    expect(text).toContain("- Isolate issue\n  https://github.com/oven-sh/bun/issues/31771\n  only a snippet");
    expect(text).not.toContain("Same issue again");
    expect(text.split("\n")[2]?.trim().length).toBe(DeepSeekWeb.summaryChars);
  });

  test("a query longer than DeepSeek takes is refused before any request is spent", async () => {
    const before = received.length;
    await expect(client().search("x".repeat(DeepSeekWeb.maxQueryChars + 1), 5)).rejects.toThrow("shorten the query");
    expect(received.length).toBe(before);
  });

  test("search waits out a rate limit, and gives up with DeepSeek's own message after the last attempt", async () => {
    answers = [rateLimited(), Response.json({ results: [{ title: "t", url: "https://a.com/", summary: "s" }] })];
    expect(await client().search("q", 1)).toContain("https://a.com/");

    answers = [rateLimited(), rateLimited(), rateLimited()];
    await expect(client().search("q", 1)).rejects.toThrow("429: QPS exceeded");
  });

  test("fetch waits only on its quota and hands any other failure straight back", async () => {
    answers = [rateLimited(), Response.json({ title: "Page", content: "body" })];
    expect(await client().fetch("https://a.com/")).toEqual({ title: "Page", content: "body" });

    const before = received.length;
    answers = [Response.json({ error: { message: "downstream timeout" } }, { status: 504 })];
    await expect(client().fetch("https://a.com/")).rejects.toThrow("504: downstream timeout");
    expect(received.length).toBe(before + 1);
  });

  test("fetch hands back Markdown with its blanket escaping undone", async () => {
    answers = [
      Response.json({
        title: "Example",
        content: "\\#\\# Usage\n\nCall \\`foo\\(1\\)\\` \\- it returns 2\\.\n\nconst re \\= \\/\\\\s\\+\\/\\;",
      }),
    ];
    const page = await client().fetch("https://example.com/usage");
    expect(received.at(-1)?.body).toEqual({ url: "https://example.com/usage" });
    expect(page).toEqual({
      title: "Example",
      content: "## Usage\n\nCall `foo(1)` - it returns 2.\n\nconst re = /\\s+/;",
    });
  });

  test("a page that was never escaped keeps the backslashes it has", () => {
    const clean = "Match a dot with `a\\.b`. See (the docs), [a link](x) and {a: 1}; done!";
    expect(DeepSeekWeb.unescape(clean)).toBe(clean);
  });

  test("the key comes from the model runtime, and never from behind a proxy", async () => {
    const runtime = (apiKey?: string) =>
      ({ getAuth: async () => (apiKey ? { auth: { apiKey } } : undefined) }) as unknown as Parameters<
        typeof DeepSeekWeb.fromRuntime
      >[0];
    expect(await DeepSeekWeb.fromRuntime(runtime("sk"), false)).toBeInstanceOf(DeepSeekWeb);
    expect(await DeepSeekWeb.fromRuntime(runtime("sk"), true)).toBeUndefined();
    expect(await DeepSeekWeb.fromRuntime(runtime(), false)).toBeUndefined();
  });
});
