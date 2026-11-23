import { describe, expect, test } from "bun:test";
import { PendingMetadata } from "./pendingMetadata";

describe("PendingMetadata", () => {
  test("keeps a save until a green pages build at or past it, and a save after that build for the next one", () => {
    const pending = new PendingMetadata();
    pending.note(["/app/lib/b/b.dictionary.ts", "/app/lib/a/a.signal.ts"], 4);
    pending.note([], 5);
    pending.note(["/app/lib/c/c.signal.ts"], 6);

    pending.settle(3);
    expect(pending.files).toEqual(["/app/lib/a/a.signal.ts", "/app/lib/b/b.dictionary.ts", "/app/lib/c/c.signal.ts"]);

    pending.settle(5);
    expect(pending.files).toEqual(["/app/lib/c/c.signal.ts"]);
  });

  test("a file saved again after the build that took it in waits for the next one", () => {
    const pending = new PendingMetadata();
    pending.note(["/app/lib/a/a.signal.ts"], 4);
    pending.note(["/app/lib/a/a.signal.ts"], 7);

    pending.settle(4);

    expect(pending.files).toEqual(["/app/lib/a/a.signal.ts"]);
  });
});
