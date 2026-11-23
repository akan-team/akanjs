import { describe, expect, test } from "bun:test";
import { MCP_APP_FRAME } from "../../signal/mcp/mcpProtocol";
import { McpAppFrame } from "./McpAppFrame";

describe("McpAppFrame", () => {
  test("serves a document that sandboxes itself, frames only under this server, and asks its parent for the view", async () => {
    const answer = McpAppFrame.handle(new Request(`http://shop.test${McpAppFrame.path}`));
    const html = await answer.text();

    expect(answer.status).toBe(200);
    expect(answer.headers.get("content-security-policy")).toBe("sandbox allow-scripts; frame-ancestors 'self'");
    expect(answer.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html).toContain(`method: "${MCP_APP_FRAME.ready}"`);
    expect(html).toContain(`data.method !== "${MCP_APP_FRAME.document}"`);
    expect(html).toContain("event.source !== parent || parent === window");
  });

  test("answers only a read", async () => {
    const answer = McpAppFrame.handle(
      new Request(`http://shop.test${McpAppFrame.path}`, { method: "POST", body: "x" }),
    );
    const head = McpAppFrame.handle(new Request(`http://shop.test${McpAppFrame.path}`, { method: "HEAD" }));

    expect([answer.status, answer.headers.get("allow")]).toEqual([405, "GET, HEAD"]);
    expect([head.status, await head.text()]).toEqual([200, ""]);
  });
});
