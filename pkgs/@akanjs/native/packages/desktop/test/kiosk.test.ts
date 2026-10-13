import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The script win/kiosk.rs adds to every document of an unattended app on Windows, run against stand-ins for what it
// patches: Chromium itself would open the dialogs.
const script = readFileSync(join(import.meta.dir, "../../../native/desktop/src/win/kiosk.js"), "utf8");

interface Listener {
  type: string;
  listener: (event: unknown) => void;
  capture: unknown;
}

const page = (window: Record<string, unknown>, navigator: Record<string, unknown> = {}) => {
  const opened: string[] = [];
  const listeners: Listener[] = [];
  class HTMLElement {
    constructor(
      public localName: string,
      public type = "",
    ) {}
    click() {
      opened.push(`click ${this.localName}:${this.type}`);
    }
  }
  class HTMLInputElement extends HTMLElement {
    showPicker() {
      opened.push(`picker ${this.type}`);
    }
  }
  const addEventListener = (type: string, listener: (event: unknown) => void, capture: unknown) =>
    void listeners.push({ type, listener, capture });
  new Function("window", "navigator", "HTMLElement", "HTMLInputElement", "addEventListener", script)(
    window,
    navigator,
    HTMLElement,
    HTMLInputElement,
    addEventListener,
  );
  return { opened, listeners, HTMLElement, HTMLInputElement };
};

const nameOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as DOMException).name;
  }
  return "returned";
};

describe("an unattended app's page on Windows", () => {
  test("print does nothing, and a page that puts it back still prints nothing", () => {
    const printed: string[] = [];
    const window: Record<string, unknown> = { print: () => printed.push("print") };
    page(window);
    (window.print as () => void)();
    window.print = () => printed.push("restored");
    (window.print as () => void)();
    expect(printed).toEqual([]);
  });

  test("a file input's click and showPicker open nothing, other elements' run as before", () => {
    const { opened, HTMLElement, HTMLInputElement } = page({});
    const file = new HTMLInputElement("input", "file");
    file.click();
    expect(nameOf(() => file.showPicker())).toBe("NotAllowedError");
    expect(nameOf(() => new HTMLInputElement("input", "FILE").showPicker())).toBe("NotAllowedError");
    const box = new HTMLInputElement("input", "checkbox");
    box.click();
    box.showPicker();
    new HTMLElement("button").click();
    expect(opened).toEqual(["click input:checkbox", "picker checkbox", "click button:"]);
  });

  test("a click on a file input, its label's included, loses its default action; any other click keeps it", () => {
    const { listeners, HTMLElement, HTMLInputElement } = page({});
    const click = listeners.find((l) => l.type === "click");
    expect(click?.capture).toBe(true);
    const prevented = (target: unknown) => {
      let cancelled = false;
      click?.listener({ composedPath: () => [target], preventDefault: () => (cancelled = true) });
      return cancelled;
    };
    expect(prevented(new HTMLInputElement("input", "file"))).toBe(true);
    expect(prevented(new HTMLInputElement("input", "text"))).toBe(false);
    expect(prevented(new HTMLElement("label"))).toBe(false);
    expect(prevented(undefined)).toBe(false);
  });

  test("the File System Access pickers fail as a cancelled one does, and the share sheet is refused", async () => {
    const asked: string[] = [];
    const window: Record<string, unknown> = {
      showOpenFilePicker: async () => asked.push("open"),
      showSaveFilePicker: async () => asked.push("save"),
      showDirectoryPicker: async () => asked.push("directory"),
    };
    const navigator: Record<string, unknown> = { share: async () => asked.push("share") };
    page(window, navigator);
    const failure = (picker: unknown) =>
      (picker as () => Promise<unknown>)().then(
        () => "resolved",
        (error: DOMException) => error.name,
      );
    expect(await failure(window.showOpenFilePicker)).toBe("AbortError");
    expect(await failure(window.showSaveFilePicker)).toBe("AbortError");
    expect(await failure(window.showDirectoryPicker)).toBe("AbortError");
    expect(await failure(navigator.share)).toBe("NotAllowedError");
    expect(asked).toEqual([]);
  });

  test("a page without the pickers, or with a property it cannot redefine, raises nothing", () => {
    const print = () => {};
    const window = Object.freeze({ print });
    expect(() => page(window)).not.toThrow();
    expect(window.print).toBe(print);
  });
});
