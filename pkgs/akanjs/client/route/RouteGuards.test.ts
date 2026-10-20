import { describe, expect, test } from "bun:test";
import type { RouteGuardProps, RouteRender } from "../csrTypes";
import { AkanNotFoundError, AkanRedirectError } from "../router";
import { RouteGuards } from "./RouteGuards";
import { RouteArgPending } from "./routeArgs";

const props: RouteGuardProps = { params: { lang: "en" }, searchParams: {} };
const guarded = (trail: string[], name: string, refusal?: unknown): RouteRender => ({
  render: () => null,
  guard: async ({ listing }) => {
    trail.push(listing ? `${name}?` : name);
    if (refusal) throw refusal;
  },
});

describe("RouteGuards.run", () => {
  test("runs the root layout's guard first and the page's last, and stops at the first refusal", async () => {
    const trail: string[] = [];
    await RouteGuards.run([guarded(trail, "root"), undefined, guarded(trail, "layout"), guarded(trail, "page")], props);
    expect(trail).toEqual(["root", "layout", "page"]);

    trail.length = 0;
    const redirect = new AkanRedirectError("/signin");
    const run = RouteGuards.run(
      [guarded(trail, "root"), guarded(trail, "layout", redirect), guarded(trail, "page")],
      props,
    );
    await expect(run).rejects.toBe(redirect);
    expect(trail).toEqual(["root", "layout"]);
  });

  test("reads a leaked 403 or 404 as not-found and leaves any other error as it is", async () => {
    for (const statusCode of [403, 404]) {
      const leaked = Object.assign(new Error("Access denied"), { statusCode });
      await expect(RouteGuards.run([guarded([], "page", leaked)], props)).rejects.toBeInstanceOf(AkanNotFoundError);
    }
    const unauthorized = Object.assign(new Error("Sign in"), { statusCode: 401 });
    await expect(RouteGuards.run([guarded([], "page", unauthorized)], props)).rejects.toBe(unauthorized);
    const broken = new Error("broken");
    await expect(RouteGuards.run([guarded([], "page", broken)], props)).rejects.toBe(broken);
  });
});

describe("RouteGuards.admits", () => {
  test("lists a screen whose guards pass or wait for an argument, every guard asked as a listing", async () => {
    const trail: string[] = [];
    const pending = new RouteArgPending("projectId");
    expect(
      await RouteGuards.admits(
        [guarded(trail, "root"), guarded(trail, "layout", pending), guarded(trail, "page")],
        props,
      ),
    ).toBe(true);
    expect(trail).toEqual(["root?", "layout?", "page?"]);
  });

  test("hides a screen any guard refuses, even after one that waits for an argument", async () => {
    const pending = new RouteArgPending("projectId");
    for (const refusal of [new AkanRedirectError("/signin"), new AkanNotFoundError(), new Error("broken")])
      expect(await RouteGuards.admits([guarded([], "layout", pending), guarded([], "page", refusal)], props)).toBe(
        false,
      );
  });
});

describe("RouteGuards.compose", () => {
  test("is no guard for none, the guard itself for one, and each in order for more", async () => {
    expect(RouteGuards.compose(undefined, undefined)).toBeUndefined();
    const only = async () => undefined;
    expect(RouteGuards.compose(undefined, only)).toBe(only);
    const trail: string[] = [];
    const composed = RouteGuards.compose(
      async () => void trail.push("inherited"),
      async () => void trail.push("own"),
    );
    await composed?.(props);
    expect(trail).toEqual(["inherited", "own"]);
  });
});
