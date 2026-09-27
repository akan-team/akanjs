import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { AkanNativeError, isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import manifest from "../native-plugin.json";
import { share } from "../src/index.ts";
import { checkOptions } from "../src/options.ts";
import { fileName } from "../src/web.ts";

let host: MockHost | null = null;
const stubs: string[] = [];

function stubNavigator(key: string, value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  stubs.push(key);
}

afterEach(() => {
  host?.uninstall();
  host = null;
  for (const key of stubs.splice(0)) delete (navigator as unknown as Record<string, unknown>)[key];
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );
const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code;
  }
};

describe("share options", () => {
  test("drops empty values and keeps the rest", () => {
    expect(checkOptions({ title: "", text: "hi", url: null, files: [] })).toEqual({ text: "hi" });
    expect(checkOptions({ title: "T", url: "https://example.com/x", files: ["/__akan_native/file/a.jpg"] })).toEqual({
      title: "T",
      url: "https://example.com/x",
      files: ["/__akan_native/file/a.jpg"],
    });
  });

  test("needs text, url or files; url must be an absolute link", () => {
    for (const bad of [
      undefined,
      null,
      [],
      {},
      { title: "only a title" },
      { text: 1 },
      { files: "a" },
      { files: [""] },
      { url: "/relative" },
      { url: "javascript:alert(1)" },
      { url: "blob:https://x/1" },
    ]) {
      expect(codeOf(() => checkOptions(bad))).toBe("INVALID_ARGS");
    }
    expect(checkOptions({ url: "mailto:a@example.com" }).url).toBe("mailto:a@example.com");
  });

  test("file names for share targets", () => {
    expect(fileName("/__akan_native/file/f1_abc.jpg", "image/jpeg", 0, "app://localhost/")).toBe("f1_abc.jpg");
    expect(fileName("https://x.test/a/My%20Photo.png?x=1", "image/png", 0)).toBe("My Photo.png");
    expect(fileName("blob:app://localhost/9f2c", "image/jpeg", 1)).toBe("file2.jpg");
    expect(fileName("/__akan_native/file/noext", "application/x-custom+zip", 0, "app://localhost/")).toBe(
      "file1.xcustomzip",
    );
    expect(fileName("data:text/plain,hi", "", 0)).toBe("file1.bin");
  });
});

describe("share routing", () => {
  test("native hosts get the options object and return { completed, target }", async () => {
    const seen: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: {
        share: {
          methods: {
            share: (args) => (seen.push(args), { completed: true, target: "com.apple.UIKit.activity.Mail" }),
            canShare: () => ({ value: true }),
          },
        },
      },
    });
    const options = {
      title: "AkanNative",
      text: "Look",
      url: "https://example.com",
      files: ["/__akan_native/file/f1.jpg"],
    };
    expect(await share.share(options)).toEqual({ completed: true, target: "com.apple.UIKit.activity.Mail" });
    expect(seen).toEqual([options]);
    expect(await share.canShare()).toEqual({ value: true });
    expect(host.requests.at(-1)).not.toHaveProperty("args"); // canShare() without options sends no args
  });

  test("native rejections keep their code", async () => {
    host = installMockHost({
      platform: "android",
      plugins: {
        share: {
          methods: {
            share: () => {
              throw new AkanNativeError("UNSUPPORTED", "sharing files is not available on Android yet");
            },
          },
        },
      },
    });
    const error = await rejection(share.share({ files: ["/__akan_native/file/f1.jpg"] }));
    expect(isAkanNativeError(error, "UNSUPPORTED")).toBe(true);
  });

  test("manifest: macOS runs the web implementation in its WebView, mobile is native", () => {
    const plugin = { spec: "share", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "macos")).toEqual({ share: "web" });
    for (const platform of ["ios", "android"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({ share: { methods: ["share", "canShare"], events: [] } });
    }
  });
});

describe("share web implementation", () => {
  test("without navigator.share: share is UNSUPPORTED (after validation), canShare is false", async () => {
    host = installMockHost({ platform: "macos", plugins: { share: "web" } });
    expect(share.implementation("share")).toBe("web");
    expect(isAkanNativeError(await rejection(share.share({})), "INVALID_ARGS")).toBe(true);
    expect(isAkanNativeError(await rejection(share.share({ text: "x" })), "UNSUPPORTED")).toBe(true);
    expect(await share.canShare()).toEqual({ value: false });
  });

  test("calls navigator.share synchronously and maps the outcome", async () => {
    host = installMockHost({ platform: "web" });
    const calls: ShareData[] = [];
    let outcome: () => Promise<void> = async () => {};
    stubNavigator("share", (data: ShareData) => (calls.push(data), outcome()));

    const pending = share.share({ title: "T", text: "hello", url: "https://example.com/" });
    expect(calls).toEqual([{ title: "T", text: "hello", url: "https://example.com/" }]); // before any await: keeps user activation
    expect(await pending).toEqual({ completed: true });

    const named = (name: string) => () => Promise.reject(Object.assign(new Error(name), { name }));
    outcome = named("AbortError");
    expect(await share.share({ text: "x" })).toEqual({ completed: false });
    outcome = named("NotAllowedError");
    expect(isAkanNativeError(await rejection(share.share({ text: "x" })), "PERMISSION_DENIED")).toBe(true);
    outcome = named("InvalidStateError");
    expect(isAkanNativeError(await rejection(share.share({ text: "x" })), "CANCELLED")).toBe(true);
  });

  test("files are fetched into File objects and checked with canShare", async () => {
    host = installMockHost({ platform: "web" });
    const shared: ShareData[] = [];
    stubNavigator("share", async (data: ShareData) => void shared.push(data));
    let allowFiles = true;
    stubNavigator("canShare", (data: ShareData) => !data.files || allowFiles);
    const url = URL.createObjectURL(new Blob(["png bytes"], { type: "image/png" }));
    try {
      expect(await share.canShare({ files: [url] })).toEqual({ value: true });
      expect(await share.share({ text: "pic", files: [url] })).toEqual({ completed: true });
      const file = shared[0]!.files![0]!;
      expect([file.name, file.type, await file.text()]).toEqual(["file1.png", "image/png", "png bytes"]);

      allowFiles = false;
      expect(await share.canShare({ files: [url] })).toEqual({ value: false });
      expect(isAkanNativeError(await rejection(share.share({ files: [url] })), "UNSUPPORTED")).toBe(true);
      expect(await share.canShare({ text: 5 as never })).toEqual({ value: false });
      expect(await share.canShare({ text: "" })).toEqual({ value: false });
      expect(await share.canShare({})).toEqual({ value: true }); // same as canShare(), like the native hosts
    } finally {
      URL.revokeObjectURL(url);
    }
  });
});
