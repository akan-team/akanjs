import "../../test/registerDom";
import { describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server.browser";
import { mount } from "../testHelpers.fixture";
import Stream from "./Stream";

/** A suspending first render has to settle inside an awaited `act`, or React warns and commits nothing. */
const mountAsync = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    rerender: async (next: ReactNode) => {
      await act(async () => {
        root.render(next);
      });
    },
    flush: async () => {
      await act(async () => {});
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
};

const renderHtml = async (node: ReactNode) => {
  const stream = await renderToReadableStream(node, { onError: () => undefined });
  await stream.allReady;
  return await new Response(stream).text();
};

describe("Load.Stream", () => {
  test("renders a resolved value inline, with no fallback in the first commit", () => {
    const { container, unmount } = mount(
      <Stream of={{ label: "resolved" }} fallback={<span>pending</span>}>
        {(value) => <span>{value.label}</span>}
      </Stream>,
    );
    expect(container.textContent).toBe("resolved");
    unmount();
  });

  test("renders the fallback while a thenable is pending, then the value", async () => {
    let settle!: (value: { label: string }) => void;
    const promise = new Promise<{ label: string }>((resolve) => {
      settle = resolve;
    });
    const { container, flush, unmount } = await mountAsync(
      <Stream of={promise} fallback={<span>pending</span>}>
        {(value) => <span>{value.label}</span>}
      </Stream>,
    );
    expect(container.textContent).toBe("pending");
    settle({ label: "arrived" });
    await flush();
    expect(container.textContent).toBe("arrived");
    await unmount();
  });

  test("renders nothing while pending when the fallback is null", async () => {
    const { container, unmount } = await mountAsync(
      <Stream of={new Promise<{ label: string }>(() => undefined)} fallback={null}>
        {(value) => <span>{value.label}</span>}
      </Stream>,
    );
    expect(container.textContent).toBe("");
    await unmount();
  });

  test("server-renders a resolved value into the shell", async () => {
    const html = await renderHtml(
      <Stream of={{ label: "in-shell" }} fallback={<span>pending</span>}>
        {(value) => <span>{value.label}</span>}
      </Stream>,
    );
    expect(html).toContain("in-shell");
    expect(html).not.toContain("pending");
  });

  // The regression this stage exists for: resolving in an effect ships the fallback and nothing else, leaving
  // the markup to the browser.
  test("server-renders a pending thenable's value once it lands", async () => {
    const html = await renderHtml(
      <Stream of={Promise.resolve({ label: "streamed" })} fallback={<span>pending</span>}>
        {(value) => <span>{value.label}</span>}
      </Stream>,
    );
    expect(html).toContain("streamed");
  });

  test("lets a resolved sibling reach the shell while a pending one arrives later in the stream", async () => {
    let release!: (value: { label: string }) => void;
    const held = new Promise<{ label: string }>((resolve) => {
      release = resolve;
    });
    const stream = await renderToReadableStream(
      <div>
        <Stream of={{ label: "shell-now" }} fallback={<span>pending-a</span>}>
          {(value) => <span>{value.label}</span>}
        </Stream>
        <Stream of={held} fallback={<span>pending-b</span>}>
          {(value) => <span>{value.label}</span>}
        </Stream>
      </div>,
    );
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    expect(first).toContain("shell-now");
    expect(first).toContain("pending-b");
    expect(first).not.toContain("streamed-later");

    release({ label: "streamed-later" });
    let rest = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) rest += decoder.decode(chunk.value);
    expect(rest).toContain("streamed-later");
  });

  // Past the shell React cannot turn a failure into a status code: the boundary must degrade and the stream close.
  test("a thenable that rejects after the shell degrades the boundary, not the stream", async () => {
    const seen: unknown[] = [];
    const collect = (reason: unknown) => seen.push(reason);
    process.on("unhandledRejection", collect);
    try {
      let fail!: (error: Error) => void;
      const held = new Promise<{ label: string }>((_, reject) => {
        fail = reject;
      });
      const errors: string[] = [];
      const stream = await renderToReadableStream(
        <div>
          <span>shell-now</span>
          <Stream of={held} fallback={<span>pending-b</span>}>
            {(value) => <span>{value.label}</span>}
          </Stream>
        </div>,
        { onError: (error) => void errors.push(error instanceof Error ? error.message : String(error)) },
      );
      stream.allReady.catch(() => {});
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      const first = decoder.decode((await reader.read()).value);
      expect(first).toContain("shell-now");
      expect(first).toContain("pending-b");

      fail(new Error("slice load failed"));
      let rest = "";
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
        rest += decoder.decode(chunk.value);

      expect(errors).toContain("slice load failed");
      expect(rest).toContain("$RX");
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(seen).toEqual([]);
    } finally {
      process.off("unhandledRejection", collect);
    }
  });

  test("a rejected thenable renders a notice in its place and leaves the rest of the page", async () => {
    const failing = Promise.reject(new Error("load failed"));
    const { container, flush, unmount } = await mountAsync(
      <div>
        <span>sibling</span>
        <Stream of={failing} fallback={<span>pending</span>}>
          {() => <span>never</span>}
        </Stream>
      </div>,
    );
    await flush();
    expect(container.querySelector("span")?.textContent).toBe("sibling");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("base.loadFailed");
    expect(container.textContent).not.toContain("never");
    await unmount();
  });

  test("renders `error` in place of a rejected thenable", async () => {
    const failing = Promise.reject(new Error("load failed"));
    const { container, flush, unmount } = await mountAsync(
      <Stream of={failing} fallback={<span>pending</span>} error={<span>custom failure</span>}>
        {() => <span>never</span>}
      </Stream>,
    );
    await flush();
    expect(container.textContent).toBe("custom failure");
    await unmount();
  });

  test("a new thenable after a failure renders its value", async () => {
    const view = (of: Promise<{ label: string }>) => (
      <Stream of={of} fallback={<span>pending</span>}>
        {(value) => <span>{value.label}</span>}
      </Stream>
    );
    const { container, rerender, flush, unmount } = await mountAsync(view(Promise.reject(new Error("load failed"))));
    await flush();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await rerender(view(Promise.resolve({ label: "reloaded" })));
    await flush();
    expect(container.textContent).toBe("reloaded");
    await unmount();
  });
});
