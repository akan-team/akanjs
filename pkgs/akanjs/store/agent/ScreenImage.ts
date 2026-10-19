import { Binary } from "akanjs/base";
import { type MessageAttachment, ToolOutput } from "use-agentic";
import { ScreenTarget } from "./ScreenTarget";

export interface ScreenImageView {
  attachment: MessageAttachment;
  /** The picture's size and how it was sent, for a model asked about its proportions or resolution. */
  size: string;
}

/**
 * A picture on the screen, handed to the model as the browser drew it: redrawn into a JPEG no longer than
 * `maxEdge`, inlined as bytes. Redrawing turns HEIC, AVIF and SVG into a type every provider reads, bounds what one
 * picture costs, and leaves the provider nothing to download — a storage path or a `blob:` address it cannot reach,
 * or a signed URL that expires while the conversation still carries it.
 */
export class ScreenImage {
  /** The long edge Anthropic downscales past; a bigger picture spends upload and latency on pixels nobody reads. */
  static readonly maxEdge = 1568;
  static readonly quality = 0.85;
  static readonly loadMs = 10_000;

  static readonly #typeByExtension = new Map([
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["gif", "image/gif"],
    ["webp", "image/webp"],
  ]);

  /** The `<img>` showing `src` in `root`, matched on what readScreen prints, its absolute form, or the attribute. */
  static find(src: string, root?: HTMLElement): HTMLImageElement | null {
    const scope = root ?? (typeof document === "undefined" ? null : document.body);
    if (!scope) return null;
    for (const image of scope.querySelectorAll("img"))
      if (
        (image.currentSrc === src || image.src === src || image.getAttribute("src") === src) &&
        ScreenTarget.visible(image)
      )
        return image;
    return null;
  }

  static async view(image: HTMLImageElement): Promise<ScreenImageView> {
    const src = image.currentSrc || image.src;
    const name = ScreenImage.#nameOf(image, src);
    // A lazy picture off screen has not loaded yet, and loading a copy does not wait for it to scroll into view.
    const loaded = image.complete && image.naturalWidth > 0 ? image : await ScreenImage.#load(src, false);
    const drawn =
      (loaded ? await ScreenImage.#draw(loaded, name) : null) ??
      (await ScreenImage.#drawFrom(await ScreenImage.#load(src, true), name));
    if (drawn) return drawn;
    const mimeType = ScreenImage.#typeOf(src);
    if (mimeType && ScreenImage.publiclyFetchable(src))
      return {
        attachment: { name, mimeType, url: src },
        size: `${ScreenImage.#sizeOf(image)}, sent by address because this page may not read its pixels`,
      };
    throw new Error(
      `${name} cannot be viewed: its host does not let this page read the picture, and the model's provider cannot download it from ${src}. Tell the user you cannot see it.`,
    );
  }

  /**
   * Whether a provider could download `url` itself — an http(s) address off loopback, private, link-local and CGNAT
   * ranges. It decides between an address and no picture at all; it is not an SSRF guard and must not become one.
   */
  static publiclyFetchable(url: string): boolean {
    if (!/^https?:\/\//i.test(url)) return false;
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      return false;
    }
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return false;
    if (hostname === "internal" || hostname.endsWith(".internal")) return false;
    if (hostname.startsWith("[")) return !ScreenImage.#privateV6(hostname.slice(1, -1));
    return !/^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(
      hostname,
    );
  }

  static #privateV6(address: string): boolean {
    if (address === "::" || address === "::1" || address.startsWith("::ffff:")) return true;
    const first = Number.parseInt(address.split(":")[0] || "0", 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
  }

  static async #drawFrom(image: HTMLImageElement | null, name: string): Promise<ScreenImageView | null> {
    return image ? await ScreenImage.#draw(image, name) : null;
  }

  static async #draw(image: HTMLImageElement, name: string): Promise<ScreenImageView | null> {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return null;
    const scale = Math.min(1, ScreenImage.maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    // JPEG has no alpha channel: a transparent pixel left unfilled encodes as black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null;
    try {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", ScreenImage.quality));
    } catch {
      // A picture another origin served without CORS taints the canvas, and reading one back throws.
      return null;
    }
    if (!blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > ToolOutput.attachmentBytes)
      throw new Error(`${name} is ${bytes.length} bytes even as a JPEG, past what one tool result may carry.`);
    return {
      attachment: { name, mimeType: "image/jpeg", data: Binary.toBase64(bytes) },
      size: `${width}×${height}, sent as ${canvas.width}×${canvas.height} JPEG`,
    };
  }

  static #load(src: string, cors: boolean): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const image = new Image();
      if (cors) image.crossOrigin = "anonymous";
      const timer = setTimeout(() => resolve(null), ScreenImage.loadMs);
      image.onload = () => {
        clearTimeout(timer);
        resolve(image);
      };
      image.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      image.src = src;
    });
  }

  static #nameOf(image: HTMLImageElement, src: string): string {
    const alt = image.getAttribute("alt")?.trim();
    if (alt) return alt;
    if (!/^https?:/i.test(src)) return "image";
    try {
      return decodeURIComponent(new URL(src).pathname.split("/").pop() ?? "") || "image";
    } catch {
      return "image";
    }
  }

  static #typeOf(src: string): string | null {
    let pathname: string;
    try {
      pathname = new URL(src).pathname;
    } catch {
      return null;
    }
    return ScreenImage.#typeByExtension.get(pathname.split(".").pop()?.toLowerCase() ?? "") ?? null;
  }

  static #sizeOf(image: HTMLImageElement): string {
    return image.naturalWidth ? `${image.naturalWidth}×${image.naturalHeight}` : "size unknown";
  }
}
