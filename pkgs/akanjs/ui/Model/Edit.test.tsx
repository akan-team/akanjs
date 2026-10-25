import "../../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { itemFixtureOf, l, mountSuspense, setTestEnv, waitFor } from "../testHelpers.fixture";

let Edit: typeof import("./Edit").default;
let makeStore: () => void;

const slice = { refName: "editTestItem", sliceName: "editTestItem", argLength: 1 };
const modelId = "aaaaaaaaaaaaaaaaaaaaaa01";

beforeAll(async () => {
  setTestEnv("editbuttontest");
  const { Full, storeMaker } = await itemFixtureOf("editTestItem");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: { sortKeyMap: new Map([["editTestItem", ["latest"]]]) },
  } as never);
  makeStore = storeMaker({
    root: "editButtonRoot",
    calls: { editTestItem: mock(async (id: string) => new Full({ id, title: "Ada" })) },
  });
  ({ default: Edit } = await import("./Edit"));
});

describe("Model.Edit", () => {
  test("opens its form under the modal name it was given", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const { unmount } = await mountSuspense(
      <AgentProvider surface={surface}>
        <Edit slice={slice} modelId={modelId} modal="quick">
          <div>quick form</div>
        </Edit>
      </AgentProvider>,
    );
    await act(async () => {
      await surface.call("editEditTestItem", { modelId });
    });
    await waitFor(() => document.body.textContent?.includes("quick form") ?? false);

    expect(document.body.textContent).toContain("quick form");
    unmount();
  });

  test("draws its form in the presentation and placement it was given", async () => {
    makeStore();
    const surface = new AgenticSurface();
    const { unmount } = await mountSuspense(
      <AgentProvider surface={surface}>
        <Edit slice={slice} modelId={modelId} presentation="auto" placement="right">
          <div>side form</div>
        </Edit>
      </AgentProvider>,
    );
    await act(async () => {
      await surface.call("editEditTestItem", { modelId });
    });
    await waitFor(() => document.body.textContent?.includes("side form") ?? false);

    const panel = document.querySelector('[role="dialog"]');
    expect(panel?.className).toContain("md:max-w-md");
    expect(panel?.parentElement?.className).toContain("md:justify-end");
    unmount();
  });
});
