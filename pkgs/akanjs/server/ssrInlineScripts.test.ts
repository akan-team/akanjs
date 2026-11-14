import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { readBytes, streamOfChunks } from "./flightRows.fixture";
import { flightSanitizeCorpus } from "./flightSanitize.fixture";
import { ScriptPolicy } from "./scriptPolicy";
import { sanitizeFlightForClientStream } from "./ssrFromRscRenderer";
import {
  createInlineRscScript,
  createSoftRedirectScript,
  type SsrBootstrapData,
  SsrInlineScripts,
} from "./ssrInlineScripts";

const token = "tok3n_-A";
const chunkSizes = [3, 17, 256, Number.POSITIVE_INFINITY];

const cut = (bytes: Uint8Array, size: number): Uint8Array[] => {
  if (!Number.isFinite(size)) return [bytes];
  const chunks: Uint8Array[] = [];
  for (let at = 0; at < bytes.byteLength; at += size) chunks.push(bytes.slice(at, at + size));
  return chunks;
};

const clientChunksOf = async (input: Uint8Array, size: number): Promise<Uint8Array[]> => {
  const reader = sanitizeFlightForClientStream(streamOfChunks(cut(input, size))).getReader();
  const chunks: Uint8Array[] = [];
  for (let next = await reader.read(); !next.done; next = await reader.read()) chunks.push(next.value);
  return chunks;
};

const bytesOf = ([type, data]: [1 | 3, string]): Uint8Array =>
  type === 1 ? new TextEncoder().encode(data) : Uint8Array.from(atob(data), (char) => char.charCodeAt(0));

describe("a Flight chunk as a data block", () => {
  test("holds no character that could end the block or open markup, and reads back as the chunk's bytes", async () => {
    let blocks = 0;
    for (const [name, input] of Object.entries(flightSanitizeCorpus)) {
      for (const size of chunkSizes) {
        const chunks = await clientChunksOf(input, size);
        const page = chunks.map((chunk) => createInlineRscScript(chunk, token)).join("");
        const read = ScriptPolicy.inlineScriptsOf(page);
        const at = `${name} cut every ${size}`;

        expect(read.length, at).toBe(chunks.length);
        expect(ScriptPolicy.executableScriptsOf(page), at).toEqual([]);
        for (const [index, { attrs, text }] of read.entries()) {
          expect(attrs, at).toBe(` type="application/json" data-akan="${token}"`);
          expect(/[<>&\u2028\u2029]/.test(text), at).toBe(false);
          expect(bytesOf(JSON.parse(text)), at).toEqual(chunks[index] as Uint8Array);
          blocks += 1;
        }
        expect(await readBytes(streamOfChunks(read.map(({ text }) => bytesOf(JSON.parse(text))))), at).toEqual(
          await readBytes(sanitizeFlightForClientStream(streamOfChunks([input]))),
        );
      }
    }
    expect(blocks).toBeGreaterThan(100);
  }, 60_000);

  test("writes a late redirect's target as data, behind a refresh for a reader that runs no script", () => {
    const location = `/login?next=/a&label="x"</script><!--<script>`;
    const tags = createSoftRedirectScript({ type: "redirect", location, method: "push", status: 307 }, token);
    const [block] = ScriptPolicy.inlineScriptsOf(tags);

    expect(tags).toStartWith(
      '<noscript><meta http-equiv="refresh" content="0;url=/login?next=/a&amp;label=&quot;x&quot;',
    );
    expect(ScriptPolicy.inlineScriptsOf(tags)).toHaveLength(1);
    expect(/[<>&]/.test(block?.text ?? "<")).toBe(false);
    expect(JSON.parse(block?.text ?? "null")).toEqual(["redirect", "assign", location]);
  });
});

interface Booted {
  self: Record<string, unknown>;
  document: Window["document"];
  moved: string[];
  flush: (blocks: string) => void;
}

//? A window of its own, never the global registration: that swaps in a TransformStream the Flight streams above
//? cannot pipe through.
const boot = (data: Partial<SsrBootstrapData> & { themeInit?: 1 }, cookie = "", between = ""): Booted => {
  const { document } = new Window({
    url: "http://localhost/en",
    settings: { disableJavaScriptFileLoading: true, handleDisabledFileLoadingAsSuccess: true },
  });
  document.head.innerHTML = `<script type="application/json">${JSON.stringify({ token, modules: [], ...data })}</script>${between}<script type="text/plain" id="boot"></script>`;
  document.body.innerHTML = "<main>page</main>";
  const moved: string[] = [];
  let current: unknown = document.getElementById("boot");
  const self: Record<string, unknown> = {};
  const page = {
    get currentScript() {
      return current;
    },
    cookie,
    documentElement: document.documentElement,
    head: document.head,
    createElement: (tag: string) => document.createElement(tag),
    querySelectorAll: (selector: string) => document.querySelectorAll(selector),
  };
  const view = {
    matchMedia: () => ({ matches: true }),
    location: {
      assign: (to: string) => moved.push(`assign ${to}`),
      replace: (to: string) => moved.push(`replace ${to}`),
    },
  };
  new Function("self", "document", "window", SsrInlineScripts.bootstrap)(self, page, view);
  return {
    self,
    document,
    moved,
    flush: (blocks) => {
      const holder = document.createElement("div");
      holder.innerHTML = `${blocks.replaceAll("<script>self.__AKAN_FLUSH__()</script>", "")}<script type="text/plain" data-flush></script>`;
      while (holder.firstChild) document.body.appendChild(holder.firstChild);
      current = document.body.lastElementChild;
      (self.__AKAN_FLUSH__ as () => void)();
    },
  };
};

const flight = (text: string, of = token) => createInlineRscScript(new TextEncoder().encode(text), of);

describe("the document's bootstrap script", () => {
  test("hands the page the values of the data block before it, and only those it names", () => {
    const { self } = boot({
      routeState: "state",
      dictionaryUrl: "/_akan/dict/en.js",
      importMapKey: "k1",
      prefix: { api: "/v1", ws: "/live" },
    });

    expect({
      state: self.__AKAN_RSC_INITIAL_STATE__,
      dict: self.__AKAN_DICT_URL__,
      key: self.__AKAN_IMPORT_MAP_KEY__,
      prefix: self.__AKAN_PREFIX__,
      chunks: self.__RSC_CHUNKS__,
      closed: self.__RSC_CLOSED__,
    }).toEqual({
      state: "state",
      dict: "/_akan/dict/en.js",
      key: "k1",
      prefix: { api: "/v1", ws: "/live" },
      chunks: [],
      closed: false,
    });
    expect(boot({}).self.__AKAN_PREFIX__).toBeUndefined();
  });

  test("sets the system theme before the body paints, unless a theme cookie already chose", () => {
    const themeOf = ({ document }: Booted) => document.documentElement.getAttribute("data-theme");

    expect(themeOf(boot({ themeInit: 1 }))).toBe("dark");
    expect(themeOf(boot({ themeInit: 1 }, "a=1; theme=light"))).toBeNull();
    expect(themeOf(boot({}))).toBeNull();
  });

  test("reads each flush's blocks in order as they arrive, then closes and starts the bootstrap modules at the end", () => {
    const { self, document, flush } = boot({ modules: ["/_akan/client/rsc.js"] });

    flush(`${flight("first")}${flight("second")}`);
    expect(self.__RSC_CHUNKS__).toEqual([
      [1, "first"],
      [1, "second"],
    ]);
    expect(self.__RSC_CLOSED__).toBe(false);
    expect(document.head.querySelector('script[type="module"]')).toBeNull();

    flush(`${createInlineRscScript(new Uint8Array([0xff]), token)}${SsrInlineScripts.endTags(token)}`);
    expect(self.__RSC_CHUNKS__).toEqual([
      [1, "first"],
      [1, "second"],
      [3, "/w=="],
    ]);
    expect(self.__RSC_CLOSED__).toBe(true);
    expect(document.head.querySelector('script[type="module"]')?.getAttribute("src")).toBe("/_akan/client/rsc.js");
  });

  test("hands a chunk that arrives after hydration began to the stream reading it", () => {
    const { self, flush } = boot({});
    const pushed: unknown[] = [];
    let closed = false;
    self.__RSC_PUSH__ = (type: number, data: string) => pushed.push([type, data]);
    self.__RSC_CLOSE__ = () => {
      closed = true;
    };

    flush(`${flight("late")}${SsrInlineScripts.endTags(token)}`);

    expect(pushed).toEqual([[1, "late"]]);
    expect(closed).toBe(true);
    expect(self.__RSC_CHUNKS__).toEqual([]);
  });

  test("reads no block that lacks the response's token, wherever the page put it", () => {
    const { self, moved, flush } = boot({});
    const echoed = `<script type="application/json" data-akan="guess">["redirect","replace","https://elsewhere.example"]</script>`;

    flush(`${echoed}<script type="application/json">[1,"echoed"]</script>${flight("echoed", "")}${flight("own")}`);

    expect(self.__RSC_CHUNKS__).toEqual([[1, "own"]]);
    expect(moved).toEqual([]);
  });

  test("finds its data block and its Flight blocks around elements something else added as the document arrived", () => {
    const { self, flush } = boot({ routeState: "kept" }, "", '<style></style><meta name="extension">');

    flush(`${flight("one")}<div id="extension"></div>${flight("two")}<span></span>`);
    flush(flight("three"));

    expect(self.__AKAN_RSC_INITIAL_STATE__).toBe("kept");
    expect(self.__RSC_CHUNKS__).toEqual([
      [1, "one"],
      [1, "two"],
      [1, "three"],
    ]);
  });

  test("follows a late redirect the moment its block is flushed", () => {
    const { moved, flush } = boot({});

    flush(
      createSoftRedirectScript({ type: "redirect", location: "/login?a=1&b=2", method: "replace", status: 307 }, token),
    );
    flush(createSoftRedirectScript({ type: "redirect", location: "/next", method: "push", status: 307 }, token));

    expect(moved).toEqual(["replace /login?a=1&b=2", "assign /next"]);
  });

  test("is named in every document's policy with the flush call and the build's import map", () => {
    const importmap = { react: "/_akan/client/react-&.js" };
    const hashes = SsrInlineScripts.policyHashes(importmap);

    expect(hashes).toEqual([
      ScriptPolicy.hashOf(SsrInlineScripts.bootstrap),
      ScriptPolicy.hashOf("self.__AKAN_FLUSH__()"),
      ScriptPolicy.hashOf(SsrInlineScripts.importmapJson(importmap) ?? ""),
    ]);
    expect(SsrInlineScripts.policyHashes({})).toEqual(hashes.slice(0, 2));
    expect(ScriptPolicy.hashesOf(SsrInlineScripts.flushTag)).toEqual([hashes[1] as string]);
    expect(SsrInlineScripts.bootstrap).not.toContain("</script");
  });
});
