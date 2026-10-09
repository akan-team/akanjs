import { beforeAll, describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { l, setTestEnv } from "../testHelpers.fixture";

let Signal: typeof import("../index").Signal;
let render: (element: ReactElement) => Promise<string>;

const endpointOf = (guards: string[]) => ({ type: "query", args: [], returns: { refName: "String" }, guards });

beforeAll(async () => {
  setTestEnv("signaldoctest");
  const { registerClientRuntime } = await import("akanjs/client");
  const { renderToReadableStream } = await import("react-dom/server");
  ({ Signal } = await import("../index"));
  render = async (element) => await new Response(await renderToReadableStream(element)).text();
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l }),
    fetch: {
      origin: "http://localhost:8080",
      serializedSignal: {
        ping: { prefix: "ping", endpoint: { ping: endpointOf(["Public"]) }, origin: ["shared"] },
        pong: { prefix: "pong", endpoint: { pong: endpointOf(["Admin"]) }, origin: ["shared", "sceny"] },
      },
    },
  } as never);
});

describe("Signal.Doc without a fetch prop", () => {
  test("renders a signal zone from the registered runtime", async () => {
    const html = await render(<Signal.Doc.Zone refName="ping" />);
    expect(html).toContain("http://localhost:8080");
    expect(html).toContain("/ping/ping");
  });

  test("lists the scoped signals and mounts only the default one", async () => {
    const html = await render(<Signal.Doc.Explorer exclude={["ghost"]} defaultRefName="pong" />);
    expect(html).toContain(">ping</button>");
    expect(html).toContain(">pong</button>");
    expect(html).toContain("/pong/pong");
    expect(html).not.toContain("/ping/ping");
  });

  test("groups the sidebar by owning library, the app first", async () => {
    const html = await render(<Signal.Doc.Explorer groupBy="lib" />);
    expect(html.indexOf(">sceny</div>")).toBeGreaterThan(-1);
    expect(html.indexOf(">sceny</div>")).toBeLessThan(html.indexOf(">shared</div>"));
    expect(html).toContain("/pong/pong");
  });

  test("keeps only the named libraries and labels what a signal extends", async () => {
    const html = await render(<Signal.Doc.Explorer libs={["sceny"]} />);
    expect(html).not.toContain(">ping</button>");
    expect(html).toContain("sceny (extends shared)");
  });
});
