import { describe, expect, test } from "bun:test";
import { streamOfChunks } from "./flightRows.fixture";
import { HeadSplice } from "./headSplice";

const encoder = new TextEncoder();
const bytesOf = (text: string) => encoder.encode(text);
const cutAt = (bytes: Uint8Array, ...offsets: number[]): Uint8Array[] =>
  [0, ...offsets].map((start, idx) => bytes.subarray(start, offsets[idx] ?? bytes.length));
const splice = async (chunks: Uint8Array[], options: Partial<Parameters<typeof HeadSplice.into>[1]> = {}) => {
  const stream = HeadSplice.into(streamOfChunks(chunks), { afterOpen: "<a>", beforeClose: "<z>", ...options });
  return await new Response(stream).text();
};

describe("HeadSplice", () => {
  const document = '<!DOCTYPE html><html lang="ko"><head><title>제목</title></head><body>본문</body></html>';
  const spliced = '<!DOCTYPE html><html lang="ko"><head><a><title>제목</title><z></head><body>본문</body></html>';

  test("writes one set of tags after <head> and another before </head>", async () => {
    expect(await splice([bytesOf(document)])).toBe(spliced);
  });

  test("finds a </head> that arrives in two chunks, wherever it is cut", async () => {
    const bytes = bytesOf(document);
    const close = document.indexOf("</head>");
    const closeAt = bytesOf(document.slice(0, close)).length;
    for (let into = 1; into < "</head>".length; into++)
      expect(await splice(cutAt(bytes, closeAt + into))).toBe(spliced);
  });

  test("finds a <head> that arrives in two chunks, and a document that arrives a byte at a time", async () => {
    const bytes = bytesOf(document);
    const openAt = document.indexOf("<head>");
    for (let into = 1; into < "<head>".length; into++) expect(await splice(cutAt(bytes, openAt + into))).toBe(spliced);
    expect(await splice(Array.from(bytes, (byte) => Uint8Array.of(byte)))).toBe(spliced);
  });

  test("keeps a character whole when the chunk that closes the head ends inside it", async () => {
    for (const character of ["é", "가", "😀"]) {
      const text = `<html><head></head><body>${character}끝</body></html>`;
      const bytes = bytesOf(text);
      const characterAt = text.indexOf(character);
      for (let into = 1; into < bytesOf(character).length; into++) {
        expect(await splice(cutAt(bytes, characterAt + into))).toBe(
          `<html><head><a><z></head><body>${character}끝</body></html>`,
        );
        expect(await splice(cutAt(bytes, characterAt + into), { beforeClose: "" })).toBe(
          `<html><head><a></head><body>${character}끝</body></html>`,
        );
      }
    }
  });

  test("keeps a character whole when a chunk inside the head ends inside it", async () => {
    const bytes = bytesOf(document);
    const titleAt = bytesOf(document.slice(0, document.indexOf("제목"))).length;
    for (const into of [1, 2, 4, 5]) expect(await splice(cutAt(bytes, titleAt + into))).toBe(spliced);
  });

  test("rewrites what comes before the head, the <head> tag included", async () => {
    const rewriteOpening = (html: string) => html.replace("<html", "<html data-theme=dark");
    expect(await splice(cutAt(bytesOf(document), 20), { rewriteOpening })).toBe(
      spliced.replace("<html", "<html data-theme=dark"),
    );
  });

  test("passes a document with no head through, rewritten as an opening", async () => {
    const rewriteOpening = (html: string) => html.replace("<html", "<html data-theme=dark");
    const chunks = cutAt(bytesOf("<html><body>오류</body></html>"), 13);
    expect(await splice(chunks, { rewriteOpening })).toBe("<html data-theme=dark><body>오류</body></html>");
    expect(await splice(chunks, { rewriteOpening, withoutHead: (html) => `<a>${html}` })).toBe(
      "<a><html><body>오류</body></html>",
    );
  });

  test("passes a head that never closes through, without the closing tags", async () => {
    expect(await splice(cutAt(bytesOf("<html><head><title>제목</title></hea"), 14))).toBe(
      "<html><head><a><title>제목</title></hea",
    );
  });
});
