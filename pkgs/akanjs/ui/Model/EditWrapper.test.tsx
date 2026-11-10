import "../../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { itemFixtureOf, l, mountSuspense, setTestEnv } from "../testHelpers.fixture";

let EditWrapper: typeof import("./EditWrapper").default;
let ViewWrapper: typeof import("./ViewWrapper").default;
let RemoveWrapper: typeof import("./RemoveWrapper").default;
let calls: Record<string, ReturnType<typeof mock>>;
let makeStore: () => void;

const slice = { refName: "rowTestItem", sliceName: "rowTestItem", argLength: 1 };
const rowIds = ["aaaaaaaaaaaaaaaaaaaaaa01", "aaaaaaaaaaaaaaaaaaaaaa02", "aaaaaaaaaaaaaaaaaaaaaa03"];

beforeAll(async () => {
  setTestEnv("rowwrappertest");
  const { Full, storeMaker } = await itemFixtureOf("rowTestItem");
  const { registerClientRuntime } = await import("akanjs/client");
  calls = { rowTestItem: mock(async (id: string) => new Full({ id, title: "Ada" })) };
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map([["rowTestItem", ["latest"]]]) },
  } as never);
  makeStore = storeMaker({ root: "rowWrapperRoot", calls });
  ({ default: EditWrapper } = await import("./EditWrapper"));
  ({ default: ViewWrapper } = await import("./ViewWrapper"));
  ({ default: RemoveWrapper } = await import("./RemoveWrapper"));
});

describe("Model row wrappers", () => {
  test("every row registers the one verb, and the id it acts on comes from the call", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      const { container, unmount } = await mountSuspense(
        <AgentProvider surface={surface}>
          {rowIds.map((id) => (
            <EditWrapper key={id} slice={slice} modelId={id}>
              <span>{id}</span>
            </EditWrapper>
          ))}
        </AgentProvider>,
      );

      const tools = surface.snapshot().tools;
      expect(tools.map((tool) => tool.name)).toEqual(["editRowTestItem"]);
      expect(warnings).toEqual([]);
      expect(container.querySelectorAll('[data-akan-action="editRowTestItem"]')).toHaveLength(rowIds.length);
      expect(tools[0].parameters?.properties).toEqual({ modelId: { type: "string" } });

      await act(async () => {
        await surface.call("editRowTestItem", { modelId: rowIds[1] });
      });
      expect(calls.rowTestItem).toHaveBeenCalledWith(rowIds[1], expect.any(Object));
      unmount();
    } finally {
      console.warn = warn;
    }
  });

  test("the detail and removal wrappers publish their own verb, and removal asks first", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const { unmount } = await mountSuspense(
      <AgentProvider surface={surface}>
        <ViewWrapper slice={slice} modelId={rowIds[0]}>
          <span>view</span>
        </ViewWrapper>
        <RemoveWrapper slice={slice} modelId={rowIds[0]} name="Ada">
          <span>remove</span>
        </RemoveWrapper>
      </AgentProvider>,
    );

    const tools = surface.snapshot().tools;
    expect(tools.map((tool) => tool.name).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
      "removeRowTestItem",
      "viewRowTestItem",
    ]);
    expect(tools.find((tool) => tool.name === "removeRowTestItem")?.needsConfirm).toBe(true);
    expect(tools.find((tool) => tool.name === "viewRowTestItem")?.needsConfirm).toBe(false);
    unmount();
  });
});
