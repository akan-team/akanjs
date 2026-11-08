import "../../../test/registerDom";
import { describe, expect, test } from "bun:test";
import { studioRuntime } from "./studioRuntime";

describe("studioRuntime", () => {
  test("hands a source link to the editor panel that framed it, and to no other parent", () => {
    const posted: { message: unknown; origin: string }[] = [];
    const parent = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
    Object.defineProperty(window, "parent", { value: parent, configurable: true });
    document.body.innerHTML = `<svg data-studio=""><g data-node="model:apps/demo:memo" data-label="Memo">
      <a href="vscode://file/ws/apps/demo/lib/memo/memo.constant.ts:9:3"><text>Memo</text></a></g></svg>`;
    studioRuntime();
    const title = document.querySelector("text");
    const click = () => {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      title?.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const host = (origin: string) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "akan-studio:host" },
          origin,
          source: parent as unknown as Window,
        }),
      );

    expect(click()).toBe(false);
    host("https://example.com");
    expect(posted).toEqual([]);
    expect(click()).toBe(false);

    host("vscode-webview://panel");
    expect(posted).toEqual([
      { message: { type: "akan-studio:ready", href: location.href }, origin: "vscode-webview://panel" },
    ]);
    expect(click()).toBe(true);
    expect(posted.at(-1)).toEqual({
      message: { type: "akan-studio:open", path: "/ws/apps/demo/lib/memo/memo.constant.ts", line: 9, column: 3 },
      origin: "vscode-webview://panel",
    });
  });
});
