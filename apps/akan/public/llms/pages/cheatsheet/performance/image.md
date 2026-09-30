# Image Optimization

- Source: /cheatsheet/performance/image
- Mirror: /llms/pages/cheatsheet/performance/image.md
- Section: cheatsheet
- Category: Performance
- Priority: P2

## Headings

- Image Optimization (#overview)
- Use Image (#usage)
- Config (#config)
- Formats And The Platform (#formats)
- remotePatterns (#remote)
- Remote Cache (#remote-cache)
- Cache Hits (#cache-hit)

## Content

Image Optimization

Someone uploads a 4MB phone photo and it renders as a 96px avatar. The layout looks right, yet every visitor downloads four megabytes for one thumbnail.

`Image` from `akanjs/ui` solves this in three steps:

**The component** writes an optimizer URL for each candidate, such as `/_akan/image?url=…&w=640&q=75`.

**The server** resizes and re-encodes the original once, then keeps the result on disk.

**The browser** picks the candidate from `srcSet` that fits the screen and downloads only that one.

The rest of this page is about not defeating that cache.

What you do

**Render with `Image`.** Use it for every image the UI shows.

**Allow remote hosts.** Remote images stay blocked until you list them in `images.remotePatterns` of `akan.config.ts`.

**Keep sizes few.** Reuse a handful of sizes so many elements share one cached file.

Words used on this page

Term

- optimizer: The `/_akan/image` endpoint that resizes, re-encodes and caches an image.

- srcSet: The candidate URLs on an `<img>`. The browser downloads only the one that fits.

- sizes: How wide the image renders per viewport, e.g. `(min-width: 768px) 50vw, 100vw`.

- 1x, 2x: Two candidates for one fixed width: a normal screen and a high-density one.

- 640w: A candidate labelled with its pixel width. The browser picks one through `sizes`.

- TTL: How long a downloaded remote image is reused before it is fetched again.

**None of this runs in the CSR bundle.** A mobile app or a prebuilt shell renders the raw `src`, because no Akan server sits in front of it to optimize.

Use Image

Pass a `file` (a `File` relation or any `{ url, imageSize }`) or a plain `src`, plus the width it renders at:

**Always pass the rendered width.** Without `width` it falls back to `file.imageSize`, the original's width, so a 4000px photo is fetched at 3840px.

**`priority` is for the first screen.** That image loads eagerly at high priority and is preloaded during SSR. Every other image loads lazily.

**A custom `quality` must be allowed.** Add the value to `qualities` in the config, or the optimizer answers 400.

Which srcSet you get

You pass

srcSet

Good for

- `width` only — A 1x/2x pair, each rounded up to an allowed width — A fixed-size box: avatar, thumbnail

- `sizes`, with or without `width` — All 15 allowed widths as `w` candidates; `width` is ignored — A fluid box that follows the viewport

- `src` with no `width` — The 8 `deviceSizes` as `w` candidates — A full-width image

- a `data:` or `blob:` URL, an `.svg` path — None; the original `src` is used — Inline previews and icons

- `unoptimized` — None; the original `src` is used — An image another service already optimized

**`sizes` wins over `width`.** Once it is present, the width no longer shapes the URLs, so give it only to a fluid element.

**`unoptimized` is not for SVGs.** `data:`, `blob:` and `.svg` sources skip the optimizer on their own. The flag is for images optimized elsewhere.

- file (File | { url, imageSize } | null): The image to show. Its `imageSize` fills in `width` and `height` when you omit them.

- src (string): A direct URL that wins over `file.url`. With neither, an empty `bg-muted` box renders and nothing is requested.

- width (number, default file.imageSize[0]): The rendered width in CSS pixels. It picks the 1x/2x candidates.

- height (number, default file.imageSize[1]): The rendered height in CSS pixels. It reserves space, so the layout does not jump.

- sizes (string): Switches to the full `w` srcSet for a fluid element.

- quality (number, default 75): Encoding quality. Any value other than 75 must be listed in `qualities`.

- priority (boolean, default false): Loads eagerly at high priority and preloads during SSR. `preload` does the same.

- unoptimized (boolean, default false): Skips the optimizer and renders the original `src`.

- alt (string, default "image"): Alt text. Always pass a real one; the default tells a screen reader nothing.

Config

Every optimizer setting lives under the `images` key of `akan.config.ts`. An array you write replaces its default outright: setting `deviceSizes` drops all eight defaults.

Sizes, formats and quality

- deviceSizes (number[], default [640, 750, 828, 1080, 1200, 1920, 2048, 3840]): Widths for viewport-wide images. Together with `imageSizes`, the only `w` values accepted.

- imageSizes (number[], default [32, 48, 64, 96, 128, 256, 384]): Widths for fixed-size elements, joined with `deviceSizes`.

- formats (("image/avif" | "image/webp")[], default ["image/webp"]): Output formats in preference order. The first one the request's `Accept` header allows wins.

- qualities (number[], default [75]): Allowed `q` values. Anything else is a 400, even a valid integer from 1 to 100.

**Widen `deviceSizes`, `imageSizes` and `qualities`; never narrow them.** `Image` does not read `akan.config.ts` and keeps the default lists as its own constants. A narrower config makes the server reject, with a 400, the `w` and `q` values the client still sends.

Allowed sources

- remotePatterns ({ protocol?, hostname?, port?, pathname?, search? }[], default []): Allow-list for absolute URLs. Empty means no remote image is accepted at all.

- localPatterns ({ pathname?, search? }[], default [{ pathname: "/**" }]): Allow-list for root-relative URLs. The default admits all of `public/`.

- dangerouslyAllowSVG (boolean, default false): Lets an SVG through the optimizer untouched. While off, an SVG input is a 400.

Fetching remote images

- minimumCacheTTL (number, default 14400): Seconds a remote image is reused at least. Also the floor of the response `max-age` in production.

- maximumRedirects (number, default 3): Redirects followed for a remote image. Every hop must match `remotePatterns` too.

- fetchTimeoutMs (number, default 7000): Timeout for each hop of the remote fetch, in milliseconds.

- maxRemoteBytes (number, default 26214400 (25MB)): Largest remote body accepted. Anything bigger is a 413.

Server load

- maxConcurrency (number, default 0): Encodes that run at once. `0` means half the CPUs the server sees, at least one.

Encoding shares one worker pool with file reads and hashing. Raise `maxConcurrency` and a burst of image requests slows down everything else the server does, which is why the default holds it to half.

Formats And The Platform

Encoding runs on `Bun.Image`, and its codecs depend on the server's OS. AVIF, HEIC and TIFF need an OS codec that only macOS and Windows have, so a Linux container never emits AVIF.

Codec

macOS · Windows

Linux

- Output

  - image/webp: The default output. Works everywhere.

  - image/avif: Dropped from `formats` on Linux; those callers get webp.

- Input decoding

  - JPEG · PNG · GIF · WebP: Read and resized on every platform.

  - AVIF · TIFF: Passed through untouched on Linux.

Available

Not available

What happens to each input

Input

Result

- JPEG · PNG · static GIF — Resized, then converted to the first `formats` entry the browser accepts.

- WebP · AVIF — Resized, but kept in its own format.

- Animated GIF · PNG · WebP — Passed through untouched, so the animation survives.

- `.ico` · `.icns` · `.bmp` · `.jxl` · `.heic` — Passed through untouched.

- AVIF · TIFF on Linux — Passed through untouched; there is no codec to read it.

- SVG — A 400 unless `dangerouslyAllowSVG` is on; then it is served as-is.

**Listing `["image/avif", "image/webp"]` is safe.** A Linux deployment serves webp to everyone, and a developer's Mac serves both for real.

**Order matters.** The first `formats` entry the browser's `Accept` header allows wins, so put `image/avif` first. A browser that accepts neither gets the source format back, resized.

**A failed encode still answers.** The original bytes are served and nothing is cached, so the next request tries again.

remotePatterns

A remote image is refused until its URL matches an entry in `remotePatterns`, and the default list is empty. When the optimizer answers 400 for a remote image, check this setting first.

Add each host you serve images from:

Field

How it matches

Example

- protocol — Exact: `http` or `https` — Example: `"https"`

- hostname — Glob; `*` also spans dots — Example: `"*.example.com"`

- port — Exact string; `""` means the default port — Example: `"8443"`

- pathname — Glob; `*` is one segment, `**` any depth — Example: `"/articles/**"`

- search — Exact, including the leading `?` — Example: `"?v=2"`

**An omitted field matches anything.** `{ hostname: "cdn.example.com" }` admits every path on that host, over http and https.

**`*` stops at `/`, `**` does not.** A hostname has no `/`, so `*.example.com` also matches `a.b.example.com`.

**`port` and `search` are exact.** A pattern can pin a non-standard port or one fixed query, but not a signature that changes per image.

**Redirects are checked too.** Every hop must match, so a CDN that redirects to an unlisted host is refused.

Remote Cache

A remote image is downloaded once, then served from disk until its TTL runs out, so a warm image never reaches its origin. The TTL is the upstream `max-age`, but never less than `minimumCacheTTL`.

Source

Original re-read

Server serves the edit

- Remote, production build — Once the TTL runs out — After the TTL

- Remote, `akan start` — On every request — Immediately

- Local file in `public/` — On every request, compared by mtime and size — Immediately

**An unchanged original is not re-encoded.** The encoded file is keyed by the upstream ETag, so re-reading the same image costs one download and no encode.

**Production means a built artifact run with `NODE_ENV=production`.** Under `akan start` the TTL is skipped, so an upstream edit shows up at once.

**The browser keeps its own copy.** A production response carries a `max-age` of at least `minimumCacheTTL`, so a visitor may see the old image until it expires.

**Each replica has its own cache.** It lives in the build artifact directory, so replicas fill it separately and every deploy starts cold.

Cache Hits

Each encoded file is stored under a key made of five parts. The more distinct widths and qualities your pages request, the more rarely reused files the cache splits into.

Key part

- url: The original's path or URL, from the `url` parameter.

- width: The `w` parameter, already rounded up to an allowed width.

- quality: The `q` parameter: 75 unless a component passes `quality`.

- output format: The first `formats` entry the browser accepts, or the source's own format.

- source tag: Upstream ETag (or a content hash) for a remote image; mtime and size for a local one.

**Reuse a few card sizes.** Many one-off widths spread across more allowed widths; a handful of repeated sizes lands on the same files.

**Keep `qualities` at `[75]`** unless one surface truly needs otherwise. Every extra value multiplies the files, and the client asks only for 75 unless a component passes `quality`.

## Code Examples

### apps/myapp/lib/article/Article.Unit.tsx

```ts
import type { cnst } from "@apps/myapp/client";
import { Image } from "akanjs/ui";

interface CoverProps {
  className?: string;
  article: cnst.LightArticle;
}
export const Cover = ({ className, article }: CoverProps) => {
  return (
    <Image
      className={className}
      file={article.cover}
      width={640}
      height={360}
      alt={article.title}
      priority={article.isFeatured}
    />
  );
};
```

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.example.com",
        pathname: "/articles/**",
      },
    ],
  },
};

export default config;
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

