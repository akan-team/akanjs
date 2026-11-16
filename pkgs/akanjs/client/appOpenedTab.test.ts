import { afterEach, describe, expect, test } from "bun:test";
import { closeAppOpenedTab } from "./appOpenedTab";

interface TabOptions {
  historyLength?: number;
  referrer?: string;
  opener?: unknown;
  closable?: boolean;
}

const originals = {
  window: Object.getOwnPropertyDescriptor(globalThis, "window"),
  document: Object.getOwnPropertyDescriptor(globalThis, "document"),
};

const openTab = ({ historyLength = 1, referrer = "", opener = null, closable = true }: TabOptions = {}) => {
  const tab = {
    closes: 0,
    closed: false,
    opener,
    history: { length: historyLength },
    location: { href: "https://office.example.test/office/thread/1" },
    close() {
      tab.closes += 1;
      if (closable) tab.closed = true;
    },
  };
  Object.defineProperty(globalThis, "window", { value: tab, configurable: true });
  Object.defineProperty(globalThis, "document", { value: { referrer }, configurable: true });
  return tab;
};

afterEach(() => {
  for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  Reflect.deleteProperty(globalThis, "__AKAN_NATIVE__");
});

describe("closeAppOpenedTab", () => {
  test("closes a one-entry tab this origin opened, by its referrer or its opener", () => {
    const fromReferrer = openTab({ referrer: "https://office.example.test/office/home" });
    expect(closeAppOpenedTab()).toBe(true);
    expect(fromReferrer.closes).toBe(1);

    const fromOpener = openTab({ opener: {} });
    expect(closeAppOpenedTab()).toBe(true);
    expect(fromOpener.closes).toBe(1);
  });

  test("leaves a tab the person opened, one with history, and one another site opened", () => {
    for (const options of [
      { referrer: "" },
      { referrer: "https://office.example.test/office/home", historyLength: 2 },
      { referrer: "https://search.example.test/?q=office" },
    ]) {
      const tab = openTab(options);
      expect(closeAppOpenedTab()).toBe(false);
      expect(tab.closes).toBe(0);
    }
  });

  test("answers false when the browser refuses to close the tab, so the caller falls back", () => {
    const tab = openTab({ referrer: "https://office.example.test/office/home", closable: false });

    expect(closeAppOpenedTab()).toBe(false);
    expect(tab.closes).toBe(1);
  });

  test("never closes a native shell's window", () => {
    for (const platform of ["ios", "android", "macos"]) {
      Object.assign(globalThis, { __AKAN_NATIVE__: { platform } });
      const tab = openTab({ referrer: "https://office.example.test/office/home" });
      expect(closeAppOpenedTab()).toBe(false);
      expect(tab.closes).toBe(0);
    }
  });
});
