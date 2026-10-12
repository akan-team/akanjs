import "../../test/registerDom";
import { describe, expect, mock, test } from "bun:test";
import { act } from "react";
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
});
