import "../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { mountAsync, setTestEnv } from "./testHelpers.fixture";

let BottomSheet: typeof import("./BottomSheet").BottomSheet;

beforeAll(async () => {
  setTestEnv("bottomsheettest");
  ({ BottomSheet } = await import("./BottomSheet"));
});

const settle = async () => {
  for (let i = 0; i < 5; i += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

describe("BottomSheet", () => {
  test("a closed sheet reports no dismissal when it mounts", async () => {
    const onCancel = mock(() => undefined);
    const { unmount } = await mountAsync(
      <BottomSheet type="half" open={false} onCancel={onCancel}>
        <p>body</p>
      </BottomSheet>,
    );
    await settle();

    expect(onCancel).not.toHaveBeenCalled();
    unmount();
  });

  test("an open sheet sits on the overlay layer, locks the page, and reports one dismissal from the backdrop", async () => {
    const onCancel = mock(() => undefined);
    const { container, unmount } = await mountAsync(
      <BottomSheet type="half" open onCancel={onCancel}>
        <p>sheet body</p>
      </BottomSheet>,
    );
    await settle();

    const backdrop = [...document.body.querySelectorAll<HTMLElement>(".backdrop-blur-sm")].at(-1);
    expect(container.textContent).not.toContain("sheet body");
    expect(document.body.textContent).toContain("sheet body");
    expect(document.body.style.overflow).toBe("hidden");
    act(() => backdrop?.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
  });
});
