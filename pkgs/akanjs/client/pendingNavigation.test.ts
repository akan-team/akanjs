import { afterEach, describe, expect, test } from "bun:test";
import { PendingNavigation } from "./pendingNavigation";

describe("PendingNavigation", () => {
  afterEach(() => PendingNavigation.clear());

  test("holds the href of the navigation that began last, and tells its readers of each change", () => {
    const seen: (string | null)[] = [];
    const unsubscribe = PendingNavigation.subscribe(() => seen.push(PendingNavigation.get()));

    const first = PendingNavigation.begin("http://localhost/a");
    const second = PendingNavigation.begin("http://localhost/b");
    PendingNavigation.end(first);
    PendingNavigation.end(second);
    unsubscribe();
    PendingNavigation.begin("http://localhost/c");

    expect(seen).toEqual(["http://localhost/a", "http://localhost/b", null]);
  });

  test("clear ends whichever navigation is pending and says nothing when none is", () => {
    PendingNavigation.begin("http://localhost/a");
    const seen: (string | null)[] = [];
    const unsubscribe = PendingNavigation.subscribe(() => seen.push(PendingNavigation.get()));

    PendingNavigation.clear();
    PendingNavigation.clear();
    unsubscribe();

    expect(seen).toEqual([null]);
  });
});
