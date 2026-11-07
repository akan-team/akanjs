import "../test/registerDom";
import { expect, test } from "bun:test";
import { STATE_META } from "akanjs/base";
import { setTestEnv } from "./store.fixture";

test("starts the query from the address bar, so an SSR page hydrates on the params its server render read", async () => {
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
    "http://localhost/en/admin?topMenu=account&tag=a&tag=b",
  );
  setTestEnv("basesttest");
  const { BaseStore } = await import("./baseSt");

  expect((BaseStore as unknown as { [STATE_META]: { searchParams: unknown } })[STATE_META].searchParams).toEqual({
    topMenu: "account",
    tag: ["a", "b"],
  });
});
