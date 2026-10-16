import { describe, expect, test } from "bun:test";
import { McpApps } from "./McpApps";

process.env.AKAN_PUBLIC_APP_NAME = "probe";
process.env.AKAN_PUBLIC_REPO_NAME = "akan";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
process.env.AKAN_PUBLIC_ENV = "local";
process.env.AKAN_PUBLIC_OPERATION_MODE = "local";

const shellOf = (html: string, basePaths: string[] = []) => new McpApps({ basePaths, read: async () => html });

const viewOf = async (origin: string) => {
  const read = await shellOf("<head></head>").read("ui://probe/app", origin);
  const script = /<script>([\s\S]*)<\/script>/i.exec(read?.text ?? "")?.[1] ?? "";
  class Element {
    tagName = "IMG";
    readonly attributes = new Map<string, string>();
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }
    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }
  }
  class MutationObserver {
    observe() {}
  }
  const document: { baseURI: string; documentElement: object; cookie?: string } = {
    baseURI: "about:srcdoc",
    documentElement: {},
  };
  new Function("window", "document", "Element", "MutationObserver", script)({}, document, Element, MutationObserver);
  return { document, image: new Element() };
};

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

  test("opens no origin whose host would carry a quote out of the base attribute, a `%22` included", async () => {
    for (const origin of ['https://evil.test"target="_top', "https://evil.test%22target=%22_top"]) {
      const read = await shellOf("<head><style>.a{background:url(/a.png)}</style></head>").read(
        "ui://probe/app",
        origin,
      );
      expect(read?.text).not.toContain("evil.test");
      expect(read?._meta).toEqual({ ui: { prefersBorder: false } });
    }
    for (const origin of ["https://app.example.com:8443", "http://[::1]:3000", "http://xn--bcher-kva.de"]) {
      const read = await shellOf("<head></head>").read("ui://probe/app", origin);
      expect(read?.text).toStartWith(`<head><base href="${origin}/"><script>`);
    }
  });

  test("points only a srcset's own URLs at the origin, leaving a comma inside one whole", async () => {
    const { image } = await viewOf("https://app.example.com");
    image.setAttribute("srcset", "data:image/png;base64,AAAA 1x, /b.png?w=1,2 2x,/c.png 3x");
    expect(image.getAttribute("srcset")).toBe(
      "data:image/png;base64,AAAA 1x, https://app.example.com/b.png?w=1,2 2x,https://app.example.com/c.png 3x",
    );
  });

  test("forgets a cookie the page expires by Max-Age as by Expires, Max-Age first", async () => {
    const { document } = await viewOf("https://app.example.com");
    document.cookie = "a=1; path=/";
    document.cookie = "b=2";
    document.cookie = "c=3";
    document.cookie = "a=; Max-Age=0; path=/";
    document.cookie = "b=; expires=Thu, 01 Jan 1970 00:00:00 UTC";
    document.cookie = "c=4; Max-Age=60; expires=Thu, 01 Jan 1970 00:00:00 UTC";
    expect(document.cookie).toBe("c=4");
  });

  test("hands a view the bearer's own claims without the token's, and nothing from a header carrying no bearer", () => {
    const claims = { self: { id: "u1" }, aud: "https://app.example.com/mcp", exp: 4102444800, client_id: "agent" };
    const token = `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
    const req = (authorization: string) => new Request("https://app.example.com/mcp", { headers: { authorization } });
    expect(McpApps.accountOf(req(`Bearer ${token}`))).toEqual({ self: { id: "u1" } });
    for (const authorization of [token, `Bearer ${token} x`, `Bearer\t${token}`, "Bearer opaque"])
      expect(McpApps.accountOf(req(authorization))).toBeNull();
  });

  test("never tells a host a page tool only reads: the run makes the page's own calls", () => {
    const tool = shellOf("<head></head>").toolOf({
      name: "brief",
      description: "",
      arguments: [],
      pattern: "/:lang/x",
    });
    expect(tool.annotations).toEqual({ readOnlyHint: false, openWorldHint: false });
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
