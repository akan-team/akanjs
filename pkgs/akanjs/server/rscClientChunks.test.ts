import "../test/registerDom";
import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import { reportingRootErrors } from "./rscClientChunks";

const ownReportError = Object.getOwnPropertyDescriptor(globalThis, "reportError");
let consoleError: Mock<(...data: unknown[]) => void>;
let reported: unknown[] = [];
const listeners: ((event: ErrorEvent) => void)[] = [];
const listen = (listener: (event: ErrorEvent) => void) => {
  listeners.push(listener);
  window.addEventListener("error", listener);
};

beforeEach(() => {
  consoleError = spyOn(console, "error").mockImplementation(() => undefined);
  reported = [];
});

afterEach(() => {
  consoleError.mockRestore();
  for (const listener of listeners.splice(0)) window.removeEventListener("error", listener);
  if (ownReportError) Object.defineProperty(globalThis, "reportError", ownReportError);
  else Reflect.deleteProperty(globalThis, "reportError");
});

describe("reportingRootErrors", () => {
  test("an uncaught error goes to reportError where the browser has one", () => {
    const reportError = (error: unknown) => {
      reported.push(error);
    };
    Object.defineProperty(globalThis, "reportError", { configurable: true, writable: true, value: reportError });
    const seen: unknown[] = [];
    listen((event) => seen.push(event.error));
    const failure = new SyntaxError("does not provide an export named 'x'");
    const onError: unknown[] = [];

    reportingRootErrors((error) => onError.push(error)).onUncaughtError(failure);

    expect({ reported, seen, logged: consoleError.mock.calls, onError }).toEqual({
      reported: [failure],
      seen: [],
      logged: [],
      onError: [failure],
    });
  });

  test("without reportError, it dispatches a window error event, then logs what no listener cancelled", () => {
    Reflect.deleteProperty(globalThis, "reportError");
    const seen: { message: string; error: unknown; cancelable: boolean }[] = [];
    listen(({ message, error, cancelable }) => seen.push({ message, error, cancelable }));
    const failure = new SyntaxError("does not provide an export named 'x'");
    const onError: unknown[] = [];

    reportingRootErrors((error) => onError.push(error)).onUncaughtError(failure);

    expect({ seen, logged: consoleError.mock.calls, onError }).toEqual({
      seen: [{ message: failure.message, error: failure, cancelable: true }],
      logged: [[failure]],
      onError: [failure],
    });
  });

  test("without reportError, a listener that cancels the event keeps it out of the console", () => {
    Reflect.deleteProperty(globalThis, "reportError");
    listen((event) => event.preventDefault());
    const onError: unknown[] = [];

    reportingRootErrors((error) => onError.push(error)).onUncaughtError("thrown string");

    expect({ logged: consoleError.mock.calls, onError }).toEqual({ logged: [], onError: ["thrown string"] });
  });
});
