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
- SSR Or Client Only (#ssr)
- Tips (#tips)

## Content

Lazy Loading

Lazy loading means the first page does not download every heavy component right away. Load expensive UI only when the user reaches it.

Good for maps, charts, editors, 3D viewers, and wallet widgets.

Good for large admin panels that are not always opened.

Not useful for tiny buttons or above-the-fold content.

External Libraries

Some libraries are large or depend on browser-only APIs such as `window`. Wrap them with `lazy` and disable SSR when needed.

Map widget

Large Components

You can also split your own components. This is useful when a page has a heavy editor or dashboard that opens only after a click.

Lazy editor

Server Adapters

The same idea applies on the server, where the cost is memory instead of bundle size. A `srvkit` barrel re-exports every adapter, so importing one helper loads every SDK the folder touches — and each one stays resident in every replica and every batch worker.

Measured in this workspace: puppeteer 19MB, discord.js 23MB, nodemailer 16MB, firebase-admin 2MB — about 61MB resident before a single request arrives.

Gating construction is not enough. `options.discord ? new DiscordApi(...) : null` still runs the import at module scope.

Worth it for a heavy SDK an app may never configure: mail, push, Discord, a headless browser, an image encoder.

Not worth it for small pure helpers such as jwt or aes — they cost nothing and are used on every request.

Memoized module import

Check what a process actually pays with `AKAN_MEMORY_LOG=1`, which reports RSS per replica on an interval.

SSR Or Client Only

Use default lazy when the component can render on the server.

Use `{ ssr: false }` when the library needs `window`, `document`, canvas, WebGL, or browser storage.

Always give a loading fallback when the blank space would be confusing.

Tips

Split by user intent: editor, map, chart, modal, viewer.

Do not lazy-load the first thing users need to see.

If many pages use the same component immediately, lazy may only add delay.

## Code Examples

### Code

```ts
"use client";
import { lazy } from "akanjs/webkit";

const MapWidget = lazy(() => import("heavy-map-widget"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-box bg-muted" />,
});

interface ArticleMapProps {
  center: Point;
}
export const ArticleMap = ({ center }: ArticleMapProps) => {
  return <MapWidget center={center} />;
};
```

### Code

```ts
import { lazy } from "akanjs/webkit";

const ArticleEditor = lazy(() => import("./ArticleEditor"), {
  loading: () => <div>Loading editor...</div>,
});

interface EditPanelProps {
  open: boolean;
}
export const EditPanel = ({ open }: EditPanelProps) => {
  if (!open) return null;
  return <ArticleEditor />;
};
```

### Code

```ts
import { adapt } from "akanjs/service";

// Memoized at module scope, resolved on first use: the SDK is absent from a process that never sends a message.
let discordLoad: Promise<typeof import("discord.js")> | null = null;
const loadDiscord = () => {
  discordLoad ??= import("discord.js");
  return discordLoad;
};

export class DiscordApi extends adapt("discordApi" as const, ({ env }) => ({
  token: env(() => process.env.DISCORD_TOKEN ?? ""),
})) {
  #client: import("discord.js").Client | null = null;

  async #getClient() {
    if (this.#client) return this.#client;
    const { Client, GatewayIntentBits } = await loadDiscord();
    this.#client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await this.#client.login(this.token);
    return this.#client;
  }

  async send(channelId: string, content: string) {
    const client = await this.#getClient();
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return null;
    return await channel.send(content);
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

