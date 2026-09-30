# Assets (public/ private/)

- Source: /conventions/applib/asset
- Mirror: /llms/pages/conventions/applib/asset.md
- Section: conventions
- Category: App & Library
- Priority: P1

## Headings

- Asset Folders (#asset-overview)
- Public Assets (#public-assets)
- Optimized Images (#optimized-images)
- Private Assets (#private-assets)
- Library Assets (#library-asset-sync)
- Which Folder? (#practical-rules)

## Content

Assets (public/ private/)

Asset Folders

Apps and libraries keep file assets in two folders at their root, beside `lib/` and `ui/`. Which one a file goes in depends on one question: may the browser download it?

- public/ — The browser may download it — Served as static files by URL. Images, PDFs, downloadable JSON and icons go here. — `public/images/hero.png → /images/hero.png`

- private/ — Only the server reads it — Never served. Seed data, private JSON, model files and resources for server jobs go here. A desktop app that carries its server ships the folder in plain text on the user's computer. — `private/model/yolo.onnx`

**No wrapping folder.** There is no `asset/` folder; `public/` and `private/` sit directly at the root.

**Libraries have the same pair.** Every app that depends on the library can use them, as the Library Assets section shows.

Public Assets

The server serves every file under `public/` as a static file. Its URL is the file path with `apps/myapp/public` dropped:

File

- /docs/product-guide.pdf: `apps/myapp/public/docs/product-guide.pdf`

- /data/sample-products.json: `apps/myapp/public/data/sample-products.json`

- /images/hero.png: `apps/myapp/public/images/hero.png`

**No locale in the URL.** Pages live under `/ko/…` and `/en/…`, but public files do not: `/ko/images/hero.png` is a 404.

**Link to a file with a plain `<a>`.** `Link` from `akanjs/ui` adds the locale and navigates as a page, so it misses the file.

**Cached for 5 minutes in production.** A replaced file can show its old version for that long, while dev never caches.

Link to a PDF with a plain `<a>`:

Load a JSON file in the browser from its URL:

**Call `window.fetch`.** The `fetch` you import from `@apps/myapp/client` is Akan's API client, not the browser's.

**Browser only.** A relative URL has no origin on the server, which is why the code lives in `webkit/`. Server code reads files from disk, as Private Assets shows.

Optimized Images

Draw UI images from `public/` with `Image` from `akanjs/ui` instead of a bare `<img>`. Like Next.js image optimization, the server sends a smaller, lighter version of the file:

**Resized and cached.** Each image is served at the width it is drawn, as WebP when the browser accepts it. SVG files are sent unchanged.

**Give `width` and `height`.** They choose the size the server sends and reserve the space before the image loads.

**`priority` only for the first screen.** It preloads the image and loads it right away; every other image loads lazily.

**The rest is config.** A remote host needs `images.remotePatterns`, and a `quality` other than 75 needs `images.qualities` in `akan.config.ts`.

Image Optimization

srcSet, formats, caching and every prop, step by step.

images in akan.config.ts

Widths, formats, qualities and the remote hosts the optimizer may fetch.

Private Assets

Files under `private/` are never served, so no URL reaches them. Server code reads them from disk to load data, run inference or start a service. They are not secret from whoever holds the server's files, though: a desktop app that carries the server (`native.desktop.server`) holds them in plain text, so keep keys and license files that must stay yours out of such an app.

Used for

- apps/myapp/private/seed/products.json — Seed data the server loads.

- apps/myapp/private/model/yolo.onnx — Model weights for server-side inference.

- libs/shared/private/recommendation/default-rules.json — A library's internal rules, covered under Library Assets below.

Read from the app folder

Build the path from `AKAN_APP_DIR`, the app's own folder, with one small helper in `srvkit/`:

**`AKAN_APP_DIR` is the app folder everywhere.** It is `apps/myapp` under `akan start` and `dist/apps/myapp` in a build, and the server sets it before any app module loads, a desktop app's included. A script run outside the server has none, which is why the helper falls back to the folder of `Bun.main`.

**It lives in `srvkit/`.** Code that touches `Bun` or `process.env` belongs there, never in a page or a client file.

**Never read `./private/…` directly.** A relative path follows the working directory, which is the workspace root under `akan start`. The same line finds the file in a build and misses it in dev.

Load data and models

Read a JSON file with the helper:

A model file is loaded once, when the server starts, inside an `adapt()` class:

**`onInit` runs once per process.** The weights are read at boot, not on every request.

**Inject it with `plug(YoloDetector)`.** `loadYoloModel` and `YoloModel` stand for your ONNX runtime's loader.

Library Assets

A library keeps assets in its own `public/` and `private/`. Every app that depends on it gets both under `libs/<lib>/`, public ones as URLs and private ones for server code only:

Where

Path

- Library's public/: `libs/shared/public/banner/logo.png`

- Inside the app: `apps/myapp/public/libs/shared/banner/logo.png`

- Browser URL: `/libs/shared/banner/logo.png`

- Library's private/: `libs/shared/private/recommendation/default-rules.json`

- Inside the app: `apps/myapp/private/libs/shared/recommendation/default-rules.json`

- Server code reads: `privateFile("libs/shared/recommendation/default-rules.json")`

**`public/libs` and `private/libs` are generated.** `akan sync` rebuilds them and git ignores them, so never put your own files there.

**A desktop app that carries its server carries these files too.** Any app that depends on the library may turn on `native.desktop.server`, and then its users can read the library's `private/` in plain text, so keep keys and license files that must stay yours out of it.

**Library server code reads through the app too.** It runs inside the app, and the library's source folder is not in a build.

Draw a library image by its `/libs/…` URL:

Read a library's private file through `private/libs/<lib>`:

Which Folder?

Ask whether anyone on the internet may download the file. Yes means `public/`, no means `private/`.

Example file

public/

private/

- Anyone may download it

  - images/hero.png: UI images and icons, drawn with `Image` from `akanjs/ui`.

  - docs/product-guide.pdf: PDFs and other files a user downloads.

  - data/sample-products.json: JSON the browser loads by URL.

- Only the server may read it

  - seed/products.json: Internal data such as seed records.

  - model/yolo.onnx: Model weights.

  - recommendation/default-rules.json: Server-only configuration and rules.

Goes here

Not here

**When unsure, use `private/`.** A public file needs no sign-in: anyone who knows the URL can download it.

**UI images go through `Image`.** Use `Image` from `akanjs/ui` so the server optimizes them.

**Share through a library.** When several apps need the same file, put it in the library's own `public/` or `private/` instead of copying it into each app.

What a build ships

`akan build` copies both folders into `dist`. Only that copy is trimmed; your source folders keep every file.

Folder

In the build

- `private/` — Copied into every build.

- `public/` — Copied when the app serves pages; an API-only build (`web: false`) leaves it out.

- Fonts in `public/` — Unreferenced fonts are dropped by `assets.pruneFonts`; list any to keep in `assets.keepFonts`.

## Code Examples

### apps/myapp/ui/ProductGuideLink.tsx

```ts
import { usePage } from "@apps/myapp/client";

interface ProductGuideLinkProps {
  className?: string;
}
export const ProductGuideLink = ({ className }: ProductGuideLinkProps) => {
  const { l } = usePage();
  return (
    <a
      className={className}
      href="/docs/product-guide.pdf"
      target="_blank"
      rel="noreferrer"
    >
      {l.trans({ en: "Open product guide", ko: "제품 가이드 열기" })}
    </a>
  );
};
```

### apps/myapp/webkit/useSampleProducts.tsx

```ts
export const useSampleProducts = () => {
  const load = async () => {
    const res = await window.fetch("/data/sample-products.json");
    return await res.json();
  };
  return { load };
};
```

### apps/myapp/ui/HeroImage.tsx

```ts
import { usePage } from "@apps/myapp/client";
import { Image } from "akanjs/ui";

interface HeroImageProps {
  className?: string;
}
export const HeroImage = ({ className }: HeroImageProps) => {
  const { l } = usePage();
  return (
    <Image
      className={className}
      src="/images/hero.png"
      alt={l.trans({ en: "Product hero", ko: "제품 대표 이미지" })}
      width={1200}
      height={640}
      priority
    />
  );
};
```

### apps/myapp/srvkit/privateFile.ts

```ts
import path from "node:path";

export const privateFile = (relativePath: string) => {
  const appDir = process.env.AKAN_APP_DIR ?? path.dirname(Bun.main);
  return Bun.file(path.join(appDir, "private", relativePath));
};
```

### apps/myapp/srvkit/seedProducts.ts

```ts
import { privateFile } from "./privateFile";

export const loadInitialProducts = async () => {
  return await privateFile("seed/products.json").json();
};
```

### apps/myapp/srvkit/yoloDetector.ts

```ts
import { adapt } from "akanjs/service";
import { privateFile } from "./privateFile";

export class YoloDetector extends adapt("yoloDetector" as const, () => ({})) {
  #model: YoloModel | null = null;

  override async onInit() {
    this.#model = await loadYoloModel(privateFile("model/yolo.onnx"));
  }

  async detect(image: ArrayBuffer) {
    return this.#model?.detect(image) ?? [];
  }
}
```

### apps/myapp/ui/SharedLogo.tsx

```ts
import { usePage } from "@apps/myapp/client";
import { Image } from "akanjs/ui";

interface SharedLogoProps {
  className?: string;
}
export const SharedLogo = ({ className }: SharedLogoProps) => {
  const { l } = usePage();
  return (
    <Image
      className={className}
      src="/libs/shared/banner/logo.png"
      alt={l.trans({ en: "Shared logo", ko: "공용 로고" })}
      width={240}
      height={80}
    />
  );
};
```

### apps/myapp/srvkit/defaultRules.ts

```ts
import { privateFile } from "./privateFile";

export const loadDefaultRules = async () => {
  const file = privateFile("libs/shared/recommendation/default-rules.json");
  return await file.json();
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

