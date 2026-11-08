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

  test("shows the pinned node's workflows, and asks the editor panel to run one", () => {
    const posted: { message: unknown; origin: string }[] = [];
    const parent = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
    Object.defineProperty(window, "parent", { value: parent, configurable: true });
    document.body.innerHTML = `${bar}${diagram}`;
    studioRuntime();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "akan-studio:host" },
        origin: "vscode-webview://panel",
        source: parent as unknown as Window,
      }),
    );
    expect(buttons()).toEqual(["New module"]);
    document.querySelector("rect")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(buttons()).toEqual(["Open module", "Add field"]);
    const [openModule, runAddField] = document.querySelectorAll<HTMLButtonElement>("[data-studio-actions] button");
    openModule.click();
    expect(posted.at(-1)).toEqual({
      message: { type: "akan-studio:module", inputs: { app: "demo", module: "memo" } },
      origin: "vscode-webview://panel",
    });
    runAddField.click();
    expect(posted.at(-1)).toEqual({
      message: { type: "akan-studio:workflow", workflow: "add-field", inputs: { app: "demo", module: "memo" } },
      origin: "vscode-webview://panel",
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(buttons()).toEqual(["New module"]);
  });

  test("copies the workflow command in a browser, where no editor runs it", async () => {
    Object.defineProperty(window, "parent", { value: window, configurable: true });
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => void copied.push(text) },
      configurable: true,
    });
    document.body.innerHTML = `${bar}${diagram}`;
    studioRuntime();
    document.querySelector<HTMLButtonElement>("[data-studio-actions] button")?.click();
    await Promise.resolve();
    expect(copied).toEqual([newModule.command]);
    expect(document.querySelector("[data-studio-actions] output")?.textContent).toBe(`Copied: ${newModule.command}`);
    document.querySelector("rect")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(buttons()).toEqual(["Add field"]);
  });
});

const newModule = {
  kind: "workflow",
  workflow: "create-module",
  label: "New module",
  inputs: { app: "demo" },
  command: "akan workflow plan create-module --app demo --module <module>",
};
const openModule = { kind: "module", label: "Open module", inputs: { app: "demo", module: "memo" }, command: null };
const addField = {
  kind: "workflow",
  workflow: "add-field",
  label: "Add field",
  inputs: { app: "demo", module: "memo" },
  command: "akan workflow plan add-field --app demo --module memo --field <field> --type <type>",
};
const attribute = (value: unknown) => JSON.stringify(value).replace(/"/g, "&quot;");
const bar = `<div data-studio-actions="" data-label="demo" data-actions="${attribute([newModule])}"></div>`;
const diagram = `<svg data-studio=""><g data-node="model:apps/demo:memo" data-label="Memo" data-actions="${attribute([openModule, addField])}">
  <rect></rect></g></svg>`;
const buttons = () =>
  [...document.querySelectorAll("[data-studio-actions] button")].map((button) => button.textContent);
