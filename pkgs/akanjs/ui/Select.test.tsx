import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { enumOf } from "akanjs/base";
import { act, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server.browser";
import { setTestEnv } from "./testHelpers.fixture";

let Select: typeof import("./Select").Select;

beforeAll(async () => {
  setTestEnv("selecttest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({
    usePage: () => ({
      path: "/",
      lang: "en",
      l: Object.assign((key: string) => key, {
        _: (key: string) => (key === "selectTestShade.warm" ? "Warm Tone" : key),
      }),
    }),
    fetch: { sortKeyMap: new Map() },
  } as never);
  ({ Select } = await import("./Select"));
});

/** Renders with `document` taken away, which is the only difference the server render actually sees. */
const renderServer = async (node: ReactNode) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Reflect.deleteProperty(globalThis, "document");
  try {
    return await new Response(await renderToReadableStream(node)).text();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
  }
};

const hydrate = async (node: ReactNode) => {
  const html = await renderServer(node);
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = html;
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | null = null;
  await act(async () => {
    root = hydrateRoot(container, node, {
      onRecoverableError: (error) => {
        errors.push(error);
      },
    });
  });
  return {
    container,
    errors,
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
};

const field = () => <Select<"a" | "b"> value="a" options={["a", "b"]} onChange={() => undefined} />;

// Newest direct child of body: a panel leaked by a crashed earlier test would otherwise shadow this one.
const panelOf = () => [...document.body.querySelectorAll(":scope > [data-open]")].at(-1);

const rowsOf = () => [...(panelOf()?.querySelectorAll(":scope > .group") ?? [])];

const click = async (el: Element | undefined) => {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** Dismissal listens on mousedown, which is what a click outside has to be to reach it. */
const clickOutside = async () => {
  await act(async () => {
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
};

const triggerOf = (container: HTMLElement) => container.querySelector("[role=combobox]") as HTMLElement;

const press = async (container: HTMLElement, key: string) => {
  await act(async () => {
    triggerOf(container).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
};

/** Drives the search input through React's own handler, which a synthetic value assignment never reaches. */
const type = async (container: HTMLElement, value: string) => {
  const input = container.querySelector("input");
  const key = Object.keys(input ?? {}).find((name) => name.startsWith("__reactProps$"));
  const props = (input as unknown as { [key: string]: { onChange?: (event: unknown) => void } })[key ?? ""];
  await act(async () => props.onChange?.({ target: { value } }));
};

describe("Select", () => {
  test("hydrates an SSR render without a mismatch", async () => {
    const { errors, unmount } = await hydrate(field());
    expect(errors).toEqual([]);
    unmount();
  });

  test("mounts the options panel outside the field once the client has it", async () => {
    const { container, unmount } = await hydrate(field());
    const panel = [...document.body.querySelectorAll("[data-open]")].find((el) => !container.contains(el));
    expect(panel).toBeDefined();
    expect(panel?.parentElement).toBe(document.body);
    expect(panel?.getAttribute("data-open")).toBe("false");
    unmount();
  });
});

describe("Select options", () => {
  test("reads a label/value list whose first row carries a falsy value", async () => {
    const { unmount } = await hydrate(
      <Select<"wide" | null>
        value="wide"
        options={[
          { label: "-", value: null },
          { label: "Wide", value: "wide" },
        ]}
        onChange={() => undefined}
      />,
    );
    expect(rowsOf().map((el) => el.textContent)).toEqual(["-", "Wide"]);
    unmount();
  });

  test("reads a label/value list whose first row carries a falsy label", async () => {
    const { unmount } = await hydrate(
      <Select<"a" | "b">
        value="a"
        options={[
          { label: "", value: "a" },
          { label: "B", value: "b" },
        ]}
        onChange={() => undefined}
      />,
    );
    expect(rowsOf().map((el) => el.textContent)).toEqual(["", "B"]);
    unmount();
  });

  test("shows the label of a selected falsy value", async () => {
    const { container, unmount } = await hydrate(
      <Select<number>
        value={0}
        options={[
          { label: "Zero", value: 0 },
          { label: "One", value: 1 },
        ]}
        onChange={() => undefined}
      />,
    );
    expect(container.textContent).toContain("Zero");
    unmount();
  });

  test("still reads a bare value list", async () => {
    const { unmount } = await hydrate(field());
    expect(rowsOf().map((el) => el.textContent)).toEqual(["a", "b"]);
    unmount();
  });

  test("names an enum's values through its dictionary, and keeps a value it does not name", async () => {
    class Shade extends enumOf("selectTestShade", ["warm", "cool"] as const) {}
    const { unmount } = await hydrate(
      <Select<"warm" | "cool"> value="warm" options={Shade} onChange={() => undefined} />,
    );
    expect(rowsOf().map((el) => el.textContent)).toEqual(["Warm Tone", "cool"]);
    unmount();
  });
});

describe("Select nullable", () => {
  test("clears the value from its own row", async () => {
    const writes: unknown[] = [];
    const { unmount } = await hydrate(
      <Select<"wide" | "tall" | null>
        nullable
        value="wide"
        options={["wide", "tall"]}
        onChange={(value) => void writes.push(value)}
      />,
    );
    await click(rowsOf()[0]?.firstElementChild ?? undefined);
    expect(writes).toEqual([null]);
    unmount();
  });

  test("offers no such row when it is not nullable", async () => {
    const { unmount } = await hydrate(field());
    expect(rowsOf()).toHaveLength(2);
    unmount();
  });
});

describe("Select value", () => {
  test("keeps the parent's value on screen when the parent refuses the change", async () => {
    const { container, unmount } = await hydrate(
      <Select<"a" | "b"> value="a" options={["a", "b"]} onChange={() => undefined} />,
    );
    await click(rowsOf()[1]?.firstElementChild ?? undefined);
    expect(triggerOf(container).textContent).toContain("a");
    expect(triggerOf(container).textContent).not.toContain("b");
    unmount();
  });

  test("shows the placeholder while nothing is selected", async () => {
    const { container, unmount } = await hydrate(
      <Select<"a" | "b" | null> value={null} placeholder="Pick one" options={["a", "b"]} onChange={() => undefined} />,
    );
    expect(triggerOf(container).textContent).toContain("Pick one");
    unmount();
  });

  test("renders the label it is given", async () => {
    const { container, unmount } = await hydrate(
      <Select<"a" | "b"> label="Status" value="a" options={["a", "b"]} onChange={() => undefined} />,
    );
    expect(container.textContent).toContain("Status");
    unmount();
  });

  test("renders a selected value the options do not carry", async () => {
    const { container, unmount } = await hydrate(
      <Select<"a" | "b"> value="a" options={["b"]} onChange={() => undefined} />,
    );
    expect(triggerOf(container).textContent).toContain("a");
    unmount();
  });

  test("renders a selected chip the options do not carry", async () => {
    const { container, unmount } = await hydrate(
      <Select<string, true> multiple value={["a"]} options={["b"]} onChange={() => undefined} />,
    );
    expect(triggerOf(container).textContent).toContain("a");
    unmount();
  });

  test("shows a spinner instead of the empty placeholder while the options load", async () => {
    const { unmount } = await hydrate(
      <Select<"a" | null> loading value={null} options={[]} onChange={() => undefined} />,
    );
    expect(panelOf()?.textContent).not.toContain("base.noOptions");
    expect(panelOf()?.querySelectorAll("svg")).toHaveLength(1);
    unmount();
  });

  test("offers the clear button only when it is nullable", async () => {
    const plain = await hydrate(field());
    expect(triggerOf(plain.container).querySelectorAll("svg")).toHaveLength(1);
    plain.unmount();
    const clearable = await hydrate(
      <Select<"a" | "b"> nullable value="a" options={["a", "b"]} onChange={() => undefined} />,
    );
    expect(triggerOf(clearable.container).querySelectorAll("svg")).toHaveLength(2);
    clearable.unmount();
  });
});

describe("Select search", () => {
  const searchable = (onChange: (value: string) => void = () => undefined) => (
    <Select<string, false, true>
      searchable
      value="alpha"
      options={[
        { label: "alpha", value: "alpha" },
        { label: "beta", value: "beta" },
      ]}
      onChange={onChange}
    />
  );

  test("keeps showing the selected value when the search filters it out", async () => {
    const { container, unmount } = await hydrate(searchable());
    await type(container, "bet");
    expect(rowsOf().map((el) => el.textContent)).toEqual(["beta"]);
    expect(triggerOf(container).textContent).toContain("alpha");
    unmount();
  });

  test("drops the search when the panel closes", async () => {
    const { container, unmount } = await hydrate(searchable());
    await click(triggerOf(container));
    await type(container, "bet");
    expect(rowsOf()).toHaveLength(1);
    await clickOutside();
    expect(container.querySelector("input")?.value).toBe("");
    expect(rowsOf()).toHaveLength(2);
    unmount();
  });
});

describe("Select keyboard", () => {
  test("opens, walks and commits an option without a pointer", async () => {
    const writes: unknown[] = [];
    const { container, unmount } = await hydrate(
      <Select<"a" | "b"> value="a" options={["a", "b"]} onChange={(value) => void writes.push(value)} />,
    );
    await press(container, "ArrowDown");
    expect(triggerOf(container).getAttribute("aria-expanded")).toBe("true");
    await press(container, "ArrowDown");
    await press(container, "Enter");
    expect(writes).toEqual(["b"]);
    expect(triggerOf(container).getAttribute("aria-expanded")).toBe("false");
    unmount();
  });

  test("closes on Escape without choosing anything", async () => {
    const writes: unknown[] = [];
    const { container, unmount } = await hydrate(
      <Select<"a" | "b"> value="a" options={["a", "b"]} onChange={(value) => void writes.push(value)} />,
    );
    await press(container, "ArrowDown");
    await press(container, "Escape");
    expect(triggerOf(container).getAttribute("aria-expanded")).toBe("false");
    expect(writes).toEqual([]);
    unmount();
  });

  test("stops at the ends of the list", async () => {
    const { container, unmount } = await hydrate(field());
    await press(container, "ArrowDown");
    await press(container, "ArrowUp");
    await press(container, "ArrowUp");
    expect(triggerOf(container).getAttribute("aria-activedescendant")).toBe(rowsOf()[0]?.firstElementChild?.id ?? null);
    unmount();
  });
});

describe("Select aria", () => {
  test("names the panel it controls and marks the selected option", async () => {
    const { container, unmount } = await hydrate(field());
    const trigger = triggerOf(container);
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(panelOf()?.getAttribute("role")).toBe("listbox");
    expect(trigger.getAttribute("aria-controls")).toBe(panelOf()?.id ?? null);
    expect(rowsOf().map((el) => el.firstElementChild?.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    unmount();
  });

  test("takes the closed panel out of the accessibility tree", async () => {
    const { container, unmount } = await hydrate(field());
    expect(panelOf()?.getAttribute("aria-hidden")).toBe("true");
    await press(container, "ArrowDown");
    expect(panelOf()?.getAttribute("aria-hidden")).toBe("false");
    unmount();
  });
});
