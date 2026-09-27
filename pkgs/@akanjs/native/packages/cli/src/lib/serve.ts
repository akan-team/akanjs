// Static server for `akan-native run web`, following the host routing rules (lib/routes.ts).

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { routeRequest } from "./routes.ts";

export interface ServeOptions {
  dir: string;
  port: number;
  hostname?: string;
  /** Replaces the built __akan_native/init.js (runtime env overrides). */
  initScript?: () => string;
  /** akan-native dev: serve a reload channel and append its client to init.js. */
  liveReload?: LiveReload;
}

/** Server-sent events that tell open pages to reload (akan-native dev web). */
export class LiveReload {
  private clients = new Set<ReadableStreamDefaultController<string>>();

  response(): Response {
    let self: ReadableStreamDefaultController<string>;
    const stream = new ReadableStream<string>({
      start: (controller) => {
        self = controller;
        this.clients.add(controller);
        controller.enqueue(": connected\n\n");
      },
      cancel: () => {
        this.clients.delete(self);
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
  }

  reload(): void {
    for (const client of this.clients) {
      try {
        client.enqueue("data: reload\n\n");
      } catch {
        this.clients.delete(client);
      }
    }
  }

  static readonly CLIENT =
    ";(function(){try{var s=new EventSource('/__akan_native/dev/events');s.onmessage=function(){location.reload()}}catch(e){}})();\n";
}

export function serveApp({ dir, port, hostname = "localhost", initScript, liveReload }: ServeOptions) {
  const exists = (rel: string) => {
    const path = join(dir, rel);
    return existsSync(path) && statSync(path).isFile();
  };
  const noCache = { "cache-control": "no-cache" };

  return Bun.serve({
    port,
    hostname,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
      // Dev only, outside the host contract (§5): the live reload channel.
      if (liveReload && url.pathname === "/__akan_native/dev/events") return liveReload.response();
      const route = routeRequest(url.pathname, exists);
      switch (route.kind) {
        case "init": {
          const base = initScript ? initScript() : readFileSync(join(dir, "__akan_native", "init.js"), "utf8");
          return new Response(liveReload ? base + LiveReload.CLIENT : base, {
            headers: { ...noCache, "content-type": "text/javascript; charset=utf-8" },
          });
        }
        case "asset": {
          const file = Bun.file(join(dir, route.path));
          return new Response(file, { headers: route.path === "index.html" ? noCache : {} });
        }
        default:
          // The web platform has no bridge and no host files.
          return new Response("not found", { status: 404 });
      }
    },
  });
}
