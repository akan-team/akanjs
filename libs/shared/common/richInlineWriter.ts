import { MentionGrammar } from "./mentionGrammar";
import { RichInlineReader } from "./richInlineReader";

export interface WritableNode {
  type?: string;
  text?: string;
  format?: unknown;
  detail?: unknown;
  mode?: unknown;
  style?: unknown;
  children?: WritableNode[];
  url?: string;
  title?: string | null;
  isUnlinked?: boolean;
  label?: unknown;
  refName?: unknown;
  refId?: unknown;
}

type Segment = { text: string; format: number } | { raw: string };

type Marker = "bold" | "strike" | "highlight" | "italic";

type TableForm = "gfm" | "html";

/**
 * Inline nodes as the markdown `RichInlineReader` reads back into the same nodes, or `null` when a node or a format
 * has no markdown form — the caller then keeps the whole block verbatim instead.
 */
export class RichInlineWriter {
  static readonly #markers: readonly Marker[] = ["bold", "strike", "highlight", "italic"];
  static readonly #writable =
    RichInlineReader.formatBits.bold |
    RichInlineReader.formatBits.italic |
    RichInlineReader.formatBits.strike |
    RichInlineReader.formatBits.code |
    RichInlineReader.formatBits.highlight;

  static write(nodes: WritableNode[], { inTable }: { inTable?: TableForm } = {}): string | null {
    const segments = RichInlineWriter.#segmentsOf(nodes, inTable);
    return segments ? new RichInlineWriter(segments, inTable === "gfm").#run() : null;
  }

  readonly #segments: Segment[];
  readonly #pipes: boolean;
  #open: Marker[] = [];
  #out = "";
  #italicMarker = "_";

  constructor(segments: Segment[], pipes: boolean) {
    this.#segments = segments;
    this.#pipes = pipes;
  }

  #run() {
    this.#segments.forEach((segment, idx) => {
      if ("raw" in segment) {
        this.#closeFrom(0);
        this.#out += segment.raw;
        return;
      }
      const wanted = RichInlineWriter.#markers.filter((marker) => segment.format & RichInlineReader.formatBits[marker]);
      const stale = this.#open.findIndex((marker) => !wanted.includes(marker));
      if (stale >= 0) this.#closeFrom(stale);
      for (const marker of wanted) {
        if (this.#open.includes(marker)) continue;
        this.#open.push(marker);
        this.#out += this.#delimiter(marker, idx);
      }
      this.#out +=
        segment.format & RichInlineReader.formatBits.code ? `\`${segment.text}\`` : this.#escape(segment.text);
    });
    this.#closeFrom(0);
    return this.#out;
  }

  #closeFrom(idx: number) {
    while (this.#open.length > idx) {
      const marker = this.#open.pop();
      if (marker) this.#out += this.#delimiter(marker, -1);
    }
  }

  // `_` never opens inside a word, so an italic run touching a letter on either side needs `*` instead.
  #delimiter(marker: Marker, openAt: number) {
    if (marker === "bold") return "**";
    if (marker === "strike") return "~~";
    if (marker === "highlight") return "==";
    if (openAt >= 0) this.#italicMarker = this.#intraword(openAt) ? "*" : "_";
    return this.#italicMarker;
  }

  #intraword(openAt: number) {
    const word = /[\p{L}\p{N}]/u;
    let end = openAt;
    while (end + 1 < this.#segments.length) {
      const next = this.#segments[end + 1];
      if ("raw" in next || !(next.format & RichInlineReader.formatBits.italic)) break;
      end += 1;
    }
    return (
      word.test(this.#out.at(-1) ?? "") || word.test(RichInlineWriter.#textOf(this.#segments[end + 1]).at(0) ?? "")
    );
  }

  #escape(text: string) {
    const escaped = text
      .replace(/[\\`*[\]<]/g, "\\$&")
      .replace(/~~/g, "\\~\\~")
      .replace(/==/g, "\\=\\=")
      .replace(/_/g, (underscore, at: number) =>
        /[\p{L}\p{N}]/u.test(text[at - 1] ?? "") && /[\p{L}\p{N}]/u.test(text[at + 1] ?? "") ? underscore : "\\_",
      );
    return this.#pipes ? escaped.replace(/\|/g, "\\|") : escaped;
  }

  static #textOf(segment: Segment | undefined) {
    if (!segment) return "";
    return "raw" in segment ? segment.raw : segment.text;
  }

  static #segmentsOf(nodes: WritableNode[], inTable: TableForm | undefined): Segment[] | null {
    const segments: Segment[] = [];
    for (const node of nodes) {
      const segment = RichInlineWriter.#segment(node, inTable);
      if (!segment) return null;
      if ("raw" in segment || segment.text) segments.push(segment);
    }
    return segments;
  }

  static #segment(node: WritableNode, inTable: TableForm | undefined): Segment | null {
    switch (node.type) {
      case "text":
        return RichInlineWriter.#text(node, inTable === "gfm");
      case "linebreak":
        return { raw: inTable ? "<br>" : "\n" };
      case "akan-mention":
        return RichInlineWriter.#piped(RichInlineWriter.#mention(node), inTable === "gfm");
      case "link":
        return RichInlineWriter.#link(node, inTable);
      case "autolink":
        return RichInlineWriter.#piped(RichInlineWriter.#autolink(node), inTable === "gfm");
      default:
        return null;
    }
  }

  static #text(node: WritableNode, pipes: boolean): Segment | null {
    const format = typeof node.format === "number" ? node.format : 0;
    if (format & ~RichInlineWriter.#writable) return null;
    if ((node.style ?? "") !== "" || (node.detail ?? 0) !== 0 || (node.mode ?? "normal") !== "normal") return null;
    const text = node.text ?? "";
    if (/\n/.test(text)) return null;
    if (format & RichInlineReader.formatBits.code) {
      if (text.includes("`")) return null;
      return { text: pipes ? text.replace(/\|/g, "\\|") : text, format };
    }
    return { text, format };
  }

  static #mention(node: WritableNode): Segment | null {
    if (typeof node.refName !== "string" || typeof node.refId !== "string") return null;
    const label = typeof node.label === "string" ? node.label : (node.text ?? "").replace(/^@/, "");
    return { raw: MentionGrammar.token({ refName: node.refName, refId: node.refId, label }) };
  }

  static #link(node: WritableNode, inTable: TableForm | undefined): Segment | null {
    if (!node.url || /[\s()]/.test(node.url)) return null;
    const label = RichInlineWriter.write(node.children ?? [], { inTable });
    if (label === null) return null;
    const title = node.title ? ` "${node.title.replace(/(["\\])/g, "\\$1")}"` : "";
    const url = inTable === "gfm" ? node.url.replace(/\|/g, "\\|") : node.url;
    return { raw: `[${label}](${url}${title})` };
  }

  // A table row is split on its pipes before anything inside a cell is read, so a raw token has to escape its own.
  static #piped(segment: Segment | null, pipes: boolean): Segment | null {
    if (!segment || !pipes || !("raw" in segment)) return segment;
    return { raw: segment.raw.replace(/\|/g, "\\|") };
  }

  static #autolink(node: WritableNode): Segment | null {
    if (!node.url || node.isUnlinked || /[\s<>]/.test(node.url)) return null;
    const [only, ...rest] = node.children ?? [];
    const bare = !rest.length && only?.type === "text" && !only.format && only.text === node.url;
    if (bare && /^(?:https?|mailto):/i.test(node.url)) return { raw: `<${node.url}>` };
    const label = RichInlineWriter.write(node.children ?? []);
    return label === null ? null : { raw: `[${label}](<${node.url}>)` };
  }
}
