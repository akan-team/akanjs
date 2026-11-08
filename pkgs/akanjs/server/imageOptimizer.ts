import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import fs from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { Logger, TrustedProxy } from "akanjs/common";
import { isAnimatedImage } from "./animatedImage";
import { matchesIfNoneMatch } from "./contentEncoding";
import { ImageOptimizerError } from "./imageOptimizerError";
import { Semaphore } from "./semaphore";
import { resolveStaticPath } from "./staticPath";
import {
  type AkanImageConfig,
  type AkanImageFormat,
  type AkanImagePattern,
  getAkanImageWidths,
  mergeAkanImageConfig,
  type ResolvedAkanImageConfig,
} from "./types";

export interface ImageOptimizerOptions {
  publicDir: string;
  cacheDir: string;
  prodMode: boolean;
  config?: Partial<AkanImageConfig>;
  resolveHost?: (hostname: string) => Promise<{ address: string }[]>;
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
  cacheFile: string | null;
}

interface RemoteCachePointer {
  file: string;
  contentType: string;
  maxAge: number;
  expireAt: number;
}

export class ImageOptimizer {
  static readonly #optimizerPath = "/_akan/image";
  static readonly #svg = "image/svg+xml";
  static readonly #jpeg = "image/jpeg";
  static readonly #png = "image/png";
  static readonly #webp = "image/webp";
  static readonly #gif = "image/gif";
  static readonly #avif = "image/avif";
  static readonly #heic = "image/heic";
  static readonly #bypassTypes = new Set(["image/x-icon", "image/x-icns", "image/bmp", "image/jxl", "image/heic"]);
  static readonly #encodableTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

  #publicDir: string;
  #cacheDir: string;
  #prodMode: boolean;
  #config: ResolvedAkanImageConfig;
  #semaphore: Semaphore;
  readonly #resolveHost: (hostname: string) => Promise<{ address: string }[]>;
  readonly #encodeSlots: number;
  #encoding = 0;
  #cacheBytes: number | null = null;
  #pruning: Promise<void> | null = null;
  readonly #inflight = new Map<string, Promise<OptimizedImage>>();
  #logger = new Logger("ImageOptimizer");

  constructor({ publicDir, cacheDir, prodMode, config, resolveHost }: ImageOptimizerOptions) {
    this.#publicDir = publicDir;
    this.#cacheDir = cacheDir;
    this.#prodMode = prodMode;
    const merged = mergeAkanImageConfig(config);
    const formats = merged.formats.filter((format) => ImageOptimizer.#isCodecAvailable(format));
    if (formats.length !== merged.formats.length) {
      const dropped = merged.formats.filter((format) => !formats.includes(format));
      this.#logger.warn(`${dropped.join(", ")} needs an OS codec this platform does not have; serving webp instead`);
    }
    this.#config = { ...merged, formats: formats.length ? formats : ["image/webp"] };
    const concurrency = ImageOptimizer.#resolveConcurrency(this.#config.maxConcurrency);
    this.#semaphore = new Semaphore(concurrency);
    this.#encodeSlots = this.#config.maxQueue > 0 ? concurrency + this.#config.maxQueue : Number.POSITIVE_INFINITY;
    this.#resolveHost =
      resolveHost ??
      (async (hostname) =>
        await Promise.race([
          lookup(hostname, { all: true }),
          new Promise<never>((_resolve, reject) =>
            setTimeout(() => reject(new Error("DNS lookup timed out")), this.#config.fetchTimeoutMs).unref(),
          ),
        ]));
  }

  // Bun.Image shares the off-thread pool with fs and hashing, sized by visible CPUs (1 under a cpu limit): take half.
  static #resolveConcurrency(configured: number): number {
    return configured > 0 ? configured : Math.max(1, Math.floor(navigator.hardwareConcurrency / 2));
  }

  // AVIF/HEIC/TIFF need the OS codec of the `system` backend (macOS, Windows); Linux's `bun` backend throws on them.
  static #isCodecAvailable(contentType: string): boolean {
    if (contentType !== ImageOptimizer.#avif && contentType !== ImageOptimizer.#heic && contentType !== "image/tiff")
      return true;
    return Bun.Image.backend === "system";
  }

  async handle(req: Request): Promise<Response> {
    const parsed = this.#parseRequest(req);
    if ("error" in parsed) return new Response(parsed.error, { status: 400 });

    try {
      return this.#imageResponse(req, await this.#loadOptimizedImage(parsed));
    } catch (error) {
      const message = error instanceof ImageOptimizerError ? error.message : "Unable to optimize image";
      const status = error instanceof ImageOptimizerError ? error.status : 500;
      return new Response(message, { status, headers: status === 503 ? { "retry-after": "1" } : undefined });
    }
  }

  // A cold srcSet requests one width several times before its cache file exists: identical requests join one run.
  async #loadOptimizedImage(parsed: ParsedImageRequest): Promise<OptimizedImage> {
    const key = `${parsed.href}|${parsed.width}|${parsed.quality}|${parsed.outputType}`;
    const joined = this.#inflight.get(key);
    if (joined) return await joined;

    const pending = this.#optimizeRequest(parsed);
    this.#inflight.set(key, pending);
    try {
      return await pending;
    } finally {
      this.#inflight.delete(key);
    }
  }

  async #optimizeRequest(parsed: ParsedImageRequest): Promise<OptimizedImage> {
    const usePointer = parsed.isRemote && this.#prodMode;
    if (usePointer) {
      const fresh = await this.#readRemotePointer(parsed);
      if (fresh) return fresh;
    }
    const source = parsed.isRemote
      ? await this.#fetchRemoteImage(parsed.href)
      : await this.#readLocalImage(parsed.href);
    const optimized = await this.#getOptimizedImage(source, parsed);
    if (usePointer) await this.#writeRemotePointer(parsed, optimized);
    return optimized;
  }

  // Keyed by the request alone (the bytes are keyed by the source etag, which costs a re-download), so a warm remote
  // image skips the origin until its TTL. Dev skips it so an upstream edit shows up immediately.
  async #readRemotePointer(parsed: ParsedImageRequest): Promise<OptimizedImage | null> {
    let pointer: RemoteCachePointer;
    try {
      pointer = (await Bun.file(this.#getPointerPath(parsed)).json()) as RemoteCachePointer;
    } catch {
      return null;
    }
    if (!pointer.file || pointer.expireAt <= Date.now()) return null;
    const buffer = await ImageOptimizer.#readCached(pointer.file);
    if (!buffer) return null;
    return {
      buffer,
      contentType: pointer.contentType,
      etag: ImageOptimizer.#hashBuffer(buffer),
      maxAge: pointer.maxAge,
      cacheFile: pointer.file,
    };
  }

  async #writeRemotePointer(parsed: ParsedImageRequest, optimized: OptimizedImage) {
    if (!optimized.cacheFile) return;
    const pointer: RemoteCachePointer = {
      file: optimized.cacheFile,
      contentType: optimized.contentType,
      maxAge: optimized.maxAge,
      expireAt: Date.now() + optimized.maxAge * 1000,
    };
    await this.#writeCache(this.#getPointerPath(parsed), JSON.stringify(pointer));
  }

  #getPointerPath(parsed: ParsedImageRequest) {
    const key = ImageOptimizer.#getCacheKey({
      href: parsed.href,
      width: parsed.width,
      quality: parsed.quality,
      outputType: parsed.outputType,
    });
    return path.join(this.#cacheDir, `${key}.remote.json`);
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
      href = ImageOptimizer.#localHref(this.#config.localPatterns, url);
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

    const accept = req.headers.get("accept") ?? "";
    return {
      href,
      width,
      quality,
      outputType: this.#config.formats.find((format) => accept.includes(format)) ?? "",
      isRemote,
    };
  }

  async #readLocalImage(href: string): Promise<ImageSource> {
    const url = new URL(href, "http://local.akan");
    const filePath = resolveStaticPath(this.#publicDir, url.pathname);
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
      await this.#assertPublicHost(current);
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
        if (!res.ok) throw new ImageOptimizerError(502, "Remote image request failed");
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

  //? Security: a pattern judges the name, not its addresses; Bun's fetch cannot pin one, so rebinding is egress's job.
  async #assertPublicHost(url: URL) {
    if (this.#config.dangerouslyAllowLocalIP) return;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    let addresses: string[];
    if (isIP(host)) addresses = [host];
    else {
      try {
        addresses = (await this.#resolveHost(host)).map(({ address }) => address);
      } catch {
        throw new ImageOptimizerError(502, "Remote image request failed");
      }
    }
    if (!addresses.length || addresses.some((address) => TrustedProxy.isPrivateAddress(address)))
      throw new ImageOptimizerError(400, '"url" parameter is not allowed');
  }

  async #getOptimizedImage(source: ImageSource, params: ParsedImageRequest): Promise<OptimizedImage> {
    const inputType = ImageOptimizer.#detectContentType(source.buffer) || source.contentType;
    if (!inputType.startsWith("image/") || inputType.includes(",")) {
      throw new ImageOptimizerError(400, "The requested resource is not a valid image");
    }
    if (inputType === ImageOptimizer.#svg && !this.#config.dangerouslyAllowSVG) {
      throw new ImageOptimizerError(400, '"url" parameter is valid but image type is not allowed');
    }

    const maxAge = Math.max(this.#config.minimumCacheTTL, ImageOptimizer.#getMaxAge(source.cacheControl));
    const shouldBypass =
      inputType === ImageOptimizer.#svg ||
      ImageOptimizer.#bypassTypes.has(inputType) ||
      !ImageOptimizer.#isCodecAvailable(inputType) ||
      isAnimatedImage(source.buffer, inputType);
    const outputType =
      shouldBypass || !params.outputType || inputType === ImageOptimizer.#webp || inputType === ImageOptimizer.#avif
        ? inputType
        : params.outputType;
    const shouldEncode = !shouldBypass && ImageOptimizer.#encodableTypes.has(outputType);
    const cachePath = this.#getCachePath({
      href: params.href,
      width: params.width,
      quality: params.quality,
      outputType,
      upstreamTag: source.upstreamTag,
    });
    const cached = await ImageOptimizer.#readCached(cachePath);
    if (cached) {
      return {
        buffer: cached,
        contentType: outputType,
        etag: ImageOptimizer.#hashBuffer(cached),
        maxAge,
        cacheFile: cachePath,
      };
    }

    let buffer = source.buffer;
    let contentType = inputType;
    let cacheable = true;
    if (shouldEncode) {
      if (this.#encoding >= this.#encodeSlots) throw new ImageOptimizerError(503, "Image optimizer is busy");
      this.#encoding += 1;
      try {
        buffer = await this.#semaphore.run(() =>
          ImageOptimizer.#optimize(source.buffer, {
            width: params.width,
            quality: params.quality,
            contentType: outputType,
            maxPixels: this.#config.maxInputPixels,
          }),
        );
        contentType = outputType;
      } catch {
        buffer = source.buffer;
        contentType = inputType;
        cacheable = false;
      } finally {
        this.#encoding -= 1;
      }
    }

    if (cacheable) await this.#writeCache(cachePath, buffer);
    return {
      buffer,
      contentType,
      etag: ImageOptimizer.#hashBuffer(buffer),
      maxAge,
      cacheFile: cacheable ? cachePath : null,
    };
  }

  // A file the pruner removed between the check and the read is a miss, not a failed request.
  static async #readCached(cachePath: string): Promise<Buffer | null> {
    try {
      const file = Bun.file(cachePath);
      return (await file.exists()) ? Buffer.from(await file.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }

  async #writeCache(file: string, data: Buffer | string) {
    await fs.mkdir(this.#cacheDir, { recursive: true });
    this.#cacheBytes ??= (await this.#listCache()).reduce((total, entry) => total + entry.size, 0);
    await Bun.write(file, data);
    this.#cacheBytes += Buffer.byteLength(data);
    const ceiling = this.#config.maxCacheBytes;
    if (ceiling <= 0 || this.#cacheBytes <= ceiling) return;
    this.#pruning ??= this.#pruneCache(ceiling).finally(() => {
      this.#pruning = null;
    });
    await this.#pruning;
  }

  async #listCache(): Promise<{ file: string; size: number; mtimeMs: number }[]> {
    const names = await fs.readdir(this.#cacheDir).catch(() => [] as string[]);
    const entries = await Promise.all(
      names.map(async (name) => {
        const file = path.join(this.#cacheDir, name);
        const stat = await fs.stat(file).catch(() => null);
        return stat?.isFile() ? { file, size: stat.size, mtimeMs: stat.mtimeMs } : null;
      }),
    );
    return entries.filter((entry) => entry !== null);
  }

  //? Oldest written first, down to 80% so the next write does not prune again; a read does not refresh an entry.
  async #pruneCache(ceiling: number) {
    const entries = (await this.#listCache()).sort((a, b) => a.mtimeMs - b.mtimeMs);
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries) {
      if (total <= ceiling * 0.8) break;
      await fs.rm(entry.file, { force: true });
      total -= entry.size;
    }
    this.#cacheBytes = total;
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
    if (matchesIfNoneMatch(req.headers.get("if-none-match"), image.etag))
      return new Response(null, { status: 304, headers });
    return new Response(ImageOptimizer.#toArrayBuffer(image.buffer), { headers });
  }

  static async #optimize(
    buffer: Buffer,
    options: { width: number; quality: number; contentType: string; maxPixels: number },
  ): Promise<Buffer> {
    const image = new Bun.Image(buffer, { maxPixels: options.maxPixels }).resize(options.width, undefined, {
      withoutEnlargement: true,
    });

    if (options.contentType === ImageOptimizer.#avif) return await image.avif({ quality: options.quality }).toBuffer();
    if (options.contentType === ImageOptimizer.#webp) return await image.webp({ quality: options.quality }).toBuffer();
    // Bun's PNG encoder takes no quality — it is lossless unless you opt into palette quantization.
    if (options.contentType === ImageOptimizer.#png) return await image.png().toBuffer();
    return await image.jpeg({ quality: options.quality }).toBuffer();
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

  //? The file is read by its path alone, so a query is part of the cache key only where a pattern names it.
  static #localHref(patterns: Pick<AkanImagePattern, "pathname" | "search">[], href: string): string {
    const url = new URL(href, "http://local.akan");
    const namesQuery = patterns.some(
      (pattern) =>
        pattern.search !== undefined &&
        pattern.search === url.search &&
        (!pattern.pathname || ImageOptimizer.#globMatch(pattern.pathname, url.pathname)),
    );
    return namesQuery ? `${url.pathname}${url.search}` : url.pathname;
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
