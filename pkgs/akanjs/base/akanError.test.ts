import { describe, expect, test } from "bun:test";
import { AkanError } from "./akanError";

class QueueError extends AkanError<"queueFull" | "queueClosed", { size: number }> {}

describe("AkanError", () => {
  test("carries a code, a status, data and a cause, and answers 500 unless given a status", () => {
    const cause = new Error("socket closed");
    const error = new AkanError("uploadFailed", "upload to s3://bucket/key failed", { cause, data: { attempt: 3 } });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("uploadFailed");
    expect(error.statusCode).toBe(500);
    expect(error.cause).toBe(cause);
    expect(error.toJSON()).toEqual({
      error: "upload to s3://bucket/key failed",
      code: "uploadFailed",
      statusCode: 500,
      data: { attempt: 3 },
    });
    expect(JSON.parse(JSON.stringify(error))).toEqual(error.toJSON());
  });

  test("sets no cause and writes no data when given none", () => {
    const error = new AkanError("busy", "busy", { statusCode: 503 });

    expect("cause" in error).toBe(false);
    expect(error.toJSON()).toEqual({ error: "busy", code: "busy", statusCode: 503 });
  });

  test("keeps the name a subclass gives itself, and the plain Error name otherwise", () => {
    class LedgerError extends AkanError<"locked"> {
      constructor() {
        super("locked", "ledger is locked");
        this.name = "LedgerError";
      }
    }

    expect(String(new LedgerError())).toBe("LedgerError: ledger is locked");
    expect(String(new AkanError("locked", "ledger is locked"))).toBe("Error: ledger is locked");
  });

  test("is() matches its own class and, when codes are named, one of them", () => {
    const error: unknown = new QueueError("queueFull", "queue holds 100 jobs", {
      statusCode: 503,
      data: { size: 100 },
    });

    expect(AkanError.is(error)).toBe(true);
    expect(QueueError.is(error)).toBe(true);
    expect(QueueError.is(error, "queueFull", "queueClosed")).toBe(true);
    expect(QueueError.is(error, "queueClosed")).toBe(false);
    expect(QueueError.is(new AkanError("queueFull", "queue holds 100 jobs"))).toBe(false);
    expect(AkanError.is(new Error("queueFull"))).toBe(false);
    expect(QueueError.is(error, "queueFull") ? error.data?.size : null).toBe(100);
  });

  test("is() on AkanError knows an error from another copy of the module, which instanceof does not", async () => {
    const copyPath = "./akanError.ts?copy";
    const copy = (await import(copyPath)) as { AkanError: typeof AkanError };
    const foreign = new copy.AkanError("queueFull", "queue holds 100 jobs", { statusCode: 503 });

    expect(copy.AkanError).not.toBe(AkanError);
    expect(foreign instanceof AkanError).toBe(false);
    expect(AkanError.is(foreign, "queueFull")).toBe(true);
    expect(AkanError.is(foreign, "queueClosed")).toBe(false);
    expect(QueueError.is(foreign)).toBe(false);
    expect(AkanError.is({ code: "queueFull", statusCode: 503 })).toBe(false);
  });

  test("is not forwarded to a caller as it is", () => {
    expect(new AkanError("queueFull", "queue holds 100 jobs").forwarded).toBe(false);
  });

  test("names a status by its code and reason, and one it does not list by its number", () => {
    expect(AkanError.codeOfStatus(429)).toBe("tooManyRequests");
    expect(AkanError.reasonOf(429)).toBe("Too Many Requests");
    expect(AkanError.codeOfStatus(418)).toBe("http418");
    expect(AkanError.reasonOf(418)).toBe("Request Failed");
    expect(AkanError.reasonOf(599)).toBe("Internal Server Error");
  });
});
