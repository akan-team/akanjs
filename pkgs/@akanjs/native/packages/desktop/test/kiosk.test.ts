import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The script the shell adds to every document of an unattended app on Windows and macOS, run against stand-ins for
// what it patches: the engine itself would open the dialogs.
const script = readFileSync(join(import.meta.dir, "../../../native/desktop/src/kiosk.js"), "utf8");

interface Listener {
  type: string;
  listener: (event: unknown) => void;
  capture: unknown;
}

const realm = (window: Record<string, unknown>, navigator: Record<string, unknown> = {}) => {
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
  if (!Object.isFrozen(window)) Object.assign(window, { navigator, HTMLElement, HTMLInputElement, addEventListener });
  return { window, opened, listeners, HTMLElement, HTMLInputElement };
};

const page = (window: Record<string, unknown>, navigator: Record<string, unknown> = {}) => {
  const made = realm(window, navigator);
  new Function("window", script)(window);
  return made;
};

const nameOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as DOMException).name;
  }
  return "returned";
};

describe("an unattended app's page", () => {
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

  test("a frame's window a script reaches, before any navigation loads the script into it, prints nothing", () => {
    const printed: string[] = [];
    const viaWindow = realm({ print: () => printed.push("contentWindow") }).window;
    const viaDocument = realm({ print: () => printed.push("contentDocument") }).window;
    class HTMLIFrameElement {
      get contentWindow() {
        return viaWindow;
      }
      get contentDocument() {
        return { defaultView: viaDocument };
      }
    }
    page({ print: () => printed.push("parent"), HTMLIFrameElement });
    const frame = new HTMLIFrameElement();
    (frame.contentWindow.print as () => void)();
    (frame.contentDocument.defaultView.print as () => void)();
    expect(printed).toEqual([]);
  });

  test("a frame that joins the document is locked before the page reaches for it", () => {
    const printed: string[] = [];
    let added: ((records: unknown[]) => void) | undefined;
    class MutationObserver {
      constructor(callback: (records: unknown[]) => void) {
        added = callback;
      }
      observe() {}
    }
    const nested = realm({ print: () => printed.push("nested") }).window;
    const direct = realm({ print: () => printed.push("direct") }).window;
    const wrapper = { querySelectorAll: () => [{ contentWindow: nested }] };
    const frame = { contentWindow: direct, querySelectorAll: () => [] };
    page({ MutationObserver, document: {} });
    added?.([{ addedNodes: [wrapper, frame, { nodeType: 3 }] }]);
    (nested.print as () => void)();
    (direct.print as () => void)();
    expect(printed).toEqual([]);
  });

  test("a cross-origin frame's window is handed out untouched", () => {
    const refuse = () => {
      throw new DOMException("cross-origin", "SecurityError");
    };
    const foreign = new Proxy({}, { get: refuse, has: refuse, defineProperty: refuse });
    class HTMLIFrameElement {
      get contentWindow() {
        return foreign;
      }
    }
    page({ HTMLIFrameElement });
    expect(new HTMLIFrameElement().contentWindow).toBe(foreign);
  });
});
