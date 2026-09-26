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

The `/_akan/image` endpoint that resizes, re-encodes and caches an image.

The candidate URLs on an `<img>`. The browser downloads only the one that fits.

How wide the image renders per viewport, e.g. `(min-width: 768px) 50vw, 100vw`.

Two candidates for one fixed width: a normal screen and a high-density one.

A candidate labelled with its pixel width. The browser picks one through `sizes`.

How long a downloaded remote image is reused before it is fetched again.

You pass

Good for

`width` only

A 1x/2x pair, each rounded up to an allowed width

A fixed-size box: avatar, thumbnail

`sizes`, with or without `width`

All 15 allowed widths as `w` candidates; `width` is ignored

A fluid box that follows the viewport

`src` with no `width`

The 8 `deviceSizes` as `w` candidates

A full-width image

a `data:` or `blob:` URL, an `.svg` path

None; the original `src` is used

Inline previews and icons

An image another service already optimized

The image to show. Its `imageSize` fills in `width` and `height` when you omit them.

A direct URL that wins over `file.url`. With neither, an empty `bg-muted` box renders and nothing is requested.

The rendered width in CSS pixels. It picks the 1x/2x candidates.

The rendered height in CSS pixels. It reserves space, so the layout does not jump.

Switches to the full `w` srcSet for a fluid element.

Encoding quality. Any value other than 75 must be listed in `qualities`.

Loads eagerly at high priority and preloads during SSR. `preload` does the same.

Skips the optimizer and renders the original `src`.

Alt text. Always pass a real one; the default tells a screen reader nothing.

Widths for viewport-wide images. Together with `imageSizes`, the only `w` values accepted.

Widths for fixed-size elements, joined with `deviceSizes`.

Output formats in preference order. The first one the request's `Accept` header allows wins.

Allowed `q` values. Anything else is a 400, even a valid integer from 1 to 100.

Allow-list for absolute URLs. Empty means no remote image is accepted at all.

Allow-list for root-relative URLs. The default admits all of `public/`.

Lets an SVG through the optimizer untouched. While off, an SVG input is a 400.

Seconds a remote image is reused at least. Also the floor of the response `max-age` in production.

Redirects followed for a remote image. Every hop must match `remotePatterns` too.

Timeout for each hop of the remote fetch, in milliseconds.

Largest remote body accepted. Anything bigger is a 413.

Encodes that run at once. `0` means half the CPUs the server sees, at least one.

Output

The default output. Works everywhere.

Dropped from `formats` on Linux; those callers get webp.

Input decoding

Read and resized on every platform.

Passed through untouched on Linux.

Input

Result

JPEG · PNG · static GIF

Resized, then converted to the first `formats` entry the browser accepts.

Resized, but kept in its own format.

Animated GIF · PNG · WebP

Passed through untouched, so the animation survives.

Passed through untouched.

AVIF · TIFF on Linux

Passed through untouched; there is no codec to read it.

A 400 unless `dangerouslyAllowSVG` is on; then it is served as-is.

Field

How it matches

Example

Exact: `http` or `https`

Glob; `*` also spans dots

Exact string; `""` means the default port

Glob; `*` is one segment, `**` any depth

Exact, including the leading `?`

Source

Original re-read

Server serves the edit

Remote, production build

Once the TTL runs out

After the TTL

Remote, `akan start`

On every request

Immediately

Local file in `public/`

On every request, compared by mtime and size

The original's path or URL, from the `url` parameter.

The `w` parameter, already rounded up to an allowed width.

The `q` parameter: 75 unless a component passes `quality`.

output format

The first `formats` entry the browser accepts, or the source's own format.

source tag

Upstream ETag (or a content hash) for a remote image; mtime and size for a local one.

Someone uploads a 4MB phone photo and it renders as a 96px avatar. The layout looks right, yet every visitor downloads four megabytes for one thumbnail.

The rest of this page is about not defeating that cache.

What you do

Words used on this page

Term

Use Image

Which srcSet you get

Config

Sizes, formats and quality

Allowed sources

Fetching remote images

Server load

Formats And The Platform

Codec

Available

Not available

What happens to each input

remotePatterns

Add each host you serve images from:

Remote Cache

Cache Hits

Each encoded file is stored under a key made of five parts. The more distinct widths and qualities your pages request, the more rarely reused files the cache splits into.

Key part

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

