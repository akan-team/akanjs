import { describe, expect, test } from "bun:test";
import { McpApps } from "./McpApps";

process.env.AKAN_PUBLIC_APP_NAME = "probe";
process.env.AKAN_PUBLIC_REPO_NAME = "akan";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
process.env.AKAN_PUBLIC_ENV = "local";
process.env.AKAN_PUBLIC_OPERATION_MODE = "local";

const shellOf = (html: string, basePaths: string[] = []) => new McpApps({ basePaths, read: async () => html });

describe("McpApps", () => {
  test("reads the UI capability only where the extension declares its mime type", () => {
    const ui = (mimeTypes: unknown) => ({ extensions: { "io.modelcontextprotocol/ui": { mimeTypes } } });
    expect(McpApps.declaresUi(ui(["text/html;profile=mcp-app"]))).toBe(true);
    expect(McpApps.declaresUi(ui(["text/html"]))).toBe(false);
    expect(McpApps.declaresUi(ui("text/html;profile=mcp-app"))).toBe(false);
    expect(McpApps.declaresUi({ experimental: ui(["text/html;profile=mcp-app"]) })).toBe(false);
    expect(McpApps.declaresUi(undefined)).toBe(false);
  });

  test("puts the base and the embed flag first in the head, whatever its attributes, and leads without one", async () => {
    const withHead = await shellOf('<html><head data-x="1"><header></header></head></html>').read(
      "ui://probe/app",
      "https://app.example.com",
    );
    expect(withHead?.text).toStartWith('<html><head data-x="1"><base href="https://app.example.com/"><script>');
    const headless = await shellOf("<div></div>").read("ui://probe/app", "https://app.example.com");
    expect(headless?.text).toStartWith('<base href="https://app.example.com/"><script>');
    expect(headless?.text).toEndWith("</script><div></div>");
  });

  test("keeps `<meta charset>` ahead of what it injects, where a decoder still finds it", async () => {
    const read = await shellOf(
      '<html><head><meta charset="utf-8" /><title>x</title><script>1</script></head></html>',
    ).read("ui://probe/app", "https://app.example.com");
    expect(read?.text).toStartWith(
      '<html><head><meta charset="utf-8" /><base href="https://app.example.com/"><script>',
    );
  });

  test("names the app's origin to the view and roots the shell's stylesheet URLs at it", async () => {
    const read = await shellOf(
      '<head><style>@font-face{src:url(/_akan/f.woff2)}.a{background:url("/a.png")}.b{background:url(//cdn.test/b.png)}</style><script>const css = "url(/kept)";</script></head>',
    ).read("ui://probe/app", "https://app.example.com");
    expect(read?.text).toContain('window.__AKAN_EMBED__ = {"kind":"mcp-app","origin":"https://app.example.com"};');
    expect(read?.text).toContain(
      '@font-face{src:url(https://app.example.com/_akan/f.woff2)}.a{background:url("https://app.example.com/a.png")}',
    );
    expect(read?.text).toContain("url(//cdn.test/b.png)");
    expect(read?.text).toContain('const css = "url(/kept)";');
  });

  test("opens no origin that is not plain http(s)", async () => {
    const read = await shellOf("<head></head>").read("ui://probe/app", "javascript:alert(1)");
    expect(read?.text).toStartWith("<head><script>");
    expect(read?._meta).toEqual({ ui: { prefersBorder: false } });
  });

  test("addresses a basePath's screens under the root's own, so no basePath name reaches the root", async () => {
    const apps = shellOf("<head></head>", ["admin", "app"]);
    const entry = { name: "brief", description: "", arguments: [], pattern: "/:lang/admin/item" };
    expect(apps.toolOf(entry)._meta?.ui?.resourceUri).toBe("ui://probe/app/admin");
    expect(apps.toolOf({ ...entry, pattern: "/:lang/item" })._meta?.ui?.resourceUri).toBe("ui://probe/app");
    expect(apps.toolOf({ ...entry, pattern: "/:lang/app/item" })._meta?.ui?.resourceUri).toBe("ui://probe/app/app");
    expect(await apps.read("ui://probe/app/console", "https://app.example.com")).toBeNull();
    expect(await apps.read("ui://probe/admin", "https://app.example.com")).toBeNull();
    expect(await apps.read("ui://PROBE/app/admin", "https://app.example.com")).not.toBeNull();
    expect(await apps.read("ui://other/app", "https://app.example.com")).toBeNull();
    expect(await new McpApps(null).read("ui://probe/app", "https://app.example.com")).toBeNull();
  });
});
