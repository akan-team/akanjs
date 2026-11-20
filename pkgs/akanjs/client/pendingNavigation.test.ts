import { afterEach, describe, expect, test } from "bun:test";
import { PendingNavigation } from "./pendingNavigation";

describe("PendingNavigation", () => {
  afterEach(() => PendingNavigation.clear());

  test("holds the href of the navigation that began last, and tells its readers of each change", () => {
    const seen: (string | null)[] = [];
    const unsubscribe = PendingNavigation.subscribe(() => seen.push(PendingNavigation.get()));

    const first = PendingNavigation.begin("http://localhost/a");
    PendingNavigation.wait(first);
    const second = PendingNavigation.begin("http://localhost/b");
    PendingNavigation.wait(second);
    PendingNavigation.end(first);
    PendingNavigation.end(second);
    unsubscribe();
    PendingNavigation.wait(PendingNavigation.begin("http://localhost/c"));

    expect(seen).toEqual([null, "http://localhost/a", null, "http://localhost/b", null]);
  });

  test("a navigation that waits on nothing names its target and is never pending", () => {
    const seen: [string | null, string | null][] = [];
    const unsubscribe = PendingNavigation.subscribe(() =>
      seen.push([PendingNavigation.get(), PendingNavigation.target()]),
    );

    const replay = PendingNavigation.begin("http://localhost/a");
    PendingNavigation.end(replay);
    PendingNavigation.wait(replay);
    unsubscribe();

    expect(seen).toEqual([
      [null, "http://localhost/a"],
      [null, null],
    ]);
  });

  test("clear ends whichever navigation is pending and says nothing when none is", () => {
    PendingNavigation.wait(PendingNavigation.begin("http://localhost/a"));
    const seen: (string | null)[] = [];
    const unsubscribe = PendingNavigation.subscribe(() => seen.push(PendingNavigation.get()));

    PendingNavigation.clear();
    PendingNavigation.clear();
    unsubscribe();

    expect(seen).toEqual([null]);
  });
});
