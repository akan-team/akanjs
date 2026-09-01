import type { MessageAttachment } from "use-agentic";

/** Turns one picked file into an attachment, or `null` to say this reader does not handle that file. */
export type AttachReader = (file: File) => Promise<MessageAttachment | null>;

/**
 * Per-file ceiling for the composer. The bytes ride inside one turn's JSON request, so a file past this is not a
 * slow attachment — it is a request the relay and the provider both refuse, and refusing it here is the only place
 * the user learns which file it was.
 */
export const maxAttachmentBytes = 4 * 1024 * 1024;

/**
 * Ceilings for one message rather than one file. The bytes ride inside a single turn's JSON, so what a provider
 * refuses is the sum — and a count cap keeps a whole folder dropped onto the panel from becoming one request that
 * cannot be sent and cannot be edited down without starting over.
 */
export const maxMessageAttachmentBytes = 8 * 1024 * 1024;
export const maxMessageAttachments = 5;

export type AttachFailure = "tooLarge" | "unsupported";

const textMimes = new Set(["application/json", "application/xml", "application/x-yaml", "application/yaml"]);

export class Attachment {
  /**
   * Reads what a browser can read on its own — an image as bytes, a text-ish file as text — and hands everything
   * else to the app's own reader. That split is the layer boundary: a PDF needs a parser, so extracting one is the
   * app's business (`attach`), while carrying the result is the framework's.
   *
   * The app's reader runs first so it can also replace the built-in handling, which is what downscaling an image
   * before it costs a megabyte of prompt looks like.
   */
  static async read(file: File, attach?: AttachReader): Promise<MessageAttachment | AttachFailure> {
    if (file.size > maxAttachmentBytes) return "tooLarge";
    const injected = await attach?.(file);
    if (injected) return injected;
    // A media type may carry parameters (`text/plain;charset=utf-8`), and a provider matches on the essence alone.
    const mimeType = file.type.split(";")[0].trim().toLowerCase();
    if (mimeType.startsWith("image/")) return { name: file.name, mimeType, data: await Attachment.#base64(file) };
    if (mimeType.startsWith("text/") || textMimes.has(mimeType))
      return { name: file.name, mimeType: mimeType || "text/plain", text: await file.text() };
    return "unsupported";
  }

  static failure(value: MessageAttachment | AttachFailure): value is AttachFailure {
    return typeof value === "string";
  }

  /** What this attachment costs the request: base64 carries three bytes per four characters, less its padding. */
  static bytesOf(attachment: MessageAttachment): number {
    const data = attachment.data ?? "";
    const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((data.length * 3) / 4) - padding) + (attachment.text?.length ?? 0);
  }

  /** Same name and same size is the same file picked twice — the shape a re-drop or a double paste produces. */
  static same(one: MessageAttachment, other: MessageAttachment): boolean {
    return one.name === other.name && Attachment.bytesOf(one) === Attachment.bytesOf(other);
  }

  /**
   * Chunked because `String.fromCharCode(...bytes)` spreads one argument per byte, and a megabyte of them is a
   * RangeError rather than a slow call.
   */
  static async #base64(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunk = 0x8000;
    let binary = "";
    for (let at = 0; at < bytes.length; at += chunk) binary += String.fromCharCode(...bytes.subarray(at, at + chunk));
    return btoa(binary);
  }
}
