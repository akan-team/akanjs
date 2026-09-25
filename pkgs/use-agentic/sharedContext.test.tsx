import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { useContext } from "react";
import type { AgenticSurface } from "./AgenticSurface";
import type { AgentSession } from "./AgentSession";
import { sharedContext } from "./sharedContext";
import { ScopeContext, SurfaceContext } from "./surfaceContext";
import { mount } from "./test/mount";
import { SessionContext } from "./useAgent";

describe("sharedContext", () => {
  test("a second evaluation of the same module gets the object the first one made", () => {
    // What two bundled copies of this package do: each runs the module, and only one context may survive it.
    expect(sharedContext<string[]>("scope", [])).toBe(ScopeContext);
    expect(sharedContext<AgenticSurface | null>("surface", null)).toBe(SurfaceContext);
    expect(sharedContext<AgentSession | null>("session", null)).toBe(SessionContext);
  });

  test("a Provider rendered from one copy is read through the other", () => {
    const provider = sharedContext<string>("crossBundleTest", "default");
    const reader = sharedContext<string>("crossBundleTest", "default");
    const Probe = () => <output>{useContext(reader)}</output>;
    const app = mount(
      <provider.Provider value="the zone's scope">
        <Probe />
      </provider.Provider>,
    );
    // Distinct objects would leave the reader on its default — the silent failure this guards.
    expect(app.container.textContent).toBe("the zone's scope");
    app.unmount();
  });

  test("two names never share one object", () => {
    expect(sharedContext("scope", [])).not.toBe(sharedContext("session", null));
  });

  test("no other module in this package makes a context the plain way", () => {
    // The plain call works in the monorepo, where there is one copy of this package, and fails only once an app
    // bundles it — so the mistake cannot be caught by using the thing. It is caught here instead.
    const offenders = readdirSync(import.meta.dir)
      .filter((name) => /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name))
      .filter((name) => name !== "sharedContext.ts")
      .filter((name) => readFileSync(`${import.meta.dir}/${name}`, "utf8").includes("createContext("));
    expect(offenders).toEqual([]);
  });
});
