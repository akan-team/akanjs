import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { SerializedArg, SerializedSignal } from "akanjs/signal";
import { AppScope } from "./appScope";
import { FetchClient } from "./client/fetchClient";
import type { RestoredError } from "./client/remoteError";
import { RenderScope } from "./renderScope";
import { createRequestStore, requestStorage } from "./requestStorage";

const originalFetch = globalThis.fetch;
const sent: string[] = [];

const arg = (type: SerializedArg["type"], name: string): SerializedArg => ({ type, name, refName: "String" });

const renderSignal: SerializedSignal = {
  endpoint: {
    readThing: { type: "query", args: [arg("param", "id")], returns: { refName: "String" } },
    approveThing: { type: "mutation", args: [arg("param", "id")], returns: { refName: "String" } },
    pingThing: { type: "message", args: [arg("msg", "text")], returns: { refName: "String" } },
  },
};
const renderItemSignal: SerializedSignal = {
  getGuards: ["Public"],
  cruGuards: ["Admin"],
  slice: { "": { args: [] } },
  endpoint: {},
};

const makeClient = () =>
  new FetchClient("https://api.example", {}, { renderThing: renderSignal, renderItem: renderItemSignal });

const thrownBy = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error as RestoredError;
  }
  return null;
};

const refusalOf = (error: unknown) => {
  const refused = error as RestoredError | null;
  return { error: refused?.error, statusCode: refused?.statusCode, data: refused?.data };
};

beforeEach(() => {
  sent.length = 0;
  globalThis.fetch = (async (url: string | URL | Request) => {
    sent.push(String(url));
    return Response.json("done");
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  FetchClient.resetSharedRegistry();
});

describe("RenderScope", () => {
  test("is active through every await of the render it marks, and nowhere beside it", async () => {
    expect(RenderScope.active()).toBe(false);
    const inside = RenderScope.run(async () => {
      const before = RenderScope.active();
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [before, RenderScope.active()];
    });
    expect(RenderScope.active()).toBe(false);
    expect(await inside).toEqual([true, true]);
  });

  test("refuses a mutation as it is called, before anything is sent", async () => {
    const client = makeClient();
    const refused = await RenderScope.run(async () => {
      await client.handler.readThing("1");
      return thrownBy(() => client.handler.approveThing("1"));
    });
    expect(refusalOf(refused)).toEqual({
      error: "base.error.mutationInRender",
      statusCode: 400,
      data: { endpoint: "approveThing" },
    });
    expect(sent).toEqual(["https://api.example/readThing/1"]);
  });

  test("refuses a file upload the render starts", () => {
    const client = makeClient();
    const refused = RenderScope.run(() =>
      thrownBy(() => client.handler.addRenderItemFiles([new File(["x"], "x.txt")])),
    );
    expect(refusalOf(refused).data).toEqual({ endpoint: "addRenderItemFiles" });
    expect(sent).toEqual([]);
  });

  test("refuses a socket message the render sends, before any socket opens", () => {
    const client = makeClient();
    const refused = RenderScope.run(() => thrownBy(() => client.handler.pingThing("hello")));
    expect(refusalOf(refused).data).toEqual({ endpoint: "pingThing" });
  });

  test("runs a mutation the call opts in with duringRender", async () => {
    const client = makeClient();
    const approved = await RenderScope.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return await client.handler.approveThing("1", { duringRender: true });
    });
    expect(approved).toBe("done");
    expect(sent).toEqual(["https://api.example/approveThing/1"]);
  });

  test("leaves a mutation outside a render alone, while a render is in flight beside it", async () => {
    const client = makeClient();
    let release: () => void = () => undefined;
    const rendering = RenderScope.run(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return thrownBy(() => client.handler.approveThing("late"));
    });
    expect(await client.handler.approveThing("beside")).toBe("done");
    release();
    expect(refusalOf(await rendering).error).toBe("base.error.mutationInRender");
    expect(sent).toEqual(["https://api.example/approveThing/beside"]);
  });

  test("refuses inside a request scope it is nested in, as the render workers enter both", async () => {
    const client = makeClient();
    const request = createRequestStore(new Request("https://app.example/en/approve?id=1"));
    const run = () => RenderScope.run(async () => thrownBy(() => client.handler.approveThing("1")));
    const refused = await (requestStorage ? requestStorage.run(request, run) : run());
    expect(refusalOf(refused).error).toBe("base.error.mutationInRender");
  });

  test("keeps an app's load query-only even when the call opts in", () => {
    const client = makeClient();
    const refused = RenderScope.run(() =>
      AppScope.run("showThing", () => thrownBy(() => client.handler.approveThing("1", { duringRender: true }))),
    );
    expect(refusalOf(refused)).toEqual({
      error: "base.error.mutationInApp",
      statusCode: 400,
      data: { app: "showThing", endpoint: "approveThing" },
    });
    expect(sent).toEqual([]);
  });
});
