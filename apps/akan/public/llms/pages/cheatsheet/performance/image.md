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
- remotePatterns (#remote)
- Cache Hits (#cache-hit)

## Content

Image Optimization

Akan Image works like a small image optimizer. It creates optimized URLs with width and quality, serves WebP when possible, and caches the generated result.

Use `Image` for images shown in UI.

Configure allowed sizes and remote domains in `akan.config.ts`.

Keep size options small enough to improve cache hits.

Use Image

Pass a file-like object or a direct src. Width and height help Akan choose the nearest cached size.

Article cover

Config

The default config covers common responsive sizes. Change it only when your UI has clear image sizes that repeat often.

remotePatterns

Remote images are blocked unless their host and path match `remotePatterns`. If optimization returns a bad request, check this setting first.

Allow CDN images

Cache Hits

The optimizer cache key changes when URL, width, quality, or output format changes. Too many width or quality choices can split the cache into many rarely-used files.

Use a few repeated card sizes instead of many one-off widths.

Keep `qualities` small, often only `[75]`.

Use `unoptimized` for data URLs, SVGs, or images already optimized by another system.

## Code Examples

### Code

```ts
import { Image } from "akanjs/ui";
interface CoverProps {
  className?: string;
  article: Article;
}
export const Cover = ({ className, article }: CoverProps) => {
  return (
    <Image
      className={className}
      file={article.cover}
      width={640}
      height={360}
      sizes="(max-width: 768px) 100vw, 640px"
      alt={article.title}
      priority={article.isFeatured}
    />
  );
};
```

### akan.config.ts

```ts
export default {
  images: {
    deviceSizes: [640, 1080, 1920],
    imageSizes: [64, 128, 256],
    formats: ["image/webp"],
    qualities: [75],
    minimumCacheTTL: 14400,
  },
};
```

### Code

```ts
export default {
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
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

