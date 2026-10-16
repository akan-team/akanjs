import { describe, expect, test } from "bun:test";

import { buildEndpoint } from "./endpointInfo";
import { type MiddlewareCls, middleware } from "./middleware";
import { MiddlewareChain } from "./middlewareChain";
import type { SignalContext } from "./signalContext";

const context = {} as SignalContext;
const env = {} as never;

const recording = (name: string, order: string[], uses: { count: number } = { count: 0 }) =>
  class extends middleware(name) {
    override async use() {
      uses.count += 1;
      return async (_context: SignalContext, next: () => Promise<unknown>) => {
        order.push(`${name}:before`);
        const result = await next();
        order.push(`${name}:after`);
        return result;
      };
    }
  } as unknown as MiddlewareCls;

describe("MiddlewareChain", () => {
  test("runs the global middlewares, then the endpoint's, around the call, and sets each up once", async () => {
    const order: string[] = [];
    const uses = { count: 0 };
    const global = new Map([
      ["first", recording("first", order, uses)],
      ["second", recording("second", order, uses)],
    ]);
    const endpointInfo = buildEndpoint.query(String, { middlewares: [recording("own", order, uses)] }).exec(() => "ok");

    for (let i = 0; i < 3; i += 1) {
      const result = await MiddlewareChain.of(global, env, endpointInfo).run(context, async () => {
        order.push("core");
        return "ok";
      });
      expect(result).toBe("ok");
    }

    expect(order.slice(0, 7)).toEqual([
      "first:before",
      "second:before",
      "own:before",
      "core",
      "own:after",
      "second:after",
      "first:after",
    ]);
    expect(uses.count).toBe(3);
    expect(MiddlewareChain.of(global, env, endpointInfo)).toBe(MiddlewareChain.of(global, env, endpointInfo));
  });

  test("leaves out a global middleware named in skip, and the endpoint's own with no endpoint", async () => {
    const order: string[] = [];
    const global = new Map([
      ["logging", recording("logging", order)],
      ["account", recording("account", order)],
    ]);

    await MiddlewareChain.of(global, env, null, ["logging"]).run(context, async () => order.push("core"));

    expect(order).toEqual(["account:before", "core", "account:after"]);
  });

  test("fails a call whose middleware setup rejected, and sets it up again on the next", async () => {
    let attempts = 0;
    class Flaky extends middleware("flaky") {
      override async use() {
        attempts += 1;
        if (attempts === 1) throw new Error("setup failed");
        return async (_context: SignalContext, next: () => Promise<unknown>) => await next();
      }
    }
    const global = new Map([["flaky", Flaky as unknown as MiddlewareCls]]);
    const endpointInfo = buildEndpoint.query(String).exec(() => "ok");
    const call = () => MiddlewareChain.of(global, env, endpointInfo).run(context, async () => "ok");

    await expect(call()).rejects.toThrow("setup failed");
    expect(await call()).toBe("ok");
    expect(attempts).toBe(2);
  });

  test("builds a new chain once the global map has grown, and keeps one per map for a shared endpoint", async () => {
    const order: string[] = [];
    const global = new Map([["first", recording("first", order)]]);
    const copy = new Map(global);
    const endpointInfo = buildEndpoint.query(String).exec(() => "ok");
    const before = MiddlewareChain.of(global, env, endpointInfo);
    const fromCopy = MiddlewareChain.of(copy, env, endpointInfo);

    expect(MiddlewareChain.of(global, env, endpointInfo)).toBe(before);
    expect(MiddlewareChain.of(copy, env, endpointInfo)).toBe(fromCopy);

    global.set("late", recording("late", order));
    await MiddlewareChain.of(global, env, endpointInfo).run(context, async () => order.push("core"));

    expect(MiddlewareChain.of(global, env, endpointInfo)).not.toBe(before);
    expect(order).toEqual(["first:before", "late:before", "core", "late:after", "first:after"]);
  });
});
