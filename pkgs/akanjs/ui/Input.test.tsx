import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, createRef, useState } from "react";
import { mount, setTestEnv } from "./testHelpers.fixture";

let Input: typeof import("./Input").Input;

beforeAll(async () => {
  setTestEnv("inputtest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l: (key: string) => key }) } as never);
  ({ Input } = await import("./Input"));
});

describe("Input", () => {
  test("drops its invalid message once the value is emptied from outside", () => {
    let empty = () => undefined;
    const Form = () => {
      const [value, setValue] = useState("a");
      empty = () => {
        setValue("");
      };
      return <Input value={value} validate={(text) => text.length >= 2 || "too short"} />;
    };
    const { container, unmount } = mount(<Form />);
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      input.focus();
      input.blur();
    });
    expect(container.textContent).toContain("too short");
    act(() => empty());
    expect(container.textContent).not.toContain("too short");
    unmount();
  });
});

describe("Input.Password", () => {
  test("toggles visibility without submitting the form it sits in", () => {
    let submits = 0;
    const { container, unmount } = mount(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submits += 1;
        }}
      >
        <Input.Password value="secret" onChange={() => undefined} validate={() => true} />
      </form>,
    );
    const toggle = container.querySelector("button") as HTMLButtonElement;
    act(() => toggle.click());
    expect(container.querySelector("input")?.type).toBe("text");
    expect(submits).toBe(0);
    unmount();
  });
});

describe("Input.TextArea", () => {
  test("attaches inputRef to the textarea instead of spreading it onto the DOM", () => {
    const inputRef = createRef<HTMLTextAreaElement>();
    const { container, unmount } = mount(<Input.TextArea inputRef={inputRef} value="memo" validate={() => true} />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(inputRef.current).toBe(textarea);
    expect(textarea?.hasAttribute("inputref")).toBe(false);
    expect(textarea?.hasAttribute("inputRef")).toBe(false);
    unmount();
  });
});

describe("Input.Number", () => {
  test("keeps the decimal point when Enter settles a typed value", async () => {
    const entered: unknown[] = [];
    const { container, unmount } = mount(
      <Input.Number
        value={0.25}
        formatter={(value) => value.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
        onChange={() => undefined}
        onPressEnter={(value) => entered.push(value)}
      />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    const propsKey = Object.keys(input).find((name) => name.startsWith("__reactProps$")) ?? "";
    const props = (input as unknown as { [key: string]: { onKeyDown: (event: unknown) => void } })[propsKey];
    for (const typed of ["0.25", "-1,234.5"]) {
      input.value = typed;
      await act(async () => props?.onKeyDown({ key: "Enter", currentTarget: input }));
    }
    expect(entered).toEqual([0.25, -1234.5]);
    expect(input.value).toBe("-1,234.5");
    unmount();
  });
});
