import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { ChatMessage, ToolCallResult } from "use-agentic";
import { mount } from "../testHelpers.fixture";
import type { ToolRowProps } from "./ToolRow";

let Bubble: typeof import("./Bubble").default;
let DefaultToolRow: typeof import("./ToolRow").DefaultToolRow;
let UiOverrideProvider: typeof import("../UiOverride").UiOverrideProvider;

beforeAll(async () => {
  const { registerClientRuntime } = await import("akanjs/client");
  const l = Object.assign((key: string) => key, { trans: () => "" }) as never;
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }) } as never);
  ({ default: Bubble } = await import("./Bubble"));
  ({ DefaultToolRow } = await import("./ToolRow"));
  ({ UiOverrideProvider } = await import("../UiOverride"));
});

describe("AgentToolRow", () => {
  test("a bound component draws every call's row with its result or progress, and can wrap the default", () => {
    const seen = new Map<string, ToolRowProps>();
    const Skin = (props: ToolRowProps) => {
      seen.set(props.name, props);
      return (
        <div data-skin={props.name}>
          <DefaultToolRow {...props} className="skinned" />
        </div>
      );
    };
    const listed: ToolCallResult = { id: "c1", name: "eventList", result: ["standup"] };
    const message = {
      role: "assistant",
      text: "",
      toolCalls: [
        { id: "c1", name: "eventList", args: { day: "mon" } },
        { id: "c2", name: "readPage", args: {} },
        { id: "q1", name: "askUser", args: { question: "Which calendar?" } },
      ],
    } as unknown as ChatMessage;
    const toolMessage = { role: "tool", toolResults: [listed] } as unknown as ChatMessage;
    const progress = { callId: "c2", message: "reading" };
    const { container: host, unmount } = mount(
      <UiOverrideProvider value={{ AgentToolRow: Skin }}>
        <Bubble message={message} progress={progress} results={new Map([["c1", listed]])} />
      </UiOverrideProvider>,
    );
    expect([...host.querySelectorAll("[data-skin]")].map((row) => row.getAttribute("data-skin"))).toEqual([
      "eventList",
      "readPage",
    ]);
    expect(seen.get("eventList")).toMatchObject({ args: { day: "mon" }, result: listed, progress: null });
    expect(seen.get("readPage")).toMatchObject({ args: {}, progress });
    expect(seen.get("readPage")?.result).toBeUndefined();
    expect(host.querySelectorAll(".skinned")).toHaveLength(2);
    unmount();

    seen.clear();
    const { container: toolHost, unmount: unmountTool } = mount(
      <UiOverrideProvider value={{ AgentToolRow: Skin }}>
        <Bubble message={toolMessage} />
      </UiOverrideProvider>,
    );
    expect(toolHost.querySelector("[data-skin]")?.getAttribute("data-skin")).toBe("eventList");
    expect(seen.get("eventList")?.result).toEqual(listed);
    unmountTool();
  });
});
