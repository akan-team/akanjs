import { afterEach, describe, expect, test } from "bun:test";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import type { DesktopContext } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import desktop from "../src/desktop.ts";
import { dialog, useDialog } from "../src/index.ts";
import { normalizeActionSheet, normalizeAlert, normalizeConfirm, normalizePrompt } from "../src/options.ts";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (e: unknown) => e,
  );

describe("manifest", () => {
  test("lists the JS methods", () => {
    expect(manifest.methods).toEqual([...dialog.methods]);
    expect(manifest.desktop).toBe("./src/desktop.ts");
  });
});

describe("routing", () => {
  test("native host: every method goes over the bridge with its arguments", async () => {
    host = installMockHost({
      platform: "ios",
      plugins: {
        dialog: {
          methods: {
            alert: () => undefined,
            confirm: () => ({ value: true }),
            prompt: (args) => ({ value: `typed:${args.inputText}`, cancelled: false }),
            actionSheet: () => ({ index: 1, cancelled: false }),
          },
        },
      },
    });
    expect(dialog.implementation("alert")).toBe("native");
    expect(await dialog.alert({ message: "hi" })).toBeUndefined();
    expect(await dialog.confirm({ title: "T", message: "sure?" })).toEqual({ value: true });
    expect(await dialog.prompt({ message: "name", inputText: "x" })).toEqual({ value: "typed:x", cancelled: false });
    const options = [
      { title: "A" },
      { title: "Delete", style: "destructive" as const },
      { title: "Cancel", style: "cancel" as const },
    ];
    expect(await dialog.actionSheet({ title: "Pick", options })).toEqual({ index: 1, cancelled: false });
    expect(host.requests.map((r) => r.method)).toEqual(["alert", "confirm", "prompt", "actionSheet"]);
    expect(host.requests[3]!.args).toEqual({ title: "Pick", options });
  });

  test("native INVALID_ARGS reaches the caller", async () => {
    host = installMockHost({
      platform: "android",
      plugins: {
        dialog: {
          methods: {
            actionSheet: (args) => normalizeActionSheet(args), // the native rules are the same
          },
        },
      },
    });
    const error = await rejection(dialog.actionSheet({ options: [] }));
    expect(isAkanNativeError(error, "INVALID_ARGS")).toBe(true);
    expect((error as Error).message).toBe("actionSheet: options must be a non-empty array");
  });

  test("a host without the plugin rejects UNSUPPORTED", async () => {
    host = installMockHost({ platform: "android", plugins: {} });
    expect(dialog.isSupported("confirm")).toBe(false);
    expect(useDialog().supported).toBe(false);
    expect(isAkanNativeError(await rejection(dialog.confirm({ message: "x" })), "UNSUPPORTED")).toBe(true);
  });

  test('a "web" declaration uses the web implementation', async () => {
    host = installMockHost({ platform: "macos", plugins: { dialog: "web" } });
    expect(dialog.implementation("actionSheet")).toBe("web");
    expect(useDialog().supported).toBe(true);
    // Validation runs before any DOM access, so it works without a document.
    const error = await rejection(dialog.actionSheet({ options: [] }));
    expect(isAkanNativeError(error, "INVALID_ARGS")).toBe(true);
    expect(host.requests).toHaveLength(0);
  });

  test("web implementation without a document rejects instead of throwing synchronously", async () => {
    host = installMockHost({ platform: "macos", plugins: { dialog: "web" } });
    const pending = dialog.alert({ message: "hello" });
    expect(pending).toBeInstanceOf(Promise);
    expect(isAkanNativeError(await rejection(pending), "UNSUPPORTED")).toBe(true);
  });
});

describe("argument rules", () => {
  const invalid = (fn: () => unknown, message: string) => {
    let error: unknown = null;
    try {
      fn();
    } catch (e) {
      error = e;
    }
    expect(isAkanNativeError(error, "INVALID_ARGS")).toBe(true);
    expect((error as Error).message).toBe(message);
  };

  test("alert defaults and requirements", () => {
    expect(normalizeAlert({ message: "m" })).toEqual({ title: "", message: "m", buttonTitle: "OK" });
    expect(normalizeAlert({ title: "t", message: "", buttonTitle: "" })).toEqual({
      title: "t",
      message: "",
      buttonTitle: "OK",
    });
    invalid(() => normalizeAlert(undefined), "alert: message must be a string");
    invalid(() => normalizeAlert({ title: "t" } as never), "alert: message must be a string");
    invalid(() => normalizeAlert({ message: "" }), "alert: title or message must not be empty");
    invalid(() => normalizeAlert({ message: 3 } as never), "alert: message must be a string");
    invalid(() => normalizeAlert({ message: "m", title: 1 } as never), "alert: title must be a string");
    invalid(() => normalizeAlert("text" as never), "alert: options must be an object");
  });

  test("null counts as not given", () => {
    expect(normalizeConfirm({ message: "m", title: null, okButtonTitle: null } as never)).toEqual({
      title: "",
      message: "m",
      okButtonTitle: "OK",
      cancelButtonTitle: "Cancel",
    });
  });

  test("confirm and prompt", () => {
    expect(normalizeConfirm({ message: "m", okButtonTitle: "Yes", cancelButtonTitle: "No" })).toMatchObject({
      okButtonTitle: "Yes",
      cancelButtonTitle: "No",
    });
    invalid(
      () => normalizeConfirm({ message: "m", cancelButtonTitle: false } as never),
      "confirm: cancelButtonTitle must be a string",
    );
    expect(normalizePrompt({ message: "m", inputText: "  keep spaces " })).toEqual({
      title: "",
      message: "m",
      okButtonTitle: "OK",
      cancelButtonTitle: "Cancel",
      inputPlaceholder: "",
      inputText: "  keep spaces ",
    });
    invalid(
      () => normalizePrompt({ message: "m", inputPlaceholder: 1 } as never),
      "prompt: inputPlaceholder must be a string",
    );
    invalid(() => normalizePrompt({ message: "" }), "prompt: title or message must not be empty");
  });

  test("action sheet", () => {
    expect(normalizeActionSheet({ options: [{ title: "A" }, { title: "B", style: "destructive" }] })).toEqual({
      title: "",
      message: "",
      options: [
        { title: "A", style: "default" },
        { title: "B", style: "destructive" },
      ],
    });
    invalid(() => normalizeActionSheet(undefined), "actionSheet: options must be a non-empty array");
    invalid(() => normalizeActionSheet({ options: [] }), "actionSheet: options must be a non-empty array");
    invalid(() => normalizeActionSheet({ options: "A" } as never), "actionSheet: options must be a non-empty array");
    invalid(() => normalizeActionSheet({ options: ["A"] } as never), "actionSheet: options[0] must be an object");
    invalid(
      () => normalizeActionSheet({ options: [{ title: "" }] }),
      "actionSheet: options[0].title must be a non-empty string",
    );
    invalid(
      () => normalizeActionSheet({ options: [{ title: "A" }, { title: "B", style: "bold" }] } as never),
      "actionSheet: options[1].style must be default, destructive or cancel",
    );
    invalid(
      () =>
        normalizeActionSheet({
          options: [
            { title: "A", style: "cancel" },
            { title: "B", style: "cancel" },
          ],
        }),
      "actionSheet: only one option may have the cancel style",
    );
    invalid(
      () => normalizeActionSheet({ title: 5, options: [{ title: "A" }] } as never),
      "actionSheet: title must be a string",
    );
  });
});

describe("desktop (NSAlert sheets through the shell)", () => {
  function fake(answer: { button: number; text?: string }) {
    const calls: { op: string; args: Record<string, unknown> }[] = [];
    const ctx = {
      shell: async (op: string, args: Record<string, unknown>) => {
        calls.push({ op, args });
        return answer;
      },
    } as unknown as DesktopContext;
    const m = desktop.methods as Record<string, (args: unknown, ctx: DesktopContext) => Promise<unknown>>;
    return { calls, call: (method: string, args: unknown) => Promise.resolve().then(() => m[method]!(args, ctx)) };
  }

  test("alert, confirm and prompt map to alert.show; the first button is OK", async () => {
    let f = fake({ button: 0 });
    await f.call("alert", { title: "Saved", message: "", buttonTitle: "" });
    expect(f.calls).toEqual([
      { op: "alert.show", args: { title: "Saved", message: "", buttons: [{ title: "OK" }], tag: expect.any(String) } },
    ]);
    expect(await f.call("confirm", { message: "Delete?", okButtonTitle: "Delete" })).toEqual({ value: true });
    expect(f.calls[1]!.args.buttons).toEqual([{ title: "Delete" }, { title: "Cancel", style: "cancel" }]);
    expect(await fake({ button: 1 }).call("confirm", { message: "x" })).toEqual({ value: false });
    expect(await fake({ button: -1 }).call("confirm", { message: "x" })).toEqual({ value: false });

    f = fake({ button: 0, text: " typed " });
    expect(await f.call("prompt", { message: "Name?", inputText: "a", inputPlaceholder: "p" })).toEqual({
      value: " typed ",
      cancelled: false,
    });
    expect(f.calls[0]!.args.input).toEqual({ text: "a", placeholder: "p" });
    expect(await fake({ button: 1, text: "ignored" }).call("prompt", { message: "Name?" })).toEqual({
      value: "",
      cancelled: true,
    });
  });

  test("an alert whose call is cancelled (or whose page ended) is dismissed by its tag", async () => {
    const calls: { op: string; args: Record<string, unknown> }[] = [];
    let answer!: (a: { button: number }) => void;
    const controller = new AbortController();
    const ctx = {
      signal: controller.signal,
      shell: (op: string, args: Record<string, unknown>) => {
        calls.push({ op, args });
        return op === "alert.show"
          ? new Promise((resolve) => (answer = resolve))
          : Promise.resolve({ dismissed: true });
      },
    } as unknown as DesktopContext;
    const shown = (desktop.methods.confirm as (a: unknown, c: DesktopContext) => Promise<unknown>)(
      { message: "Leave?" },
      ctx,
    );
    await Bun.sleep(1);
    controller.abort();
    expect(calls.map((c) => c.op)).toEqual(["alert.show", "alert.dismiss"]);
    expect(calls[1]!.args.tag).toBe(calls[0]!.args.tag as string);
    answer({ button: -1 }); // the sheet ended without an answer
    expect(await shown).toEqual({ value: false });
  });

  test("action sheet: the cancel option goes last and maps back", async () => {
    const options = [
      { title: "Cancel", style: "cancel" },
      { title: "Share" },
      { title: "Delete", style: "destructive" },
    ];
    let f = fake({ button: 1 });
    expect(await f.call("actionSheet", { title: "Photo", options })).toEqual({ index: 2, cancelled: false });
    expect(f.calls[0]!.args.buttons).toEqual([
      { title: "Share", style: "default" },
      { title: "Delete", style: "destructive" },
      { title: "Cancel", style: "cancel" },
    ]);
    expect(await fake({ button: 2 }).call("actionSheet", { options })).toEqual({ index: -1, cancelled: true });
    expect(await fake({ button: -1 }).call("actionSheet", { options })).toEqual({ index: -1, cancelled: true });
    f = fake({ button: 0 });
    expect(isAkanNativeError(await rejection(f.call("actionSheet", { options: [] })), "INVALID_ARGS")).toBe(true);
    expect(f.calls).toHaveLength(0);
  });
});
