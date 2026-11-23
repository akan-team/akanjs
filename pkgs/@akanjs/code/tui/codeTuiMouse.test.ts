import { describe, expect, test } from "bun:test";
import { CodeTuiMouse } from "./CodeTuiMouse";

/** What Ink hands the input handler for a mouse report: the CSI sequence with its leading escape stripped. */
const sgr = (button: number, release = false) => `[<${button};12;7${release ? "m" : "M"}`;

describe("mouse wheel", () => {
  test("the terminal is asked for the wheel and told to stop again", () => {
    expect(CodeTuiMouse.on).toBe("[?1000h[?1006h");
    expect(CodeTuiMouse.off).toBe("[?1006l[?1000l");
  });

  test("a notch scrolls up or down by the same step", () => {
    const mouse = new CodeTuiMouse();
    expect(mouse.read(sgr(64))).toEqual({ rows: -CodeTuiMouse.step, rest: "" });
    expect(mouse.read(sgr(65))).toEqual({ rows: CodeTuiMouse.step, rest: "" });
  });

  test("a modifier held over the wheel still scrolls", () => {
    const mouse = new CodeTuiMouse();
    // shift adds 4, alt 8, ctrl 16 — none of which changes which way the wheel turned.
    expect(mouse.read(sgr(64 + 16))?.rows).toBe(-CodeTuiMouse.step);
    expect(mouse.read(sgr(65 + 4))?.rows).toBe(CodeTuiMouse.step);
  });

  test("a click is swallowed rather than typed into the prompt", () => {
    const mouse = new CodeTuiMouse();
    for (const button of [0, 1, 2]) {
      expect(mouse.read(sgr(button))).toEqual({ rows: 0, rest: "" });
      expect(mouse.read(sgr(button, true))).toEqual({ rows: 0, rest: "" });
    }
  });

  test("the horizontal wheel reports nothing to scroll", () => {
    const mouse = new CodeTuiMouse();
    expect(mouse.read(sgr(66))?.rows).toBe(0);
    expect(mouse.read(sgr(67))?.rows).toBe(0);
  });

  test("a keystroke is not the mouse", () => {
    const mouse = new CodeTuiMouse();
    for (const input of ["a", "", "[200~", "[A", "[<64;12;7", "/mcp"]) expect(mouse.read(input)).toBeUndefined();
  });

  /** A terminal that ignores `?1006h` keeps sending `ESC[M` plus three bytes, which Ink splits into two chunks. */
  test("the legacy encoding is read across the two chunks it arrives in", () => {
    const mouse = new CodeTuiMouse();
    expect(mouse.read("[M")).toEqual({ rows: 0, rest: "" });
    // Cb is the button biased by 32, so wheel-up is 96 and the two coordinates follow it.
    expect(mouse.read(`${String.fromCharCode(96)}!"`)).toEqual({ rows: -CodeTuiMouse.step, rest: "" });
    expect(mouse.read("[M")).toEqual({ rows: 0, rest: "" });
    expect(mouse.read(`${String.fromCharCode(97)}!"`)).toEqual({ rows: CodeTuiMouse.step, rest: "" });
  });

  test("typing that lands in the same chunk as a legacy report is handed back, not eaten", () => {
    const mouse = new CodeTuiMouse();
    mouse.read("[M");
    expect(mouse.read(`${String.fromCharCode(96)}!"hi`)).toEqual({ rows: -CodeTuiMouse.step, rest: "hi" });
    expect(mouse.read("hi")).toBeUndefined();
  });
});
