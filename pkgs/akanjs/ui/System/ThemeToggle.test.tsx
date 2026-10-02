import "../../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { mount, setTestEnv } from "../testHelpers.fixture";

let ThemeToggle: typeof import("./ThemeToggle").ThemeToggle;
let ClientBridge: typeof import("./Client").ClientBridge;
let lib: typeof import("use-agentic");
let AgentBridge: typeof import("akanjs/store").AgentBridge;
let StoreRegistry: typeof import("akanjs/store").StoreRegistry;

beforeAll(async () => {
  setTestEnv("themetest");
  ({ ThemeToggle } = await import("./ThemeToggle"));
  ({ ClientBridge } = await import("./Client"));
  ({ AgentBridge, StoreRegistry } = await import("akanjs/store"));
  lib = await import("use-agentic");
});

describe("ThemeToggle agent surface", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    // biome-ignore lint/suspicious/noDocumentCookie: happy-dom drops Secure cookies from setCookie.
    document.cookie = "theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  test("publishes the theme and an applyTheme tool the agent can drive, withdrawn on unmount", async () => {
    const { unmount } = mount(<ThemeToggle themes={["light", "dark"]} />);
    const surface = lib.AgenticSurface.shared;
    const snapshot = surface.snapshot();
    const instance = StoreRegistry.instance;
    const bridge = new AgentBridge(instance);
    expect(snapshot.tools.map((tool) => tool.name)).toContain("applyTheme");
    expect(instance.liveKeys.has("theme")).toBe(true);
    expect(bridge.readableKeys()).toContain("theme");
    await act(async () => {
      await surface.call("applyTheme", { theme: "dark" });
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(bridge.read("theme")).toBe("dark");
    unmount();
    expect(surface.snapshot().tools.map((tool) => tool.name)).not.toContain("applyTheme");
    expect(instance.liveKeys.has("theme")).toBe(false);
  });

  test("restores the cookie theme over a stale document attribute on mount", () => {
    // biome-ignore lint/suspicious/noDocumentCookie: happy-dom drops Secure cookies from setCookie.
    document.cookie = "theme=light";
    document.documentElement.setAttribute("data-theme", "dark");
    const { unmount } = mount(<ThemeToggle themes={["light", "dark"]} />);
    const bridge = new AgentBridge(StoreRegistry.instance);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(bridge.read("theme")).toBe("light");
    unmount();
  });

  test("follows the layout theme the client applies after a stale first-paint attribute", () => {
    //? One array for every render, as a server parent's props are: a fresh literal would re-run the toggle's effect.
    const themes = ["light", "dark"];
    document.documentElement.setAttribute("data-theme", "dark");
    const { container, unmount } = mount(
      <>
        <ThemeToggle themes={themes} />
        <ClientBridge theme="light" wsConnect={false} />
      </>,
    );
    const bridge = new AgentBridge(StoreRegistry.instance);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(bridge.read("theme")).toBe("light");
    expect(container.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    unmount();
  });
});
