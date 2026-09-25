import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { Dayjs } from "akanjs/base";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";

let Field: typeof import("./Field").Field;
let DraggableList: typeof import("./DraggableList").DraggableList;
let dayjs: typeof import("akanjs/base").dayjs;
let actionTagOf: typeof import("akanjs/store").actionTagOf;
let tagAction: typeof import("akanjs/store").tagAction;

/** Imported after the environment is set: `akanjs/store`'s baseSt reads the env while the module evaluates. */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "fieldtest";
  process.env.AKAN_PUBLIC_REPO_NAME = "fieldtest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  ({ dayjs } = await import("akanjs/base"));
  ({ actionTagOf, tagAction } = await import("akanjs/store"));
  ({ Field } = await import("./Field"));
  ({ DraggableList } = await import("./DraggableList"));

  const { Int } = await import("akanjs/base");
  const { ConstantRegistry, via } = await import("akanjs/constant");
  const { registerClientRuntime } = await import("akanjs/client");
  const { store, StoreRegistry } = await import("akanjs/store");
  const Input = via((f) => ({ aliases: f([String]) }));
  const Obj = via(Input, () => ({}));
  const Light = via(Obj, ["aliases"] as const, () => ({}));
  const Full = via(Obj, Light, () => ({}));
  const Insight = via(Full, (f) => ({ count: f(Int, { default: 0 }) }));
  ConstantRegistry.buildModel("fieldListItem", Input, Obj, Full, Light, Insight, {});
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l: Object.assign((key: string) => key, { _: (key: string) => key }) }),
    fetch: { sortKeyMap: new Map() },
  } as never);
  class ListStore extends store("fieldList" as const, () => ({
    fieldListItemForm: { aliases: ["a", "b", "c"] } as { [key: string]: unknown },
  })) {
    setAliasesOnFieldListItem(value: string[]) {
      listWrites.push(value);
    }
  }
  StoreRegistry.register(ListStore);
  StoreRegistry.instance.addStore(StoreRegistry.merge("fieldListRoot", ListStore));
  setAliases = StoreRegistry.instance.do.setAliasesOnFieldListItem as (value: unknown) => void;
});

const listWrites: string[][] = [];
let setAliases: (value: unknown) => void;

/**
 * The `onChange` React is holding for a rendered node.
 *
 * Read off the fiber rather than driven with a synthetic event: React's change plugin does not fire under
 * happy-dom (a dispatched `input` reaches the root container in both phases and React extracts nothing), while
 * `click` does. So a control's own handler is reached directly, which is the composition under test anyway.
 */
const handlerOf = (el: Element) => {
  const key = Object.keys(el).find((name) => name.startsWith("__reactProps$"));
  const props = (el as unknown as { [key: string]: { onChange?: (event: unknown) => void } })[key ?? ""];
  return (value: string) => act(() => props.onChange?.({ target: { value } }));
};

const render = (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  const inputs = [...container.querySelectorAll("input")];
  return {
    changeFrom: handlerOf(inputs[0]),
    changeTo: handlerOf(inputs[1]),
    annotations: () =>
      [...container.querySelectorAll("[data-akan-action]")].map((el) => [
        el.getAttribute("data-akan-action"),
        el.getAttribute("data-akan-state"),
      ]),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

describe("Field.DateRange", () => {
  const setter = (calls: string[], action: string) =>
    tagAction(() => void calls.push(action), { action, state: `periodForm.${action}` });
  const span = (from: Dayjs, to: Dayjs) => `${from.format("YYYY-MM-DD")}~${to.format("YYYY-MM-DD")}`;

  test("each endpoint writes its own setter when no range callback is wired", () => {
    const calls: string[] = [];
    const view = render(
      <Field.DateRange
        from={dayjs("2026-01-01")}
        to={dayjs("2026-01-31")}
        onChangeFrom={setter(calls, "setFromOnPeriod")}
        onChangeTo={setter(calls, "setToOnPeriod")}
      />,
    );

    view.changeFrom("2026-02-01");
    view.changeTo("2026-02-28");
    expect(calls).toEqual(["setFromOnPeriod", "setToOnPeriod"]);
    view.unmount();
  });

  test("the range callback fires with both ends after either one moves", () => {
    const calls: string[] = [];
    const pairs: string[] = [];
    const view = render(
      <Field.DateRange
        from={dayjs("2026-01-01")}
        to={dayjs("2026-01-31")}
        onChangeFrom={setter(calls, "setFromOnPeriod")}
        onChangeTo={setter(calls, "setToOnPeriod")}
        onChange={(from, to) => void pairs.push(span(from, to))}
      />,
    );

    view.changeFrom("2026-02-01");
    view.changeTo("2026-03-31");
    expect(pairs).toEqual(["2026-02-01~2026-01-31", "2026-01-01~2026-03-31"]);
    // The endpoint setter still ran: the callback is added to it, never put in place of it.
    expect(calls).toEqual(["setFromOnPeriod", "setToOnPeriod"]);
    view.unmount();
  });

  test("wiring the range callback costs neither endpoint its annotation", () => {
    const calls: string[] = [];
    const view = render(
      <Field.DateRange
        from={dayjs("2026-01-01")}
        to={dayjs("2026-01-31")}
        onChangeFrom={setter(calls, "setFromOnPeriod")}
        onChangeTo={setter(calls, "setToOnPeriod")}
        onChange={() => undefined}
      />,
    );

    expect(view.annotations()).toEqual([
      ["setFromOnPeriod", "periodForm.setFromOnPeriod"],
      ["setToOnPeriod", "periodForm.setToOnPeriod"],
    ]);
    view.unmount();
  });

  test("a half-open range notifies nobody — there is nothing to query over", () => {
    const pairs: unknown[] = [];
    const view = render(
      <Field.DateRange<true>
        nullable
        from={dayjs("2026-01-01")}
        to={null}
        onChangeFrom={() => undefined}
        onChangeTo={() => undefined}
        onChange={(from, to) => void pairs.push([from, to])}
      />,
    );

    view.changeFrom("2026-02-01");
    expect(pairs).toEqual([]);
    view.unmount();
  });

  test("an untagged endpoint handler stays untagged — a guessed annotation is worse than none", () => {
    const view = render(
      <Field.DateRange
        from={dayjs("2026-01-01")}
        to={dayjs("2026-01-31")}
        onChangeFrom={() => undefined}
        onChangeTo={() => undefined}
        onChange={() => undefined}
      />,
    );

    expect(view.annotations()).toEqual([]);
    view.unmount();
  });

  test("the wrapper carries the setter's own tag, which is what keeps the field reachable", () => {
    const tagged = tagAction(() => undefined, { action: "setFromOnPeriod", state: "periodForm.from" });
    const wrapped = tagAction(() => tagged(), actionTagOf(tagged) ?? { action: "" });
    expect(actionTagOf(wrapped)).toEqual({ action: "setFromOnPeriod", state: "periodForm.from" });
  });
});

/**
 * `Field.TextList` composes `DraggableList`, and both are form controls that would publish the setter they hold.
 * The outer one owns the field (it carries `transform`), so it publishes and hands the inner list a wrapper.
 */
describe("Field.TextList over DraggableList", () => {
  test("publishes the field once, with the reorder tool a drag list adds", async () => {
    const surface = new AgenticSurface();
    listWrites.length = 0;
    const warned: string[] = [];
    const original = console.warn;
    console.warn = (message: string) => void warned.push(message);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <AgentProvider surface={surface}>
          <Field.TextList value={["a", "b", "c"]} onChange={setAliases} />
        </AgentProvider>,
      ),
    );
    console.warn = original;

    expect(warned).toEqual([]);
    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual([
      "moveAliasesOnFieldListItem",
      "setAliasesOnFieldListItem",
    ]);
    await surface.call("moveAliasesOnFieldListItem", { from: 0, to: 2 });
    expect(listWrites).toEqual([["b", "c", "a"]]);
    act(() => root.unmount());
    container.remove();
    expect(surface.snapshot().tools).toHaveLength(0);
  });
  test("a DraggableList used directly publishes the field it was handed — the ReqDefDoc shape", async () => {
    const surface = new AgenticSurface();
    listWrites.length = 0;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <AgentProvider surface={surface}>
          <DraggableList onChange={setAliases} onRemove={() => undefined}>
            {["a", "b", "c"].map((alias) => (
              <DraggableList.Item key={alias} value={alias}>
                {alias}
              </DraggableList.Item>
            ))}
          </DraggableList>
        </AgentProvider>,
      ),
    );

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual([
      "moveAliasesOnFieldListItem",
      "setAliasesOnFieldListItem",
    ]);
    expect(container.querySelector("[data-akan-action]")?.getAttribute("data-akan-action")).toBe(
      "setAliasesOnFieldListItem",
    );
    await surface.call("moveAliasesOnFieldListItem", { from: 1, to: 0 });
    expect(listWrites).toEqual([["b", "a", "c"]]);
    act(() => root.unmount());
    container.remove();
  });
});

describe("Field.ToggleSelect", () => {
  const renderCells = (node: ReactNode) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(node));
    return {
      click: (label: string) => {
        const cell = [...container.querySelectorAll("button")].find((el) => el.textContent === label);
        act(() => cell?.click());
      },
      unmount: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  };

  test("a nullable field clears when the selected cell is clicked again", () => {
    const writes: (string | null)[] = [];
    const view = renderCells(
      <Field.ToggleSelect
        items={["draft", "live"]}
        value="live"
        nullable
        onChange={(value) => void writes.push(value)}
      />,
    );

    view.click("live");
    view.click("draft");
    expect(writes).toEqual([null, "draft"]);
    view.unmount();
  });

  test("a required field cannot be emptied — the selected cell rewrites its own value", () => {
    const writes: string[] = [];
    const view = renderCells(
      <Field.ToggleSelect items={["draft", "live"]} value="live" onChange={(value) => void writes.push(value)} />,
    );

    view.click("live");
    expect(writes).toEqual(["live"]);
    view.unmount();
  });
});
