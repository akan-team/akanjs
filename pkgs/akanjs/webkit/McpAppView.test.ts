import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import type { McpAppBridge, McpDownloadContent } from "./McpAppBridge";

process.env.AKAN_PUBLIC_APP_NAME = "test";
process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
//? Imported once the env is set: the store module reads it while it loads.
const { McpAppView } = await import("./McpAppView");
const { csrLocation } = await import("akanjs/client");

describe("McpAppView.localize", () => {
  const locales = ["en", "ko"];

  test("moves the screen to the host's language when the app speaks it", () => {
    expect(McpAppView.localize("/en/memo/1?tab=a", "ko-KR", locales)).toBe("/ko/memo/1?tab=a");
    expect(McpAppView.localize("/en", "ko", locales)).toBe("/ko");
  });

  test("keeps the server's language for a locale the app lacks, or an href with no locale segment", () => {
    expect(McpAppView.localize("/en/memo", "ja-JP", locales)).toBe("/en/memo");
    expect(McpAppView.localize("/en/memo", undefined, locales)).toBe("/en/memo");
    expect(McpAppView.localize("/memo", "ko-KR", locales)).toBe("/memo");
    expect(McpAppView.languageOf("ko-KR", locales)).toBe("ko");
    expect(McpAppView.languageOf("ja-JP", locales)).toBeUndefined();
  });
});

// The host blocked the `<base>`: the document sits on the sandbox's origin, and only the embed names the app's.
(window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
  "https://sandbox.host.example/view",
);
globalThis.__AKAN_EMBED__ = { kind: "mcp-app", origin: "https://app.example.com" };
Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });

const opened: string[] = [];
const saved: McpDownloadContent[][] = [];
const sizes: unknown[] = [];
const capabilities: { downloadFile?: object } = { downloadFile: {} };
const bridge = {
  hostContext: {},
  hostCapabilities: capabilities,
  onHostContext: () => () => true,
  notify: (method: string, params: unknown) => {
    if (method === "ui/notifications/size-changed") sizes.push(params);
  },
  openLink: async (url: string) => void opened.push(url),
  downloadFile: async (contents: McpDownloadContent[]) => void saved.push(contents),
} as unknown as McpAppBridge;

const view = new McpAppView(bridge);
view.mount();

const clickOn = (href: string, attributes: Record<string, string> = {}) => {
  const anchor = document.createElement("a");
  anchor.setAttribute("href", href);
  for (const [name, value] of Object.entries(attributes)) anchor.setAttribute(name, value);
  document.body.append(anchor);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  anchor.dispatchEvent(click);
  anchor.remove();
  return click;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const reset = () => {
  for (const sent of [opened, saved]) sent.length = 0;
};

describe("McpAppView links", () => {
  test("opens a link to another of the app's screens as its web page, on the app's origin, not the host's sandbox", () => {
    reset();
    clickOn("/en/memo/2?tab=a#notes");
    clickOn("https://app.example.com/en/memo/3");
    clickOn("/api/file/photo.png");
    view.open("/ko/memo/4");
    expect(opened).toEqual([
      "https://app.example.com/en/memo/2?tab=a#notes",
      "https://app.example.com/en/memo/3",
      "https://app.example.com/api/file/photo.png",
      "https://app.example.com/ko/memo/4",
    ]);
  });

  test("keeps a fragment on this screen, alone or after the screen's own path as a `<Link>` hands it over", () => {
    reset();
    csrLocation.view("/en/memo/1");
    const target = document.createElement("h2");
    target.id = "notes";
    let scrolls = 0;
    target.scrollIntoView = () => {
      scrolls += 1;
    };
    document.body.append(target);
    clickOn("#notes");
    view.open("/en/memo/1#notes");
    view.open("/en/memo/2#notes");
    target.remove();
    expect(scrolls).toBe(2);
    expect(opened).toEqual(["https://app.example.com/en/memo/2#notes"]);
  });

  test("finds a fragment's target as written or percent-decoded, and survives one that is not valid encoding", () => {
    reset();
    const scrolled: string[] = [];
    const targets = ["50%", "café", "100%-ready now"].map((id) => {
      const target = document.createElement("h2");
      target.id = id;
      target.scrollIntoView = () => void scrolled.push(id);
      document.body.append(target);
      return target;
    });
    expect(() => clickOn("#50%")).not.toThrow();
    clickOn("#caf%C3%A9");
    clickOn("#100%-ready%20now");
    expect(() => view.open("#%E0%A4%A")).not.toThrow();
    for (const target of targets) target.remove();
    expect(scrolled).toEqual(["50%", "café", "100%-ready now"]);
    expect(opened).toEqual([]);
  });

  test("hands the host only a web, mail or phone address, and never a script, whatever the page wrote", () => {
    reset();
    const clicks = [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "vbscript:msgbox(1)",
      "data:text/html,<script>alert(1)</script>",
      "blob:https://app.example.com/0b9d",
      "file:///etc/passwd",
      "ftp://files.example/report",
      "https://other.example/doc",
      "http://other.example/doc",
      "//other.example/doc",
      "mailto:help@example.com",
      "tel:+821012345678",
    ].map((href) => clickOn(href));
    expect(clicks.every((click) => click.defaultPrevented)).toBe(true);
    expect(opened).toEqual([
      "https://other.example/doc",
      "http://other.example/doc",
      "https://other.example/doc",
      "mailto:help@example.com",
      "tel:+821012345678",
    ]);
  });

  test("opens what `window.open` names the way a link would, and hands the page no window", () => {
    reset();
    expect(window.open("https://other.example/doc", "_blank")).toBeNull();
    expect(window.open("javascript:alert(1)")).toBeNull();
    expect(window.open(new URL("https://app.example.com/en/memo/9"))).toBeNull();
    expect(opened).toEqual(["https://other.example/doc", "https://app.example.com/en/memo/9"]);
  });
});

describe("McpAppView downloads", () => {
  test("hands the host a stored file by its address on the app's origin", async () => {
    reset();
    clickOn("/api/file/report.pdf", { download: "report.pdf" });
    clickOn("https://cdn.example/files/raw.bin", { download: "" });
    await settle();
    expect(saved).toEqual([
      [{ type: "resource_link", uri: "https://app.example.com/api/file/report.pdf", name: "report.pdf" }],
      [{ type: "resource_link", uri: "https://cdn.example/files/raw.bin", name: "raw.bin" }],
    ]);
  });

  test("saves the bytes of a file the page made, though the page revokes its URL right after the click", async () => {
    reset();
    const url = URL.createObjectURL(new Blob(["hello"], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.setAttribute("href", url);
    anchor.setAttribute("download", "hello.txt");
    anchor.click();
    URL.revokeObjectURL(url);
    clickOn("data:text/csv;charset=utf-8,a%2Cb", { download: "rows.csv" });
    clickOn("data:application/octet-stream;base64,AAEC", { download: "raw.bin" });
    await settle();
    const resource = (name: string, mimeType: string, blob: string): McpDownloadContent => ({
      type: "resource",
      resource: { uri: `file:///${name}`, mimeType, blob },
    });
    expect(saved).toEqual([
      [resource("hello.txt", "text/plain", btoa("hello"))],
      [resource("rows.csv", "text/csv", btoa("a,b"))],
      [resource("raw.bin", "application/octet-stream", "AAEC")],
    ]);
  });

  test("saves nothing that is neither a web address nor a file the view made", async () => {
    reset();
    clickOn("javascript:alert(1)", { download: "x.txt" });
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "blob:https://app.example.com/revoked");
    anchor.setAttribute("download", "gone.txt");
    anchor.click();
    await settle();
    expect([...saved, ...opened]).toEqual([]);
  });

  test("asks a host that saves no files to open a stored one instead", async () => {
    reset();
    capabilities.downloadFile = undefined;
    try {
      clickOn("/api/file/report.pdf", { download: "report.pdf" });
      clickOn("data:text/plain,hi", { download: "hi.txt" });
      await settle();
      expect(opened).toEqual(["https://app.example.com/api/file/report.pdf"]);
      expect(saved).toEqual([]);
    } finally {
      capabilities.downloadFile = {};
    }
  });
});

// Last: the notice replaces the app's markup for good.
describe("McpAppView.showUnavailable", () => {
  test("keeps the notice's own height once the screen gives way to it", async () => {
    await settle();
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLParagraphElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ height: 48 }),
    });
    sizes.length = 0;
    view.showUnavailable("This screen is not available here.");
    await settle();
    await settle();
    expect(document.body.textContent).toBe("This screen is not available here.");
    expect(sizes).toEqual([{ height: 48 }]);
  });
});
