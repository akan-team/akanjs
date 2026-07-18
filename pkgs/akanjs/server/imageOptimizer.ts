import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ImageOptimizerError } from "./imageOptimizerError";
import {
  type AkanImageConfig,
  type AkanImageFormat,
  type AkanImagePattern,
  getAkanImageWidths,
  mergeAkanImageConfig,
} from "./types";

type SharpFactory = typeof import("sharp");

let sharpLoad: Promise<SharpFactory> | null = null;

function loadSharp(): Promise<SharpFactory> {
  sharpLoad ??= import("sharp").then((mod) => {
    const loaded = mod as unknown as { default?: SharpFactory } & SharpFactory;
    return loaded.default ?? loaded;
  });
  return sharpLoad;
}

export interface ImageOptimizerOptions {
  publicDir: string;
  cacheDir: string;
  prodMode: boolean;
  config?: Partial<AkanImageConfig>;
}

interface ParsedImageRequest {
  href: string;
  width: number;
  quality: number;
  outputType: AkanImageFormat | "";
  isRemote: boolean;
}

interface ImageSource {
  buffer: Buffer;
  contentType: string;
  cacheControl?: string | null;
  upstreamTag: string;
}

interface OptimizedImage {
  buffer: Buffer;
  contentType: string;
  etag: string;
  maxAge: number;
}

export class ImageOptimizer {
  static readonly #optimizerPath = "/_akan/image";
  static readonly #svg = "image/svg+xml";
  static readonly #jpeg = "image/jpeg";
  static readonly #png = "image/png";
  static readonly #webp = "image/webp";
  static readonly #gif = "image/gif";
  static readonly #avif = "image/avif";
  static readonly #bypassTypes = new Set(["image/x-icon", "image/x-icns", "image/bmp", "image/jxl", "image/heic"]);

  #publicDir: string;
  #cacheDir: string;
  #prodMode: boolean;
  #config: AkanImageConfig;

  constructor({ publicDir, cacheDir, prodMode, config }: ImageOptimizerOptions) {
    this.#publicDir = publicDir;
    this.#cacheDir = cacheDir;
    this.#prodMode = prodMode;
    this.#config = mergeAkanImageConfig(config);
  }

  async handle(req: Request): Promise<Response> {
    const parsed = this.#parseRequest(req);
    if ("error" in parsed) return new Response(parsed.error, { status: 400 });

    try {
      const source = parsed.isRemote
        ? await this.#fetchRemoteImage(parsed.href)
        : await this.#readLocalImage(parsed.href);
      const optimized = await this.#getOptimizedImage(source, parsed);
      return this.#imageResponse(req, optimized);
    } catch (error) {
      const message = error instanceof ImageOptimizerError ? error.message : "Unable to optimize image";
      const status = error instanceof ImageOptimizerError ? error.status : 500;
      return new Response(message, { status });
    }
  }

  #parseRequest(req: Request): ParsedImageRequest | { error: string } {
    const reqUrl = new URL(req.url);
    const url = reqUrl.searchParams.get("url");
    const widthParam = reqUrl.searchParams.get("w");
    const qualityParam = reqUrl.searchParams.get("q");

    if (!url) return { error: '"url" parameter is required' };
    if (url.length > 3072) return { error: '"url" parameter is too long' };
    if (url.startsWith("//")) return { error: '"url" parameter cannot be a protocol-relative URL' };

    let href: string;
    let isRemote = false;
    if (url.startsWith("/")) {
      href = url;
      const pathname = ImageOptimizer.#safeDecodePathname(url);
      if (!pathname) return { error: '"url" parameter is invalid' };
      if (pathname === ImageOptimizer.#optimizerPath || pathname.startsWith(`${ImageOptimizer.#optimizerPath}/`)) {
        return { error: '"url" parameter cannot be recursive' };
      }
      if (!ImageOptimizer.#hasLocalMatch(this.#config.localPatterns, url)) {
        return { error: '"url" parameter is not allowed' };
      }
    } else {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { error: '"url" parameter is invalid' };
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { error: '"url" parameter is invalid' };
      if (!ImageOptimizer.#hasRemoteMatch(this.#config.remotePatterns, parsed)) {
        return { error: '"url" parameter is not allowed' };
      }
      href = parsed.toString();
      isRemote = true;
    }

    if (!widthParam || !/^[0-9]+$/.test(widthParam)) {
      return { error: '"w" parameter (width) must be an integer greater than 0' };
    }
    const width = Number.parseInt(widthParam, 10);
    if (!getAkanImageWidths(this.#config).includes(width)) {
      return { error: `"w" parameter (width) of ${width} is not allowed` };
    }

    if (!qualityParam || !/^[0-9]+$/.test(qualityParam)) {
      return { error: '"q" parameter (quality) must be an integer between 1 and 100' };
    }
    const quality = Number.parseInt(qualityParam, 10);
    if (quality < 1 || quality > 100) return { error: '"q" parameter (quality) must be an integer between 1 and 100' };
    if (!this.#config.qualities.includes(quality)) {
      return { error: `"q" parameter (quality) of ${quality} is not allowed` };
    }

    return {
      href,
      width,
      quality,
      outputType: ImageOptimizer.#getPreferredOutputType(req.headers.get("accept") ?? "", this.#config.formats),
      isRemote,
    };
  }

  async #readLocalImage(href: string): Promise<ImageSource> {
    const url = new URL(href, "http://local.akan");
    const filePath = ImageOptimizer.#safeResolve(this.#publicDir, url.pathname);
    if (!filePath) throw new ImageOptimizerError(400, '"url" parameter is not allowed');
    const file = Bun.file(filePath);
    if (!(await file.exists())) throw new ImageOptimizerError(404, "Image not found");
    const stat = await fs.stat(filePath);
    const buffer = Buffer.from(await file.arrayBuffer());
    return {
      buffer,
      contentType: file.type || ImageOptimizer.#detectContentType(buffer) || "application/octet-stream",
      upstreamTag: `${stat.mtimeMs}:${stat.size}`,
    };
  }

  async #fetchRemoteImage(href: string): Promise<ImageSource> {
    let current = new URL(href);
    for (let redirect = 0; redirect <= this.#config.maximumRedirects; redirect += 1) {
      if (!ImageOptimizer.#hasRemoteMatch(this.#config.remotePatterns, current)) {
        throw new ImageOptimizerError(400, '"url" parameter is not allowed');
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#config.fetchTimeoutMs);
      try {
        const res = await fetch(current, {
          redirect: "manual",
          signal: controller.signal,
          headers: { accept: "image/*" },
        });
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          if (!location) throw new ImageOptimizerError(502, "Remote image redirect is missing location");
          current = new URL(location, current);
          continue;
        }
        if (!res.ok) throw new ImageOptimizerError(res.status, "Remote image request failed");
        const buffer = await ImageOptimizer.#readResponseBuffer(res, this.#config.maxRemoteBytes);
        return {
          buffer,
          contentType:
            res.headers.get("content-type")?.split(";")[0]?.trim() || ImageOptimizer.#detectContentType(buffer) || "",
          cacheControl: res.headers.get("cache-control"),
          upstreamTag: res.headers.get("etag") ?? ImageOptimizer.#hashBuffer(buffer),
        };
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new ImageOptimizerError(400, "Remote image exceeded maximum redirects");
  }

  async #getOptimizedImage(source: ImageSource, params: ParsedImageRequest): Promise<OptimizedImage> {
    const inputType = ImageOptimizer.#detectContentType(source.buffer) || source.contentType;
    if (!inputType || !inputType.startsWith("image/") || inputType.includes(",")) {
      throw new ImageOptimizerError(400, "The requested resource is not a valid image");
    }
    if (inputType === ImageOptimizer.#svg && !this.#config.dangerouslyAllowSVG) {
      throw new ImageOptimizerError(400, '"url" parameter is valid but image type is not allowed');
    }

    const maxAge = Math.max(this.#config.minimumCacheTTL, ImageOptimizer.#getMaxAge(source.cacheControl));
    const shouldBypass =
      inputType === ImageOptimizer.#svg ||
      ImageOptimizer.#bypassTypes.has(inputType) ||
      (await ImageOptimizer.#isAnimated(source.buffer, inputType));
    const outputType =
      shouldBypass || !params.outputType || inputType === ImageOptimizer.#webp || inputType === ImageOptimizer.#avif
        ? inputType
        : params.outputType;
    const cachePath = this.#getCachePath({
      href: params.href,
      width: params.width,
      quality: params.quality,
      outputType,
      upstreamTag: source.upstreamTag,
    });
    const cached = Bun.file(cachePath);
    if (await cached.exists()) {
      const buffer = Buffer.from(await cached.arrayBuffer());
      return { buffer, contentType: outputType, etag: ImageOptimizer.#hashBuffer(buffer), maxAge };
    }

    let buffer = source.buffer;
    let contentType = inputType;
    let cacheable = true;
    if (!shouldBypass) {
      try {
        buffer = await ImageOptimizer.#optimizeWithSharp(source.buffer, {
          width: params.width,
          quality: params.quality,
          contentType: outputType,
        });
        contentType = outputType;
      } catch {
        buffer = source.buffer;
        contentType = inputType;
        cacheable = false;
      }
    }

    if (cacheable) {
      await fs.mkdir(this.#cacheDir, { recursive: true });
      await Bun.write(cachePath, buffer);
    }
    return { buffer, contentType, etag: ImageOptimizer.#hashBuffer(buffer), maxAge };
  }

  #getCachePath(input: Record<string, string | number>) {
    const contentType = String(input.outputType);
    return path.join(
      this.#cacheDir,
      `${ImageOptimizer.#getCacheKey(input)}.${ImageOptimizer.#getExtension(contentType)}`,
    );
  }

  #imageResponse(req: Request, image: OptimizedImage) {
    const headers = new Headers({
      "Content-Type": image.contentType,
      "Cache-Control": this.#prodMode
        ? `public, max-age=${image.maxAge}, must-revalidate`
        : "public, max-age=0, must-revalidate",
      ETag: image.etag,
      Vary: "Accept",
    });
    if (req.headers.get("if-none-match") === image.etag) return new Response(null, { status: 304, headers });
    return new Response(ImageOptimizer.#toArrayBuffer(image.buffer), { headers });
  }

  static async #optimizeWithSharp(
    buffer: Buffer,
    options: { width: number; quality: number; contentType: string },
  ): Promise<Buffer> {
    const sharp = await loadSharp();
    if (sharp.concurrency() > 1) sharp.concurrency(Math.max(Math.floor(sharp.concurrency() / 2), 1));
    const transformer = sharp(buffer, {
      limitInputPixels: 268_402_689,
      sequentialRead: true,
    }).resize(options.width, undefined, { withoutEnlargement: true });

    if (options.contentType === ImageOptimizer.#avif)
      return await transformer.avif({ quality: options.quality }).toBuffer();
    if (options.contentType === ImageOptimizer.#webp)
      return await transformer.webp({ quality: options.quality }).toBuffer();
    if (options.contentType === ImageOptimizer.#png)
      return await transformer.png({ quality: options.quality }).toBuffer();
    return await transformer.jpeg({ quality: options.quality }).toBuffer();
  }

  static #getPreferredOutputType(accept: string, formats: AkanImageFormat[]): AkanImageFormat | "" {
    return formats.find((format) => accept.includes(format)) ?? "";
  }

  static #hasRemoteMatch(patterns: AkanImagePattern[], url: URL): boolean {
    return patterns.some((pattern) => {
      if (pattern.protocol && `${pattern.protocol}:` !== url.protocol) return false;
      if (pattern.port !== undefined && pattern.port !== url.port) return false;
      if (pattern.hostname && !ImageOptimizer.#globMatch(pattern.hostname, url.hostname)) return false;
      if (pattern.pathname && !ImageOptimizer.#globMatch(pattern.pathname, url.pathname)) return false;
      if (pattern.search !== undefined && pattern.search !== url.search) return false;
      return true;
    });
  }

  static #hasLocalMatch(patterns: Pick<AkanImagePattern, "pathname" | "search">[], href: string): boolean {
    const url = new URL(href, "http://local.akan");
    return patterns.some((pattern) => {
      if (pattern.pathname && !ImageOptimizer.#globMatch(pattern.pathname, url.pathname)) return false;
      if (pattern.search !== undefined && pattern.search !== url.search) return false;
      return true;
    });
  }

  static #globMatch(pattern: string, value: string): boolean {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "__AKAN_DOUBLE_STAR__")
      .replace(/\*/g, "[^/]*")
      .replace(/__AKAN_DOUBLE_STAR__/g, ".*");
    return new RegExp(`^${escaped}$`).test(value);
  }

  static #safeDecodePathname(href: string): string | null {
    try {
      return decodeURIComponent(new URL(href, "http://local.akan").pathname);
    } catch {
      return null;
    }
  }

  static #safeResolve(baseDir: string, urlPath: string): string | null {
    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (decoded.includes("\0")) return null;
    const normalizedBase = path.resolve(baseDir);
    const rel = decoded.replace(/^[/\\]+/, "");
    const resolved = path.resolve(normalizedBase, rel);
    if (resolved === normalizedBase) return resolved;
    const baseWithSep = normalizedBase.endsWith(path.sep) ? normalizedBase : normalizedBase + path.sep;
    return resolved.startsWith(baseWithSep) ? resolved : null;
  }

  static async #readResponseBuffer(res: Response, maxBytes: number): Promise<Buffer> {
    const contentLength = Number.parseInt(res.headers.get("content-length") ?? "0", 10);
    if (contentLength > maxBytes) throw new ImageOptimizerError(413, "Remote image is too large");
    const reader = res.body?.getReader();
    if (!reader) return Buffer.from(await res.arrayBuffer());
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new ImageOptimizerError(413, "Remote image is too large");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  static async #isAnimated(buffer: Buffer, contentType: string): Promise<boolean> {
    if (
      contentType !== ImageOptimizer.#gif &&
      contentType !== ImageOptimizer.#webp &&
      contentType !== ImageOptimizer.#png
    )
      return false;
    try {
      const sharp = await loadSharp();
      const metadata = await sharp(buffer, { animated: true }).metadata();
      return Boolean(metadata.pages && metadata.pages > 1);
    } catch {
      return false;
    }
  }

  static #detectContentType(buffer: Buffer): string | null {
    if (buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ImageOptimizer.#jpeg;
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
      return ImageOptimizer.#png;
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return ImageOptimizer.#gif;
    if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP")
      return ImageOptimizer.#webp;
    if (buffer.toString("ascii", 4, 12).includes("ftypavif")) return ImageOptimizer.#avif;
    const prefix = buffer.toString("utf8", 0, Math.min(buffer.length, 256)).trimStart().toLowerCase();
    if (prefix.startsWith("<svg") || prefix.startsWith("<?xml")) return ImageOptimizer.#svg;
    return null;
  }

  static #getMaxAge(cacheControl: string | null | undefined): number {
    const match = cacheControl?.match(/\b(?:s-maxage|max-age)=(\d+)/i);
    return match ? Number.parseInt(match[1], 10) : 0;
  }

  static #getCacheKey(input: Record<string, string | number>) {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
  }

  static #hashBuffer(buffer: Buffer) {
    return `"${createHash("sha256").update(buffer).digest("base64url")}"`;
  }

  static #toArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  }

  static #getExtension(contentType: string) {
    switch (contentType) {
      case ImageOptimizer.#avif:
        return "avif";
      case ImageOptimizer.#webp:
        return "webp";
      case ImageOptimizer.#png:
        return "png";
      case ImageOptimizer.#gif:
        return "gif";
      case ImageOptimizer.#svg:
        return "svg";
    }
    return "jpg";
  }
}
