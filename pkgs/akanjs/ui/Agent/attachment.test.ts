import { describe, expect, test } from "bun:test";
import type { MessageAttachment } from "use-agentic";
import { Attachment, maxAttachmentBytes } from "./attachment";

const fileOf = (name: string, type: string, body: string) => new File([body], name, { type });

describe("Attachment.read", () => {
  test("reads an image as bytes and a text file as text", async () => {
    const image = await Attachment.read(fileOf("shot.png", "image/png", "abc"));
    if (Attachment.failure(image)) throw new Error("expected an attachment");
    expect(image).toEqual({ name: "shot.png", mimeType: "image/png", data: btoa("abc") });
    const text = await Attachment.read(fileOf("notes.md", "text/markdown", "# hi"));
    expect(text).toEqual({ name: "notes.md", mimeType: "text/markdown", text: "# hi" });
    const json = await Attachment.read(fileOf("d.json", "application/json", "{}"));
    expect(json).toEqual({ name: "d.json", mimeType: "application/json", text: "{}" });
  });

  test("refuses a file past the ceiling before reading it", async () => {
    const big = fileOf("big.png", "image/png", "x");
    Object.defineProperty(big, "size", { value: maxAttachmentBytes + 1 });
    expect(await Attachment.read(big)).toBe("tooLarge");
  });

  test("refuses what no reader handles, so the user hears which file it was", async () => {
    expect(await Attachment.read(fileOf("spec.pdf", "application/pdf", "%PDF"))).toBe("unsupported");
  });

  test("the app's reader runs first, and answering null falls back to the built-in", async () => {
    const extracted: MessageAttachment = { name: "spec.pdf", mimeType: "application/pdf", text: "page one" };
    const attach = async (file: File) => (file.type === "application/pdf" ? extracted : null);
    expect(await Attachment.read(fileOf("spec.pdf", "application/pdf", "%PDF"), attach)).toEqual(extracted);
    expect(await Attachment.read(fileOf("shot.png", "image/png", "abc"), attach)).toEqual({
      name: "shot.png",
      mimeType: "image/png",
      data: btoa("abc"),
    });
  });

  test("the app's reader may also replace the built-in handling of an image", async () => {
    const smaller: MessageAttachment = { name: "shot.png", mimeType: "image/png", data: "smaller" };
    expect(await Attachment.read(fileOf("shot.png", "image/png", "abc"), async () => smaller)).toEqual(smaller);
  });
});

describe("Attachment sizing", () => {
  test("bytes are counted off the carrier, so the message ceiling can be checked before sending", () => {
    expect(Attachment.bytesOf({ name: "a.png", mimeType: "image/png", data: btoa("abcd") })).toBe(4);
    expect(Attachment.bytesOf({ name: "a.md", mimeType: "text/markdown", text: "hello" })).toBe(5);
    expect(Attachment.bytesOf({ name: "a.png", mimeType: "image/png", url: "https://x/a.png" })).toBe(0);
  });

  test("the same file picked twice is the same attachment", () => {
    const one: MessageAttachment = { name: "shot.png", mimeType: "image/png", data: btoa("abc") };
    expect(Attachment.same(one, { ...one })).toBe(true);
    expect(Attachment.same(one, { ...one, name: "other.png" })).toBe(false);
    expect(Attachment.same(one, { ...one, data: btoa("abcd") })).toBe(false);
  });
});
