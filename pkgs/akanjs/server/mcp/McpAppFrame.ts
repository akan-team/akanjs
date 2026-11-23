import { MCP_APP_FRAME } from "../../signal/mcp/mcpProtocol";
import type { HttpRoutes } from "../types";

export class McpAppFrame {
  static readonly path = MCP_APP_FRAME.path;
  //? Security: `sandbox` gives the document an opaque origin however it is opened, so the view it writes never runs as
  //? this server, and `frame-ancestors` lets only this server's own pages frame it.
  static readonly policy = "sandbox allow-scripts; frame-ancestors 'self'";
  static readonly #script = [
    'addEventListener("message", function take(event) {',
    "  var data = event.data;",
    "  if (event.source !== parent || parent === window || !data || data.method !== METHOD) return;",
    '  if (!data.params || typeof data.params.html !== "string") return;',
    '  removeEventListener("message", take);',
    "  document.open();",
    "  document.write(data.params.html);",
    "  document.close();",
    "});",
    'parent.postMessage({ jsonrpc: "2.0", method: READY }, "*");',
  ]
    .join("\n")
    .replace("METHOD", JSON.stringify(MCP_APP_FRAME.document))
    .replace("READY", JSON.stringify(MCP_APP_FRAME.ready));
  static readonly html = `<!doctype html><meta charset="utf-8"><script>\n${McpAppFrame.#script}\n</script>`;

  static routes(): HttpRoutes {
    return { [McpAppFrame.path]: (req: Request) => McpAppFrame.handle(req) };
  }

  static handle(req: Request): Response {
    if (req.method !== "GET" && req.method !== "HEAD")
      return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
    return new Response(req.method === "HEAD" ? null : McpAppFrame.html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": McpAppFrame.policy,
        "cache-control": "no-cache",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    });
  }
}
