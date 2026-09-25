import { describe, expect, test } from "bun:test";
import { Spinner } from "./spinner";

interface TtyStub {
  restore: () => void;
  rawModeCalls: boolean[];
}

/**
 * ora only reaches for stdin when both streams look interactive, so the stub has to fake a tty on
 * stderr (which decides `isEnabled`) as well as on stdin.
 */
const stubTty = (): TtyStub => {
  const rawModeCalls: boolean[] = [];
  const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => unknown };
  const previous = {
    stdinIsTTY: stdin.isTTY,
    stderrIsTTY: process.stderr.isTTY,
    stderrColumns: process.stderr.columns,
    setRawMode: stdin.setRawMode,
    isPaused: stdin.isPaused,
  };
  stdin.isTTY = true;
  process.stderr.isTTY = true;
  process.stderr.columns = 120;
  stdin.setRawMode = (mode: boolean) => {
    rawModeCalls.push(mode);
    return stdin;
  };
  stdin.isPaused = () => true;
  return {
    rawModeCalls,
    restore: () => {
      stdin.isTTY = previous.stdinIsTTY;
      process.stderr.isTTY = previous.stderrIsTTY;
      process.stderr.columns = previous.stderrColumns;
      stdin.setRawMode = previous.setRawMode;
      stdin.isPaused = previous.isPaused;
    },
  };
};

describe("Spinner", () => {
  // A raw terminal at spawn time is what a Bun child snapshots and writes back when it exits, which is
  // how `akan start` used to leave a terminal that no longer turns Ctrl+C into SIGINT.
  test("never puts the terminal into raw mode while it spins", () => {
    const tty = stubTty();
    try {
      const spinner = new Spinner("Preparing backend...").start();
      expect(tty.rawModeCalls).toEqual([]);
      spinner.succeed("prepared");
      expect(tty.rawModeCalls).toEqual([]);
    } finally {
      tty.restore();
    }
  });

  test("keeps ora's stdin discarder disabled", () => {
    expect(Spinner.oraOptions.discardStdin).toBe(false);
  });

  // An unsized pty reports `isTTY: true` with `columns: 0`, which turns ora's clear loop into an
  // infinite one — the process then writes cursor moves until it is SIGKILLed.
  test("refuses to animate against a tty that reports no width", () => {
    expect(Spinner.canAnimate({ isTTY: true, columns: 0 } as NodeJS.WriteStream)).toBe(false);
    expect(Spinner.canAnimate({ isTTY: true, columns: 120 } as NodeJS.WriteStream)).toBe(true);
    expect(Spinner.canAnimate({ isTTY: false, columns: 0 } as NodeJS.WriteStream)).toBe(true);
  });

  test("falls back to plain lines when the terminal has no width", () => {
    const previous = { isTTY: process.stderr.isTTY, columns: process.stderr.columns };
    process.stderr.isTTY = true;
    process.stderr.columns = 0;
    try {
      expect(new Spinner("Preparing backend...").enableSpin).toBe(false);
    } finally {
      process.stderr.isTTY = previous.isTTY;
      process.stderr.columns = previous.columns;
    }
  });
});
