import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { l, mount, setTestEnv, waitFor } from "./testHelpers.fixture";

let Button: typeof import("./Button").Button;

beforeAll(async () => {
  setTestEnv("buttontest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }) } as never);
  ({ Button } = await import("./Button"));
});

describe("Button", () => {
  test("keeps the error an onClick reported through onError when it then rejects", async () => {
    let settled = false;
    const { container, unmount } = mount(
      <Button
        onClick={async (_event, { onError }) => {
          await Promise.resolve();
          onError("button.error.refused");
          settled = true;
          throw new Error("refused");
        }}
      >
        save
      </Button>,
    );
    await act(async () => {
      container.querySelector("button")?.click();
    });
    await waitFor(() => settled);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("button.error.refused");
    expect(container.querySelector("button")?.disabled).toBe(false);
    unmount();
  });

  test("a rejection with no onError goes back to idle without an error line", async () => {
    let settled = false;
    const { container, unmount } = mount(
      <Button
        onClick={async () => {
          await Promise.resolve();
          settled = true;
          throw new Error("refused");
        }}
      >
        save
      </Button>,
    );
    await act(async () => {
      container.querySelector("button")?.click();
    });
    await waitFor(() => settled);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("button")?.disabled).toBe(false);
    unmount();
  });
});
