import "../../test/registerDom";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SerializedArg } from "akanjs/signal";
import { act, type ReactNode, Suspense, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server.browser";
import { setTestEnv, waitFor } from "../testHelpers.fixture";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "akan-signal-arg-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

let Arg: typeof import("./Arg").default;
let DictionaryAsset: typeof import("../../client/dictionaryAsset").DictionaryAsset;
let TranslatorState: typeof import("../../client/translatorState").TranslatorState;

beforeAll(async () => {
  setTestEnv("signalargtest");
  const { registerClientRuntime } = await import("akanjs/client");
  const { Translator } = await import("../../client/translator");
  ({ DictionaryAsset } = await import("../../client/dictionaryAsset"));
  ({ TranslatorState } = await import("../../client/translatorState"));
  ({ default: Arg } = await import("./Arg"));
  const translate = (key: string) => Translator.translateByLocale("en", key);
  registerClientRuntime({
    usePage: () => ({ path: "/", lang: "en", l: Object.assign(translate, { _: translate }) }),
    fetch: { sortKeyMap: new Map() },
  } as never);
});

const pageDictionary = { argdoc: { signal: { ping: { t: "Ping" } } } };
const apiDictionary = {
  argdoc: { signal: { ping: { arg: { to: { t: "Recipient", desc: { t: "Who the ping goes to" } } } } } },
};
const wholeDictionary = { argdoc: { signal: { ping: { t: "Ping", ...apiDictionary.argdoc.signal.ping } } } };
const args: SerializedArg[] = [{ type: "body", refName: "String", name: "to" }];

const writeModule = (name: string, lines: string[]) => {
  const file = path.join(root, name);
  fs.writeFileSync(file, lines.join("\n"));
  return file;
};

const renderOnServer = async (node: ReactNode) => {
  const saved = (["window", "document"] as const).map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  for (const [name] of saved) Reflect.deleteProperty(globalThis, name);
  try {
    return await new Response(await renderToReadableStream(node)).text();
  } finally {
    for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  }
};

describe("Signal.Arg.Table rendered on its own", () => {
  test("hydrates over the server's descriptions once the API file arrives, with no mismatch on the way", async () => {
    let committed = false;
    const Committed = () => {
      useEffect(() => {
        committed = true;
      }, []);
      return null;
    };
    const table = (
      <Suspense fallback={<p>loading</p>}>
        <Arg.Table refName="argdoc" endpointKey="ping" args={args} />
        <Committed />
      </Suspense>
    );
    TranslatorState.replace("en", structuredClone(wholeDictionary));
    const serverHtml = await renderOnServer(table);

    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    (globalThis as unknown as { __argDocGate: Promise<void> }).__argDocGate = gate;
    const apiFile = writeModule("en-api.js", [
      "await globalThis.__argDocGate;",
      'export const lang = "en";',
      `export default ${JSON.stringify(apiDictionary)};`,
    ]);
    const pageFile = writeModule("en.js", [
      'export const lang = "en";',
      `export const parts = ${JSON.stringify({ api: apiFile })};`,
      `export default ${JSON.stringify(pageDictionary)};`,
    ]);
    await DictionaryAsset.load(pageFile);

    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = serverHtml;
    const serverText = container.textContent;
    const errors: unknown[] = [];
    const consoleError = console.error;
    console.error = (...logged: unknown[]) => {
      if (/hydrat|did not match/i.test(String(logged[0]))) errors.push(logged[0]);
    };
    let hydrated: ReturnType<typeof hydrateRoot> | null = null;
    try {
      await act(async () => {
        hydrated = hydrateRoot(container, table, { onRecoverableError: (error) => errors.push(error) });
      });
      const waitingText = container.textContent;
      const committedBeforeFile = committed;
      release();
      await waitFor(() => committed);

      expect(serverText).toContain("Recipient");
      expect(serverText).toContain("Who the ping goes to");
      expect(committedBeforeFile).toBe(false);
      expect(waitingText).toBe(serverText);
      expect(committed).toBe(true);
      expect(errors).toEqual([]);
      expect(container.textContent).toBe(serverText);
    } finally {
      console.error = consoleError;
      act(() => hydrated?.unmount());
      container.remove();
    }
  });
});
