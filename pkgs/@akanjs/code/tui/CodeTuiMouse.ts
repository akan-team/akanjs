export interface CodeTuiWheel {
  rows: number; // 0 for a non-wheel report, which is swallowed rather than typed
  rest: string; // what followed the report in the same chunk: ordinary typing
}

// Mode 1000 is the narrowest that carries the wheel; 1006 asks for SGR decimal coordinates, and a terminal without
// it keeps the legacy form, so both are decoded. While tracking is on, a drag selects text only with shift held.
export class CodeTuiMouse {
  static readonly on = "[?1000h[?1006h";
  static readonly off = "[?1006l[?1000l";
  static readonly step = 3; // rows per notch, as in less and vim

  #pending = 0; // coordinate bytes of a legacy report still to come, as their own chunk

  // Ink strips the ESC and hands a CSI over whole (`[<64;12;7M`); a legacy `[M` report's three coordinate bytes
  // arrive as the next chunk. undefined means the input belongs to the keyboard.
  read(input: string): CodeTuiWheel | undefined {
    if (this.#pending) {
      const button = (input.codePointAt(0) ?? 32) - 32;
      const rest = input.slice(this.#pending);
      this.#pending = 0;
      return { rows: CodeTuiMouse.rowsOf(button), rest };
    }
    const sgr = /^\[<(\d+);\d+;\d+[Mm]$/.exec(input);
    if (sgr) return { rows: CodeTuiMouse.rowsOf(Number(sgr[1])), rest: "" };
    if (input !== "[M") return undefined;
    this.#pending = 3;
    return { rows: 0, rest: "" };
  }

  // Bit 64 is the wheel and the low two bits its direction; the horizontal wheel (66/67) is ignored.
  static rowsOf(button: number) {
    if (!(button & 64)) return 0;
    const direction = button & 3;
    if (direction === 0) return -CodeTuiMouse.step;
    if (direction === 1) return CodeTuiMouse.step;
    return 0;
  }
}
