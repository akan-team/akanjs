import "../../test/registerDom";
import { describe, expect, mock, test } from "bun:test";
import { act, type ReactNode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface } from "use-agentic";
import { type ScreenAction, useScreenActions } from "./useScreenActions";

describe("useScreenActions", () => {
  test("lists the actions that need no argument, and runs them as the control's click does", async () => {
    const surface = new AgenticSurface();
    const archive = mock(() => undefined);
    surface.registerTool([], {
      name: "archiveTicket",
      description: "Archive this ticket.",
      label: () => "티켓 보관",
      run: archive,
    });
    surface.registerTool([], {
      name: "assignTicket",
      parameters: { type: "object", properties: { userId: { type: "string" } }, required: ["userId"] },
      run: () => undefined,
    });
    surface.registerTool([], {
      name: "closeSprint",
      guard: () => "The sprint has open tickets.",
      run: () => undefined,
    });
    let actions: ScreenAction[] = [];
    const Probe = () => {
      actions = useScreenActions({ surface });
      return null;
    };
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe />));

    expect(actions.map((action) => action.name)).toEqual(["archiveTicket", "closeSprint"]);
    expect(actions[0]?.label).toBe("티켓 보관");
    expect(actions[1]?.label).toBeUndefined();
    expect(JSON.stringify(surface.snapshot().tools)).not.toContain("티켓 보관");
    await act(async () => {
      await actions[0]?.run();
    });
    expect(archive).toHaveBeenCalledTimes(1);
    expect(actions[1]?.run()).rejects.toThrow("The sprint has open tickets.");
    act(() => root.unmount());
  });

  test("lists the tools the children it wraps register in their own effects", () => {
    const surface = new AgenticSurface();
    let actions: ScreenAction[] = [];
    const Child = () => {
      useEffect(() => surface.registerTool([], { name: "archiveTicket", run: () => undefined }), []);
      return null;
    };
    const Palette = ({ children }: { children: ReactNode }) => {
      actions = useScreenActions({ surface });
      return children;
    };
    const root = createRoot(document.createElement("div"));
    act(() =>
      root.render(
        <Palette>
          <Child />
        </Palette>,
      ),
    );

    expect(actions.map((action) => action.name)).toEqual(["archiveTicket"]);
    act(() => root.unmount());
  });

  test("leaves out a tool the user answers with a card, which a pick has nothing to run for", () => {
    const surface = new AgenticSurface();
    surface.registerTool([], { name: "archiveTicket", run: () => undefined });
    surface.registerTool([], { name: "pickAssignee", description: "Ask the user to pick one.", card: () => null });
    let actions: ScreenAction[] = [];
    const Probe = () => {
      actions = useScreenActions({ surface });
      return null;
    };
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe />));

    expect(actions.map((action) => action.name)).toEqual(["archiveTicket"]);
    act(() => root.unmount());
  });
});
