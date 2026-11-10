import { mapFlightLineRows } from "./flightRowReader";

export interface ChunkNavigation {
  navId: number;
  href: string;
  replace: () => boolean;
}

//? RSDW asks the global loader for a chunk without naming the response that wants it, so a navigation's `I` rows
//? record the chunks they name; a chunk no navigation named is the document's own.
const chunkNavigations = new Map<string, ChunkNavigation>();
const quotedString = /"([^"\\]*)"/g;
const maxScriptRowBytes = 1024;
const rowDecoder = new TextDecoder();

export function recordChunksOf(
  stream: ReadableStream<Uint8Array>,
  navigation: ChunkNavigation,
): ReadableStream<Uint8Array> {
  //? RSDW outlines a chunk path of 16+ characters into a string row the `I` row names as `$<row id>`, until 32,768
  //? characters per response; shorter paths and those past the budget stay inline.
  const scriptRows = new Map<string, string>();
  return mapFlightLineRows(stream, (row, tag) => {
    if (tag !== "I" && (tag !== "" || row.byteLength > maxScriptRowBytes)) return row;
    const text = rowDecoder.decode(row);
    const colon = text.indexOf(":");
    const value = text.slice(colon + 1 + tag.length).trimEnd();
    if (tag === "") {
      if (value.startsWith('"') && value.endsWith('.js"')) scriptRows.set(text.slice(0, colon), value.slice(1, -1));
      return row;
    }
    for (const [, named] of value.matchAll(quotedString)) {
      const chunkId = (named.startsWith("$") ? scriptRows.get(named.slice(1)) : undefined) ?? named;
      if (chunkId.endsWith(".js")) chunkNavigations.set(chunkId, navigation);
    }
    return row;
  });
}

export const navigationOfChunk = (chunkId: string): ChunkNavigation | undefined => chunkNavigations.get(chunkId);

//? How Chromium, Firefox and WebKit word a failed link or bare specifier; a fetch or evaluation error is not skew.
const linkFailure =
  /does not provide an export named|doesn't provide an export named|import not found|Importing binding name|Failed to resolve module specifier|was a bare specifier|does not resolve to a valid URL/;
export const isLinkFailure = (error: unknown): error is SyntaxError | TypeError =>
  (error instanceof SyntaxError || error instanceof TypeError) && linkFailure.test(error.message);

//? RSDW rethrows a chunk's rejection from the element that renders it, so React reports a failure the loader decided.
const chunkLoadFailures = new WeakSet<object>();
export const noteChunkLoadFailure = (error: unknown): void => {
  if (typeof error === "object" && error !== null) chunkLoadFailures.add(error);
};
export const isLazyLinkFailure = (error: unknown): error is SyntaxError | TypeError =>
  isLinkFailure(error) && !chunkLoadFailures.has(error);

//? Per tab and synchronous, which akanjs/client `storage` (localStorage, async) is not; unrecorded, it never reloads.
const chunkReloadsKey = "akan.rsc.chunkReloads";
export function claimChunkReload(chunkId: string): boolean {
  try {
    const reloaded = JSON.parse(sessionStorage.getItem(chunkReloadsKey) ?? "[]") as string[];
    if (reloaded.includes(chunkId)) return false;
    sessionStorage.setItem(chunkReloadsKey, JSON.stringify([...reloaded, chunkId].slice(-32)));
    return true;
  } catch {
    return false;
  }
}

//? Not `typeof process`: the define replaces only this member read, and a browser has no `process` to test.
export const isBuildBundle = (): boolean => {
  try {
    return process.env.AKAN_BUNDLE_COMMAND === "build";
  } catch {
    return false;
  }
};
