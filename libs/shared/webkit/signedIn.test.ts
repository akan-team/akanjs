import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const account = { self: undefined as { id: string } | undefined };
const moves: string[] = [];
const notFounds: number[] = [];

beforeAll(async () => {
  const base = { ...(await import("akanjs/base")) };
  const client = await import("akanjs/client");
  mock.module("akanjs/base", () => ({ ...base, getEnv: () => ({ side: "client", appName: "shop" }) }));
  mock.module("akanjs/client", () => ({
    ...client,
    getAccount: () => account,
    router: {
      replace: (href: string) => {
        moves.push(href);
      },
      notFound: () => {
        notFounds.push(1);
      },
    },
  }));
});

afterEach(() => {
  account.self = undefined;
  moves.length = 0;
  notFounds.length = 0;
});

describe("signedIn", () => {
  test("a signed-out visitor goes to the sign-in page with the guard's path to come back to", async () => {
    const { signedIn } = await import("./signedIn");
    signedIn({ path: "/org/a/resource/b/checkin?seat=3" });
    expect(moves).toEqual([`/signin?redirect=${encodeURIComponent("/org/a/resource/b/checkin?seat=3")}`]);
    const redirect = new URLSearchParams(moves[0]?.split("?")[1]).get("redirect");
    expect(redirect).toBe("/org/a/resource/b/checkin?seat=3");
  });

  test("its own sign-in page keeps the query it already carries", async () => {
    const { signedIn } = await import("./signedIn");
    signedIn({ path: "/inbox", unauthorize: "/auth?via=sso" });
    expect(moves).toEqual(["/auth?via=sso&redirect=%2Finbox"]);
  });

  test("the string form and no argument redirect as before", async () => {
    const { signedIn } = await import("./signedIn");
    signedIn();
    signedIn("/login");
    expect(moves).toEqual(["/signin", "/login"]);
  });

  test("a not-found refusal takes no redirect query", async () => {
    const { signedIn } = await import("./signedIn");
    signedIn({ path: "/inbox", unauthorize: "notFound" });
    expect(notFounds).toHaveLength(1);
    expect(moves).toEqual([]);
  });

  test("a signed-in visitor stays", async () => {
    const { signedIn } = await import("./signedIn");
    account.self = { id: "u1" };
    signedIn({ path: "/inbox" });
    expect(moves).toEqual([]);
  });
});
