import "../../test/registerDom";
import { expect, test } from "bun:test";
import { InputModality } from "./inputModality";

test("reads focus as the keyboard's until the first press, as from a screen reader's cursor, and again after a key", () => {
  expect(InputModality.usesKeyboard()).toBe(true);
  InputModality.watch();
  InputModality.watch();

  document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
  expect(InputModality.usesKeyboard()).toBe(false);

  document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
  expect(InputModality.usesKeyboard()).toBe(true);
});
