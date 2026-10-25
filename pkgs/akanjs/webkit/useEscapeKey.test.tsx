import "../test/registerDom";
import { describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useEscapeKey } from "./useEscapeKey";

const escape = () => new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });

describe("useEscapeKey", () => {
  test("leaves an Escape a control already spent to that control, and takes the next one", () => {
    const onEscape = mock(() => undefined);
    const Surface = () => {
      useEscapeKey(true, onEscape);
      return null;
    };
    const host = document.createElement("div");
    const field = document.createElement("input");
    document.body.append(host, field);
    field.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
    const root = createRoot(host);
    act(() => root.render(<Surface />));
    try {
      act(() => {
        field.dispatchEvent(escape());
      });
      expect(onEscape).not.toHaveBeenCalled();

      act(() => {
        field.dispatchEvent(escape());
      });
      expect(onEscape).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.unmount());
      host.remove();
      field.remove();
    }
  });
});
