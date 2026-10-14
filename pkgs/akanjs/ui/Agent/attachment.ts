import { Binary } from "akanjs/base";
import type { MessageAttachment } from "use-agentic";

/** `null` leaves the file to the built-in reader. */
export type AttachReader = (file: File) => Promise<MessageAttachment | null>;

/** The bytes ride inside one turn's JSON request, which the relay and the provider both refuse past this. */
export const maxAttachmentBytes = 4 * 1024 * 1024;

/** A provider refuses the sum of one turn's attachments, not each file. */
export const maxMessageAttachmentBytes = 8 * 1024 * 1024;
export const maxMessageAttachments = 5;

export interface AttachLimits {
  /** Measured on what the reader produced, not on the source file. */
  perFileBytes?: number;
  perMessageBytes?: number;
  perMessageCount?: number;
}

export type AttachFailure = "tooLarge" | "unsupported";

const textMimes = new Set(["application/json", "application/xml", "application/x-yaml", "application/yaml"]);

export class Attachment {
  // The app's reader runs before the ceiling, which measures what it produced: a `url` answer pays no source size.
  static async read(
    file: File,
    attach?: AttachReader,
    limits: AttachLimits = {},
  ): Promise<MessageAttachment | AttachFailure> {
    const perFile = limits.perFileBytes ?? maxAttachmentBytes;
    const injected = await attach?.(file);
    if (injected) return Attachment.bytesOf(injected) > perFile ? "tooLarge" : injected;
    if (file.size > perFile) return "tooLarge";
    // A media type may carry parameters (`text/plain;charset=utf-8`), and a provider matches on the essence alone.
    const mimeType = file.type.split(";")[0].trim().toLowerCase();
    if (mimeType.startsWith("image/"))
      return { name: file.name, mimeType, data: Binary.toBase64(new Uint8Array(await file.arrayBuffer())) };
    if (mimeType.startsWith("text/") || textMimes.has(mimeType))
      return { name: file.name, mimeType: mimeType || "text/plain", text: await file.text() };
    return "unsupported";
  }

  static failure(value: MessageAttachment | AttachFailure): value is AttachFailure {
    return typeof value === "string";
  }

  // base64 carries three bytes per four characters, less its padding.
  static bytesOf(attachment: MessageAttachment): number {
    const data = attachment.data ?? "";
    const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((data.length * 3) / 4) - padding) + (attachment.text?.length ?? 0);
  }

  static overflow(attachments: readonly MessageAttachment[], limits: AttachLimits = {}): "tooMany" | "tooMuch" | null {
    if (attachments.length > (limits.perMessageCount ?? maxMessageAttachments)) return "tooMany";
    const bytes = attachments.reduce((sum, one) => sum + Attachment.bytesOf(one), 0);
    return bytes > (limits.perMessageBytes ?? maxMessageAttachmentBytes) ? "tooMuch" : null;
  }

  // A `ref` decides when present: name and size also collide for two crops of one export.
  static same(one: MessageAttachment, other: MessageAttachment): boolean {
    if (one.ref || other.ref) return one.ref === other.ref;
    return one.name === other.name && Attachment.bytesOf(one) === Attachment.bytesOf(other);
  }
}
