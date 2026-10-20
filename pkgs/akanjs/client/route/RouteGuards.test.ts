import { describe, expect, test } from "bun:test";
import type { RouteGuardProps, RouteRender } from "../csrTypes";
import { AkanNotFoundError, AkanRedirectError } from "../router";
import { RouteDefinition, routeArgsMarker } from "./RouteDefinition";
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

  test("names the index of the guard that refused, a thrown string wrapped so it can still be named", async () => {
    const redirect = new AkanRedirectError("/signin");
    const byRedirect = await RouteGuards.run([undefined, guarded([], "layout", redirect)], props).catch((e) => e);
    expect(RouteGuards.refusedAt(byRedirect)).toBe(1);
    const byString = await RouteGuards.run([guarded([], "root"), guarded([], "page", "nope")], props).catch((e) => e);
    expect(byString).toBeInstanceOf(Error);
    expect((byString as Error).message).toBe("nope");
    expect(RouteGuards.refusedAt(byString)).toBe(1);
    expect(RouteGuards.refusedAt("nope")).toBeUndefined();
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

  test("reads what the guards it runs read, and everything once one of them names nothing", () => {
    const reading = (...names: string[]) =>
      Object.defineProperty(async () => undefined, routeArgsMarker, {
        value: names.map((name) => ({ kind: "search", name })),
      });
    const at = (tab: string, page: string) => ({ params: { lang: "en" }, searchParams: { tab, page } });
    const keyOf = (guard: unknown, tab: string, page: string) =>
      RouteDefinition.renderArgsKey(guard, at(tab, page), { isPage: true });
    const marked = RouteGuards.compose(reading("tab"), reading());
    expect(keyOf(marked, "a", "1")).toBe(keyOf(marked, "a", "2"));
    expect(keyOf(marked, "a", "1")).not.toBe(keyOf(marked, "b", "1"));
    const unmarked = RouteGuards.compose(reading("tab"), async () => undefined);
    expect(keyOf(unmarked, "a", "1")).not.toBe(keyOf(unmarked, "a", "2"));
  });
});
