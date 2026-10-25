import "../../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { mount, mountAsync, setTestEnv } from "../testHelpers.fixture";

let List: typeof import("./Collection").List;
let Tags: typeof import("./Collection").Tags;
let ToggleSelect: typeof import("../ToggleSelect").ToggleSelect;
let Modal: typeof import("../Modal").Modal;

beforeAll(async () => {
  setTestEnv("collectiontest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l: (key: string) => key }) } as never);
  ({ List, Tags } = await import("./Collection"));
  ({ ToggleSelect } = await import("../ToggleSelect"));
  ({ Modal } = await import("../Modal"));
});

const inForm = (onSubmit: () => void, children: React.ReactNode) => (
  <form
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    {children}
  </form>
);

describe("buttons inside a form", () => {
  test("a list's add and remove buttons run their action without submitting", () => {
    let submits = 0;
    const added: number[] = [];
    const changed: string[][] = [];
    const { container, unmount } = mount(
      inForm(
        () => {
          submits += 1;
        },
        <List
          value={["a", "b"]}
          onAdd={() => added.push(1)}
          onChange={(next) => changed.push(next)}
          renderItem={(item) => <span>{item}</span>}
        />,
      ),
    );
    const buttons = [...container.querySelectorAll("button")];
    act(() => buttons[0]?.click());
    act(() => buttons.at(-1)?.click());
    expect(changed).toEqual([["b"]]);
    expect(added).toEqual([1]);
    expect(submits).toBe(0);
    unmount();
  });

  test("a toggle-select option changes the value without submitting", () => {
    let submits = 0;
    const picked: string[] = [];
    const { container, unmount } = mount(
      inForm(
        () => {
          submits += 1;
        },
        <ToggleSelect
          items={["one", "two"]}
          value="one"
          nullable={false}
          validate={() => true}
          onChange={(value) => picked.push(value)}
        />,
      ),
    );
    const options = [...container.querySelectorAll("button")];
    act(() => options[1]?.click());
    expect(picked).toEqual(["two"]);
    expect(submits).toBe(0);
    unmount();
  });
});

describe("Tags", () => {
  test("Escape cancels the tag being typed and leaves the modal around it open", async () => {
    const onCancel = mock(() => undefined);
    const onChange = mock((_tags: string[]) => undefined);
    const { unmount } = await mountAsync(
      <Modal open onCancel={onCancel}>
        <Tags value={["a"]} onChange={onChange} />
      </Modal>,
    );
    try {
      const newTag = [...document.querySelectorAll<HTMLElement>('[role="dialog"] div')].find(
        (node) => node.textContent === "New Tag",
      );
      act(() => newTag?.click());
      const input = document.querySelector<HTMLInputElement>('[role="dialog"] input');
      const key = Object.keys(input ?? {}).find((name) => name.startsWith("__reactProps$"));
      const props = (input as unknown as { [key: string]: { onChange?: (event: unknown) => void } } | null)?.[
        key ?? ""
      ];
      if (!input || !props) throw new Error("tag input did not open");
      act(() => props.onChange?.({ target: { value: "draft" } }));

      act(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });
      expect(onCancel).not.toHaveBeenCalled();
      expect(document.querySelector('[role="dialog"] input')).toBeNull();
      expect(onChange).not.toHaveBeenCalled();

      act(() => {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      });
      expect(onCancel).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
    }
  });
});
