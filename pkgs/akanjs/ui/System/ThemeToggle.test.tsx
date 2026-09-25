import "../../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";

let ThemeToggle: typeof import("./ThemeToggle").ThemeToggle;
let lib: typeof import("use-agentic");
let AgentBridge: typeof import("akanjs/store").AgentBridge;
let StoreRegistry: typeof import("akanjs/store").StoreRegistry;

/** Imported after the environment is set: `akanjs/store`'s baseSt reads the env while the module evaluates. */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "themetest";
  process.env.AKAN_PUBLIC_REPO_NAME = "themetest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  ({ ThemeToggle } = await import("./ThemeToggle"));
  ({ AgentBridge, StoreRegistry } = await import("akanjs/store"));
  lib = await import("use-agentic");
});

describe("ThemeToggle agent surface", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    // biome-ignore lint/suspicious/noDocumentCookie: happy-dom drops Secure cookies from setCookie.
    document.cookie = "theme=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  test("publishes the theme and an applyTheme tool the agent can drive, withdrawn on unmount", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<ThemeToggle themes={["light", "dark"]} />));
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
    act(() => root.unmount());
    expect(surface.snapshot().tools.map((tool) => tool.name)).not.toContain("applyTheme");
    expect(instance.liveKeys.has("theme")).toBe(false);
  });

  test("restores the cookie theme over a stale document attribute on mount", () => {
    // biome-ignore lint/suspicious/noDocumentCookie: happy-dom drops Secure cookies from setCookie.
    document.cookie = "theme=light";
    document.documentElement.setAttribute("data-theme", "dark");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<ThemeToggle themes={["light", "dark"]} />));
    const bridge = new AgentBridge(StoreRegistry.instance);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(bridge.read("theme")).toBe("light");
    act(() => root.unmount());
    document.body.removeChild(container);
  });
});
