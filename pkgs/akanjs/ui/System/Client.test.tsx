import { beforeAll, describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { setTestEnv } from "../testHelpers.fixture";

let ClientWrapper: typeof import("./Client").ClientWrapper;
let Translator: typeof import("akanjs/client").Translator;

beforeAll(async () => {
  setTestEnv("clienttest");
  ({ Translator } = await import("akanjs/client"));
  ({ ClientWrapper } = await import("./Client"));
});

describe("ClientWrapper", () => {
  test("leaves the shared translator state alone when it renders on the server", () => {
    const before = { locale: Translator.getActiveLocale(), path: Translator.getActivePath() };

    renderToString(
      <ClientWrapper lang="ko" path="/docs" serverLocale reconnect={false}>
        <p>page</p>
      </ClientWrapper>,
    );

    expect({ locale: Translator.getActiveLocale(), path: Translator.getActivePath() }).toEqual(before);
  });
});
