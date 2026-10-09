import { describe, expect, test } from "bun:test";
import type { FetchProxy } from "akanjs/fetch";
import { signalRefNamesOf } from "./endpointEntries";

const fetchOf = (refNames: string[]) =>
  ({ serializedSignal: Object.fromEntries(refNames.map((refName) => [refName, {}])) }) as unknown as FetchProxy;

describe("signalRefNamesOf", () => {
  test("sorts every registered signal when nothing narrows it", () => {
    expect(signalRefNamesOf(fetchOf(["user", "Admin", "file"]))).toEqual(["Admin", "file", "user"]);
  });

  test("keeps the include order, drops unregistered names, and applies exclude last", () => {
    const fetch = fetchOf(["user", "admin", "file", "banner"]);
    expect(signalRefNamesOf(fetch, { include: ["file", "ghost", "user", "banner"], exclude: ["banner"] })).toEqual([
      "file",
      "user",
    ]);
    expect(signalRefNamesOf(fetch, { exclude: ["banner", "admin"] })).toEqual(["file", "user"]);
    expect(signalRefNamesOf(fetch, { include: [] })).toEqual([]);
  });
});
