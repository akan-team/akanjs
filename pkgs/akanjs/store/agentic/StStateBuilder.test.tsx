import "../../test/registerDom";
import { describe, expect, test } from "bun:test";
import { enumOf } from "akanjs/base";
import { via } from "akanjs/constant";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { StStateDraft } from "./StStateDraft";

class StStateMode extends enumOf("stStateMode", ["fit", "fill"] as const) {}

const StStateNote = via((f) => ({ title: f(String) }));

const mount = (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return () => {
    act(() => root.unmount());
    container.remove();
  };
};

describe("StStateDraft", () => {
  test("the type publishes the read and, with set, the setter tool's schema", async () => {
    const surface = new AgenticSurface();
    const seen: string[] = [];
    const Panel = () => {
      const [mode] = new StStateDraft("mode", StStateMode, { set: true })
        .desc("How the preview is fitted.")
        .init("fit");
      seen.push(mode);
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );
    expect(surface.read("mode")).toBe("fit");
    expect(surface.snapshot().tools[0]).toEqual({
      name: "setMode",
      description: "Set mode. How the preview is fitted.",
      parameters: {
        type: "object",
        properties: { value: { type: "string", enum: ["fit", "fill"] } },
        required: ["value"],
        additionalProperties: false,
      },
      needsConfirm: false,
    });
    await act(async () => {
      await surface.call("setMode", { value: "fill" });
    });
    expect(seen.at(-1)).toBe("fill");
    await expect(surface.call("setMode", { value: "zoom" })).rejects.toThrow("must be one of: fit, fill");
    unmount();
  });

  // `via.ts` augments the global String and Boolean constructors with model field metadata, so these two are the
  // declarations that can silently hand back a model state object instead of the scalar.
  test("a String or Boolean state hands back the scalar, and its setter takes one", async () => {
    const surface = new AgenticSurface();
    const seen: [string, boolean][] = [];
    const Panel = () => {
      const [tab] = new StStateDraft("tab", String, { set: true }).desc("Which tab is showing.").init("all");
      const [open] = new StStateDraft("open", Boolean, { set: true }).desc("Whether the panel is open.").init(false);
      seen.push([tab, open]);
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );
    expect(seen.at(-1)).toEqual(["all", false]);
    expect(surface.snapshot().tools.map((entry) => entry.parameters)).toEqual([
      { type: "object", properties: { value: { type: "boolean" } }, required: ["value"], additionalProperties: false },
      { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false },
    ]);
    await act(async () => {
      await surface.call("setTab", { value: "archive" });
    });
    expect(seen.at(-1)).toEqual(["archive", false]);
    unmount();
  });

  test("without set the key is readable and no setter is published", () => {
    const surface = new AgenticSurface();
    const Panel = () => {
      new StStateDraft("draft", StStateNote).desc("The note being drafted.").init(null);
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );
    expect(surface.snapshot().tools).toEqual([]);
    expect(surface.read("draft")).toBeNull();
    unmount();
  });

  test("a set nothing can describe costs the write, not the read and not the render", () => {
    const surface = new AgenticSurface();
    const errors: string[] = [];
    const error = console.error;
    console.error = (message: unknown) => errors.push(String(message));
    const Panel = () => {
      new StStateDraft("draft", StStateNote, { set: true }).desc("The note being drafted.").init({ title: "hello" });
      return <output>rendered</output>;
    };
    try {
      const unmount = mount(
        <AgentProvider surface={surface}>
          <Panel />
        </AgentProvider>,
      );
      expect(surface.snapshot().tools).toEqual([]);
      expect(surface.read("draft")).toEqual({ title: "hello" });
      expect(errors[0]).toContain('st.useState("draft") stays read-only');
      unmount();
    } finally {
      console.error = error;
    }
  });
});
