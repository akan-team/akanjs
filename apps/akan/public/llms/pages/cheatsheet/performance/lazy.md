# Lazy Loading

- Source: /cheatsheet/performance/lazy
- Mirror: /llms/pages/cheatsheet/performance/lazy.md
- Section: cheatsheet
- Category: Performance
- Priority: P2

## Headings

- Lazy Loading (#overview)
- External Libraries (#external)
- Large Components (#internal)
- Server Adapters (#server)
- Server Render Or Client Only (#ssr)
- Tips (#tips)

## Content

Lazy Loading

Lazy loading keeps a heavy component out of the first download. Its code arrives only when the user actually reaches it, through `lazy()` from `akanjs/webkit`.

Words used on this page

Term

- chunk: A JavaScript file the bundler splits off, downloaded only when something asks for it.

- Suspense boundary: A React boundary that shows a placeholder while something inside it is still loading.

- shell: The first HTML the server sends; content inside a boundary may stream in after it.

What to split

Component

lazy()

import

- Split it off

  - Maps · charts · editors · 3D viewers · wallet widgets: Heavy code, and often browser-only.

  - Large admin panels opened now and then: Most visits never open it, so most visits never pay for it.

- Import it directly

  - Tiny buttons: Too small to be worth a separate download.

  - Above-the-fold content: Users need it right away, so deferring it only makes them wait.

Load it this way

Not this way

lazy() options

`lazy(loader, option?)` takes a function that returns `import(…)` and gives back a component you render like any other.

- ssr (boolean, default true): `false` skips server rendering: the server sends `loading`, and the chunk loads after mount.

- suspense (boolean, default false): Gives the component its own Suspense boundary, so only this spot waits for the chunk.

- loading (() => ReactNode): The placeholder, shown only with `ssr: false` or `suspense: true`.

External Libraries

Some libraries are large, or touch browser-only APIs such as `window` the moment they load. Load them through a pair of files in `ui/<Folder>/`, and turn server rendering off with `ssr: false` when they need the browser.

`index_.tsx` starts with `"use client"` and exports the `lazy()` component.

`index.tsx` has no `"use client"`. It imports from `./index_`, and the rest of the app imports it.

First, the client file that loads the library:

Then the server-safe component that pages import:

**Why two files.** A namespace exported from a `"use client"` file reaches the server as one stub, so `X.Member` reads `undefined`. Build namespaces and wrappers in `index.tsx`; merging the pair breaks RSC.

**`lazy()` renders the module's `default`.** That is why `lazy()` targets use `export default`. For a named export, resolve the loader to it: `import("./X").then((m) => m.X)`.

**Set the library up in your own file.** When it needs setup such as plugin registration, write a sibling file with `export default` and lazy-load that, as `libs/util/ui/Chart` does.

**Pages never import the package.** Pages and module files may not import a third-party package, so it enters only through this `ui/` folder.

Large Components

Your own components split the same way. It pays off most for a heavy editor or dashboard that opens only after a click.

Give anything that mounts after the page is painted its own boundary with `suspense: true`:

Render it only when it is needed. The chunk downloads the first time `open` turns true:

**Without `suspense: true`, the whole page flashes.** The wait climbs to the nearest boundary, usually the route, and the page repaints as its loading screen on the first open.

**Leave `suspense: true` off page bodies.** With streaming SSR, what sits inside the boundary leaves the shell and arrives later. SEO snapshots, prerendering and pre-hydration E2E read only the shell, so they would miss it.

**`akanjs/ui` does the same.** Every `Model.*` modal and wrapper is a `lazy()` export with `suspense: true`.

**`loading` alone shows nothing.** Without `suspense: true` or `ssr: false` the component has no boundary of its own, so the placeholder you passed is never rendered.

Server Adapters

The same idea applies on the server, where the cost is memory instead of bundle size. A heavy SDK imported at module scope stays resident in every replica and every batch worker, even when the app never configures it.

Why one import costs so much

**The barrel loads everything.** The generated `srvkit/index.ts` re-exports every adapter, so importing one helper evaluates every SDK the folder imports.

**Gating construction is not enough.** `options.discord ? new DiscordApi(...) : null` skips the object, but the import at the top of the file has already run.

What to defer

Measured in this workspace with each SDK imported eagerly, the first four below cost about 61 MiB before a single request arrives.

Package

import()

- Defer: heavy, and an app may never configure it

  - discord.js: Sends Discord messages, about 23 MiB.

  - puppeteer: A headless browser for PDF output, about 19 MiB.

  - nodemailer: Sends mail, about 16 MiB.

  - firebase-admin: Push notifications, about 2 MiB.

  - An image encoder: Heavy, and only the apps that process images need it.

- Keep eager: every request uses it

  - jwt · aes: Deferring only moves the load to the first request.

Import it this way

How to defer it

**Keep types as `import type`.** It is erased at build, so signatures stay as they are.

**Hold the value import in a module-level promise** memoized with `??=`.

**Reach the SDK inside an async method**, so the first call is what loads it.

In an `adapt()` class it looks like this:

**Nothing loads until the first call.** A process that never sends a message never loads `discord.js`.

**Concurrent callers share one load.** `??=` keeps the first promise, so two `send()` calls neither import twice nor log in twice.

Measure it

Check what a process actually pays before and after the change with these env vars.

- AKAN_MEMORY_LOG ("1"): Logs each server process's resident memory (RSS) on an interval.

- AKAN_MEMORY_LOG_INTERVAL_MS (number, default 60000): How often the report is written, in milliseconds.

Server Render Or Client Only

The three settings differ in whether the server renders the component and whether the placeholder shows. Pick by what the component needs.

Setting

Server render

Shows loading

- Rendered on the server

  - lazy(loader): The default, for a component that can render on the server.

  - { suspense: true }: Use it for what mounts after a click: a modal body, an editor, a dropdown.

- Rendered in the browser only

  - { ssr: false }: Use it when the library needs `window`, `document`, canvas, WebGL or browser storage.

Yes

No

**Default: the nearest boundary waits.** It has no boundary of its own, so the one above it waits for the chunk (the route, if nothing is closer) and `loading` never shows.

**`suspense: true`: only this spot waits.** On the server, its content streams in after the shell.

**`ssr: false`: the server sends only `loading`.** It stays until mount and while the chunk downloads. This setting always has its own Suspense, so adding `suspense: true` changes nothing.

**Give a placeholder when a blank gap would confuse.** Size it like the real thing (`h-64 w-full`) so the page does not jump when the component arrives.

Tips

**Split by user intent.** An editor, a map, a chart, a modal and a viewer are good units.

**Do not lazy-load the first thing users need to see.** It only adds a wait before it appears.

**Shared, always-used components gain nothing.** If many pages render the same component right away, lazy may only add delay.

Read next

- lazy() reference — The `lazy` entry in the `akanjs/webkit` reference.

- ClientSide — A Suspense boundary you place yourself around several lazy parts.

- Splitting one screen — Where the `index_.tsx` pair fits among the other SSR techniques.

- Memory logs — Reading `AKAN_MEMORY_LOG` output over time.

## Code Examples

### apps/koyo/ui/ArticleMap/index_.tsx

```ts
"use client";
import { lazy } from "akanjs/webkit";

export const MapWidget = lazy(() => import("heavy-map-widget"), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full animate-pulse rounded-box bg-muted" />
  ),
});
```

### apps/koyo/ui/ArticleMap/index.tsx

```ts
import { MapWidget } from "./index_";

interface ArticleMapProps {
  center: { lat: number; lng: number };
}
export const ArticleMap = ({ center }: ArticleMapProps) => {
  return <MapWidget center={center} />;
};
```

### apps/koyo/ui/ArticleEditor/index_.tsx

```ts
"use client";
import { lazy } from "akanjs/webkit";

export const ArticleEditor = lazy(() => import("./Editor"), {
  suspense: true,
  loading: () => (
    <div className="h-64 w-full animate-pulse rounded-box bg-muted" />
  ),
});
```

### apps/koyo/ui/ArticleEditor/index.tsx

```ts
import { ArticleEditor } from "./index_";

interface EditPanelProps {
  open: boolean;
}
export const EditPanel = ({ open }: EditPanelProps) => {
  return open ? <ArticleEditor /> : null;
};
```

### apps/koyo/srvkit/discordApi.ts

```ts
import { adapt } from "akanjs/service";
import type * as discord from "discord.js";

let discordLoad: Promise<typeof import("discord.js")> | null = null;
const loadDiscord = () => {
  discordLoad ??= import("discord.js");
  return discordLoad;
};

export class DiscordApi extends adapt("discordApi" as const, ({ env }) => ({
  token: env(() => process.env.DISCORD_TOKEN ?? ""),
})) {
  #clientLoad: Promise<discord.Client> | null = null;

  async #connect() {
    const { Client, GatewayIntentBits } = await loadDiscord();
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(this.token);
    return client;
  }

  #getClient() {
    this.#clientLoad ??= this.#connect();
    return this.#clientLoad;
  }

  async send(channelId: string, content: string) {
    const client = await this.#getClient();
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) return null;
    return await channel.send(content);
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

