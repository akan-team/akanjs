// `akan-native dev <platform> --hmr`: state-preserving HMR (React Fast Refresh) through Bun's dev server.
//
//   .akan/native/dev/server.ts   child `bun` process: Bun.serve({ routes: { "/": <web.devEntry> },
//                         development: { hmr: true } }) on 127.0.0.1:<A>. Bun bundles the source,
//                         embeds its own react-refresh runtime and pushes updates over /_bun/hmr.
//   gateway (this file)   127.0.0.1:<B>, the only port a host talks to:
//                           /_bun/hmr   WebSocket, proxied to A
//                           /_bun/*     HTTP, proxied to A (client bundle, assets, error reports)
//                           /__akan_native/*   web: init.js; native hosts answer these themselves
//                           public file <entry dir>/public, then web.dir
//                           else        the page: A's HTML + init.js tag + WebSocket shim + CSP
//   hosts                 dev builds with shell.json `devServer` fetch every path outside
//                         /__akan_native/* from B and keep their origin (app://localhost,
//                         https://app.localhost), so the bridge, ACL, storage and CSP behave as
//                         in a normal build. The web platform opens B directly.
//
// Bun's client opens `new URL("/_bun/hmr", location.origin)`: app:// is no WebSocket scheme and
// Android's wss://app.localhost is not served, so on native hosts a shim in the page points that
// socket at ws://localhost:<B> (verified reachable: WKWebView from app://, Android WebView from
// https://app.localhost through `adb reverse`; ws://10.0.2.2 is blocked there as insecure).
//
// External dev server (akanjs readiness O4-1, `upstream`): instead of Bun's dev server the gateway
// proxies another one (the akan dev server). Every path outside /__akan_native/* goes there, HTML answers
// get init.js, the shim and the policy, and the HMR socket path is the app's (`hmrPath`, e.g.
// /_akan/hmr). Only that path is redirected: other same-origin sockets fail as in a release build.
// Real iPhones (O4-3) reach the gateway on the Mac's LAN address (`publicHost`).

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Platform } from "../../../core/src/index.ts";
import { buildCsp, type CspConfig, hasCspMeta, injectCspMeta, parseCsp, serializeCsp } from "./csp.ts";
import { injectInitScript } from "./html.ts";
import { pipeLines } from "./launch.ts";
import { CliError } from "./log.ts";
import type { Project } from "./project.ts";
import { isHostPath, routeRequest } from "./routes.ts";

export const HMR_PATH = "/_bun/hmr";

// ------------------------------------------------------------------ pure parts (unit tested)

/** The app's source HTML for Bun's dev server: web.devEntry, else index.html in the app folder. */
export function resolveDevEntry(project: Project): string {
  const configured = project.config.web.devEntry;
  const path = resolve(project.appDir, configured ?? "index.html");
  if (existsSync(path) && statSync(path).isFile()) return path;
  if (configured) throw new CliError(`web.devEntry: ${path} not found`);
  throw new CliError(
    `--hmr needs the app's source HTML (the page whose <script type="module" src> starts the app), but ${path} does not exist. ` +
      `Set web.devEntry in akan-native.config.ts, e.g. web: { devEntry: "src/index.html" }.`,
  );
}

/**
 * Inline classic script in the dev page. It runs while the document is parsed, so before Bun's
 * client (a module script, deferred).
 * - Bun's error overlay host gets its style with setAttribute("style"), which a hash-based policy
 *   refuses (style-src-attr); the same text through CSSOM (style.cssText) is allowed. Only that
 *   element: the app's own style attributes meet the policy as in a build.
 * - `socket` (native hosts): WebSockets the page opens on its own origin to the HMR path (or one of
 *   `paths`, the app's own sockets relayed by the gateway) go to the gateway's origin instead, and
 *   `window.__AKAN_NATIVE_DEV__.gateway` tells the app its page came through the gateway.
 * - `socket.relayBodies` (Android): fetch and XMLHttpRequest calls on the page's origin with a method
 *   other than GET or HEAD go to the gateway's http origin instead. shouldInterceptRequest hands the
 *   shell no request body, so the host cannot carry them; http://localhost is a trustworthy origin
 *   there, so the call is not mixed content, and the dev server answers the app origin's CORS.
 */
export function devShim(socket?: { origin: string; path?: string; paths?: string[]; relayBodies?: boolean }): string {
  const overlay =
    "var A=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){" +
    'if(n==="style"&&this.localName==="bun-hmr"){this.style.cssText=v;return}return A.call(this,n,v)};';
  const redirect =
    socket === undefined
      ? ""
      : "var W=window.WebSocket,T=" +
        JSON.stringify(socket.origin) +
        ",P=" +
        JSON.stringify([socket.path ?? HMR_PATH, ...(socket.paths ?? [])]) +
        ";function S(u,p){try{var x=new URL(String(u),location.href);if(P.indexOf(x.pathname)>=0&&x.host===location.host)u=T+x.pathname+x.search}catch(e){}return p===undefined?new W(u):new W(u,p)}" +
        "S.prototype=W.prototype;S.CONNECTING=0;S.OPEN=1;S.CLOSING=2;S.CLOSED=3;window.WebSocket=S;";
  const gateway = socket?.origin.replace(/^ws/, "http");
  const marker = gateway === undefined ? "" : `window.__AKAN_NATIVE_DEV__={gateway:${JSON.stringify(gateway)}};`;
  const bodies = !socket?.relayBodies
    ? ""
    : "var G=" +
      JSON.stringify(gateway) +
      ';function R(u,m){try{var x=new URL(String(u),location.href);m=String(m||"GET").toUpperCase();' +
      'if(x.origin===location.origin&&m!=="GET"&&m!=="HEAD"&&x.pathname.indexOf("/__akan_native/")!==0)return G+x.pathname+x.search}catch(e){}return null}' +
      "var F=window.fetch;if(F)window.fetch=function(i,o){var q=window.Request&&i instanceof window.Request," +
      'r=R(q?i.url:i,(o&&o.method)||(q?i.method:"GET"));return r?F.call(this,q?new window.Request(r,i):r,o):F.apply(this,arguments)};' +
      "var X=window.XMLHttpRequest&&window.XMLHttpRequest.prototype,N=X&&X.open;" +
      "if(N)X.open=function(m,u){var r=R(u,m);if(r)arguments[1]=r;return N.apply(this,arguments)};";
  return `(function(){${overlay}${redirect}${marker}${bodies}})();`;
}

/**
 * What Bun's dev client needs on top of the app's policy: its updates run as blob: scripts, and
 * its socket goes to ws://localhost:<port> (neither is covered by 'self' from app://). A directive
 * that is absent and has no default-src is unrestricted and stays absent.
 */
export function devCspSources(policy: string, wsOrigin: string): string {
  const map = parseCsp(policy);
  const add = (directive: string, sources: string[]) => {
    let list = map.get(directive);
    if (!list) {
      const fallback = map.get("default-src");
      if (!fallback) return;
      list = [...fallback];
      map.set(directive, list);
    }
    if (list.includes("'none'")) list.splice(list.indexOf("'none'"), 1);
    for (const source of sources) if (!list.includes(source)) list.push(source);
  };
  add("script-src", ["blob:"]);
  if (map.has("script-src-elem")) add("script-src-elem", ["blob:"]);
  const local = /^ws:\/\/localhost:(\d+)$/.exec(wsOrigin);
  const origins = local ? [wsOrigin, `ws://127.0.0.1:${local[1]}`] : [wsOrigin];
  //? The same origins over http: Android sends the page's calls that carry a body there (devShim relayBodies).
  add("connect-src", [...origins, ...origins.map((origin) => origin.replace(/^ws/, "http"))]);
  return serializeCsp(map);
}

export interface DevHtmlOptions {
  platform: Platform;
  /** The gateway's port. */
  port: number;
  /** Where the page's HMR socket goes (native hosts). Default ws://localhost:<port>. */
  wsOrigin?: string;
  /** The HMR socket path the page opens. Default Bun's /_bun/hmr. */
  hmrPath?: string;
  /** The app's own socket paths the gateway relays too (W4). */
  wsPaths?: string[];
  /** security.csp; the policy is built from the rewritten page, as `akan-native build` does (SEC-4). */
  csp?: CspConfig;
}

/**
 * Bun's page → the page a host serves: the init.js tag first in <head> (IN-3), the dev shim right
 * before Bun's client script, then the CSP <meta> with the hashes of the final inline scripts
 * (Bun's own and the shim included) plus devCspSources.
 */
export function rewriteDevHtml(html: string, opts: DevHtmlOptions): { html: string; warnings: string[] } {
  const warnings: string[] = [];
  let out = injectInitScript(html, "/");
  // The web page is on the gateway itself: Bun's client finds its socket without help.
  const socket =
    opts.platform === "web"
      ? undefined
      : {
          origin: opts.wsOrigin ?? `ws://localhost:${opts.port}`,
          path: opts.hmrPath ?? HMR_PATH,
          paths: opts.wsPaths ?? [],
          relayBodies: opts.platform === "android",
        };
  const tag = `<script>${devShim(socket)}</script>`;
  // Before Bun's client, else before the page's first script after init.js (an app's module script
  // may open its socket at once), else at the end of <head>.
  const client = /<script\b[^>]*\bdata-bun-dev-server-script\b/i.exec(out);
  const initEnd = out.indexOf('__akan_native/init.js"></script>');
  const afterInit = initEnd >= 0 ? initEnd + '__akan_native/init.js"></script>'.length : 0;
  const nextScript = /<script\b/i.exec(out.slice(afterInit));
  const headEnd = /<\/head\s*>/i.exec(out);
  const at = client
    ? client.index
    : nextScript
      ? afterInit + nextScript.index
      : headEnd
        ? headEnd.index
        : out.indexOf("</script>") + "</script>".length;
  out = out.slice(0, at) + tag + out.slice(at);
  if (opts.csp !== undefined) {
    const built = buildCsp(opts.csp, out);
    warnings.push(...built.warnings);
    out = injectCspMeta(out, devCspSources(built.policy, socket?.origin ?? `ws://localhost:${opts.port}`));
  } else if (hasCspMeta(out)) {
    warnings.push(
      `the dev entry has its own Content-Security-Policy <meta>; HMR needs script-src blob: and connect-src ${socket?.origin ?? `ws://localhost:${opts.port}`} (or use security.csp, which akan-native extends in dev)`,
    );
  }
  return { html: out, warnings };
}

export type DevRoute =
  | { kind: "hmr" }
  | { kind: "bun" }
  | { kind: "init" }
  | { kind: "page" }
  /** Absolute path of a public file. */
  | { kind: "file"; path: string }
  | { kind: "not-found" };

/**
 * The gateway's decision for a path, on top of the host routing rules (lib/routes.ts): Bun's own
 * paths go to Bun, index.html and SPA routes are the rewritten page, public files come from
 * `publicDirs` (first match wins; index.html is always the page).
 */
export function routeDevRequest(pathname: string, publicDirs: string[], hmrPath = HMR_PATH): DevRoute {
  if (pathname === hmrPath) return { kind: "hmr" };
  if (pathname.startsWith("/_bun/")) return { kind: "bun" };
  const find = (rel: string) =>
    publicDirs.map((dir) => join(dir, rel)).find((path) => existsSync(path) && statSync(path).isFile());
  const route = routeRequest(pathname, (rel) => find(rel) !== undefined);
  switch (route.kind) {
    case "init":
      return { kind: "init" };
    case "asset":
      if (route.path === "index.html") return { kind: "page" };
      return { kind: "file", path: find(route.path)! };
    default:
      // /__akan_native/ipc and /__akan_native/file/* belong to the native hosts, which never forward them.
      return { kind: "not-found" };
  }
}

/** .akan/native/dev/server.ts: Bun's dev server for the entry, reporting its port on stdout. */
export function bunDevServerScript(entry: string): string {
  return `// Generated by akan-native dev --hmr. Do not edit.
import page from ${JSON.stringify(entry)};

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  routes: { "/": page },
  development: { hmr: true, console: false },
  fetch: () => new Response("not found", { status: 404 }),
});
console.log("AKAN_NATIVE_DEV_SERVER " + server.port);

// End with akan-native dev: its end of stdin closes, even when it is killed.
for await (const _ of Bun.stdin.stream()) {
}
process.exit(0);
`;
}

// ------------------------------------------------------------------ Bun's dev server (child)

interface Upstream {
  port: number;
  proc: ReturnType<typeof Bun.spawn>;
}

async function startBunDevServer(project: Project, entry: string, onLine: (line: string) => void): Promise<Upstream> {
  const dir = join(project.appDir, ".akan", "native", "dev");
  mkdirSync(dir, { recursive: true });
  const script = join(dir, "server.ts");
  writeFileSync(script, bunDevServerScript(entry));
  // cwd = the app folder: Bun reads its bunfig.toml ([serve.static] plugins, env, define).
  const proc = Bun.spawn([process.execPath, script], {
    cwd: project.appDir,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const output: string[] = [];
  let ready!: (port: number) => void;
  const port = new Promise<number>((resolve) => (ready = resolve));
  let found = false;
  const onChildLine = (line: string) => {
    const m = /^AKAN_NATIVE_DEV_SERVER (\d+)$/.exec(line);
    if (m && !found) {
      found = true;
      ready(Number(m[1]));
    } else if (found) {
      onLine(line);
    } else {
      output.push(line);
    }
  };
  void pipeLines(proc.stdout as ReadableStream<Uint8Array>, onChildLine);
  void pipeLines(proc.stderr as ReadableStream<Uint8Array>, onChildLine);
  const failed = proc.exited.then((code) => {
    throw new CliError(`Bun's dev server exited with code ${code}${output.length ? `:\n${output.join("\n")}` : ""}`);
  });
  const timeout = Bun.sleep(30_000).then(() => {
    throw new CliError(`Bun's dev server did not start within 30 s${output.length ? `:\n${output.join("\n")}` : ""}`);
  });
  try {
    return { port: await Promise.race([port, failed, timeout]), proc };
  } catch (error) {
    proc.kill();
    throw error;
  } finally {
    failed.catch(() => {});
    timeout.catch(() => {});
  }
}

// ------------------------------------------------------------------ gateway

export interface HmrContext {
  project: Project;
  /** web: the /__akan_native/init.js text. Native hosts serve their own. */
  initScript?: () => string;
}

export interface HmrOptions {
  platform: Platform;
  /** The app's source HTML for Bun's dev server; unused with `upstream`. */
  entry?: string;
  /** An external dev server's origin (akanjs readiness O4-1), proxied instead of Bun's dev server. */
  upstream?: string;
  /** The HMR socket path the page opens (O4-2). Default Bun's /_bun/hmr. */
  hmrPath?: string;
  /**
   * The app's own WebSocket paths (W4), e.g. ["/ws"]: a socket the page opens on its origin to one of
   * them goes through the gateway to the dev server (`upstream`), so a real iPhone reaches the Mac's
   * server as it does the pages.
   */
  wsPaths?: string[];
  /** The host the app reaches the gateway at: a LAN address for a real iPhone (O4-3). Default the loopback name. */
  publicHost?: string;
  /** 0 = any free port. */
  port: number;
  hostname: string;
  /** Read on every request: akan-native dev replaces the project and init.js after a config change. */
  context: HmrContext;
  /** Bun's dev server output. */
  onLine: (line: string) => void;
  /** Gateway problems (each text once). */
  onWarning: (text: string) => void;
}

export interface HmrServer {
  /** The gateway, e.g. http://127.0.0.1:52011 */
  url: string;
  port: number;
  /** Rejects when Bun's dev server ends on its own. */
  exited: Promise<number>;
  stop(): void;
}

interface Socket {
  up?: WebSocket;
  queue: (string | Uint8Array<ArrayBuffer>)[];
  /** The socket's path and query on the gateway, passed on upstream. */
  path: string;
}

/** Hop-by-hop and representation headers a proxy must not copy; validators so that nothing answers 304. */
const DROP_REQUEST = [
  "host",
  "connection",
  "keep-alive",
  "accept-encoding",
  "if-none-match",
  "if-modified-since",
  "content-length",
];
const DROP_RESPONSE = [
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
  "etag",
  "last-modified",
];

export async function startHmrServer(opts: HmrOptions): Promise<HmrServer> {
  const hmrPath = opts.hmrPath ?? HMR_PATH;
  const relayed = new Set([hmrPath, ...(opts.wsPaths ?? [])]);
  let upstream: Upstream | null = null;
  let origin: string;
  if (opts.upstream) {
    const url = new URL(opts.upstream);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new CliError(`upstream must be an http(s) URL (got ${opts.upstream})`);
    origin = url.origin;
  } else {
    if (!opts.entry) throw new CliError("the dev gateway needs web.devEntry or an upstream dev server");
    upstream = await startBunDevServer(opts.context.project, opts.entry, opts.onLine);
    origin = `http://127.0.0.1:${upstream.port}`;
  }
  const wsUpstream = origin.replace(/^http/, "ws");
  const publicHost = opts.publicHost ?? (opts.hostname === "localhost" ? "localhost" : "127.0.0.1");
  // The page's socket: ws://localhost unless the app is on another device (verified from app:// and,
  // through adb reverse, from https://app.localhost).
  const wsHost = opts.publicHost ?? "localhost";
  const publicDirs = () => {
    const project = opts.context.project;
    return [
      ...(opts.entry ? [join(dirname(opts.entry), "public")] : []),
      resolve(project.appDir, project.config.web.dir),
    ];
  };
  const warned = new Set<string>();
  const warnOnce = (text: string) => {
    if (warned.has(text)) return;
    warned.add(text);
    opts.onWarning(text);
  };
  const noCache = { "cache-control": "no-cache" };

  const proxy = async (req: Request, path: string): Promise<Response> => {
    const headers = new Headers(req.headers);
    for (const name of DROP_REQUEST) headers.delete(name);
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
    const res = await fetch(origin + path, { method: req.method, headers, body, redirect: "manual" });
    const out = new Headers(res.headers);
    for (const name of DROP_RESPONSE) out.delete(name);
    out.set("cache-control", "no-cache");
    // A redirect to the dev server's own origin stays on the app's origin (a relative Location).
    const location = out.get("location");
    if (location?.startsWith(origin)) out.set("location", location.slice(origin.length) || "/");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  };

  const rewrite = (html: string, port: number): Response => {
    try {
      const { html: page, warnings } = rewriteDevHtml(html, {
        platform: opts.platform,
        port,
        wsOrigin: `ws://${wsHost}:${port}`,
        hmrPath,
        wsPaths: opts.wsPaths,
        csp: opts.context.project.config.security?.csp,
      });
      for (const warning of warnings) warnOnce(warning);
      return new Response(page, { headers: { ...noCache, "content-type": "text/html; charset=utf-8" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnOnce(message);
      return new Response(message, { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
  };

  /** External dev server: any path, and an HTML answer becomes the host's page. */
  const fromUpstream = async (req: Request, path: string, port: number): Promise<Response> => {
    const res = await proxy(req, path);
    if (req.method !== "GET" || !(res.headers.get("content-type") ?? "").includes("text/html")) return res;
    if (res.status !== 200) return res;
    return rewrite(await res.text(), port);
  };

  const page = async (port: number): Promise<Response> => {
    const res = await fetch(`${origin}/`, { headers: { accept: "text/html" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html"))
      return proxy(new Request(`${origin}/`), "/");
    return rewrite(await res.text(), port);
  };

  let server: ReturnType<typeof serveGateway>;
  const serveGateway = () =>
    Bun.serve({
      hostname: opts.hostname,
      port: opts.port,
      // A dev server builds a page on its first request (27 s on a Windows VM): Bun's default 10 s idle timeout closed
      // the shell's request first, and the shell fell back to its bundled files, which a dev build has none of.
      idleTimeout: 0,
      async fetch(req, srv) {
        const url = new URL(req.url);
        if (relayed.has(url.pathname) && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
          if (srv.upgrade(req, { data: { queue: [], path: url.pathname + url.search } })) return undefined;
          return new Response("expected a WebSocket upgrade", { status: 400 });
        }
        // Everything but the HMR socket goes to the dev server (an app socket's HTTP fallback too).
        if (opts.upstream && url.pathname !== hmrPath) {
          // /__akan_native/* is the host's (web: init.js here); everything else is the dev server's.
          try {
            if (!isHostPath(url.pathname))
              return await fromUpstream(req, url.pathname + url.search, srv.port ?? opts.port);
            const init = url.pathname === "/__akan_native/init.js" ? opts.context.initScript?.() : undefined;
            if (init !== undefined)
              return new Response(init, { headers: { ...noCache, "content-type": "text/javascript; charset=utf-8" } });
            return new Response("not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
          } catch (error) {
            const message = `dev gateway: ${url.pathname}: ${error instanceof Error ? error.message : String(error)} (is the dev server at ${origin} running?)`;
            warnOnce(message);
            return new Response(message, { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } });
          }
        }
        const route = routeDevRequest(url.pathname, publicDirs(), hmrPath);
        try {
          switch (route.kind) {
            case "hmr":
              if (srv.upgrade(req, { data: { queue: [], path: url.pathname + url.search } })) return undefined;
              return new Response("expected a WebSocket upgrade", { status: 400 });
            case "bun":
              return await proxy(req, url.pathname + url.search);
            case "init": {
              const init = opts.context.initScript?.();
              if (init === undefined) break;
              return new Response(init, { headers: { ...noCache, "content-type": "text/javascript; charset=utf-8" } });
            }
            case "page":
              if (req.method !== "GET" && req.method !== "HEAD")
                return new Response("method not allowed", { status: 405 });
              return await page(srv.port ?? opts.port);
            case "file":
              return new Response(Bun.file(route.path), { headers: noCache });
          }
        } catch (error) {
          const message = `dev gateway: ${url.pathname}: ${error instanceof Error ? error.message : String(error)}`;
          warnOnce(message);
          return new Response(message, { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } });
        }
        return new Response("not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
      },
      websocket: {
        data: {} as Socket,
        open(ws) {
          const up = new WebSocket(wsUpstream + ws.data.path);
          up.binaryType = "arraybuffer";
          ws.data.up = up;
          up.onopen = () => {
            for (const message of ws.data.queue) up.send(message);
            ws.data.queue = [];
          };
          up.onmessage = (event) => {
            ws.send(typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer));
          };
          up.onclose = () => ws.close();
          up.onerror = () => ws.close();
        },
        message(ws, message) {
          const data = message as string | Uint8Array<ArrayBuffer>; // a Buffer over a plain ArrayBuffer
          const up = ws.data.up;
          if (up?.readyState === WebSocket.OPEN) up.send(data);
          else ws.data.queue.push(data);
        },
        close(ws) {
          ws.data.up?.close();
        },
      },
    });
  try {
    server = serveGateway();
  } catch (error) {
    upstream?.proc.kill();
    throw new CliError(
      `dev gateway on ${opts.hostname}:${opts.port}: ${error instanceof Error ? error.message : String(error)} (choose another with --port)`,
    );
  }

  let stopped = false;
  let ended!: (code: number) => void;
  // An external dev server is the caller's: the gateway only ends when stopped.
  const exited = upstream
    ? upstream.proc.exited.then((code) => {
        if (!stopped) throw new CliError(`Bun's dev server exited with code ${code}`);
        return code;
      })
    : new Promise<number>((resolve) => (ended = resolve));
  exited.catch(() => {}); // akan-native dev listens later; never an unhandled rejection meanwhile
  const port = server.port ?? opts.port;
  return {
    url: `http://${publicHost}:${port}`,
    port,
    exited,
    stop() {
      stopped = true;
      server.stop(true);
      upstream?.proc.kill();
      ended?.(0);
    },
  };
}

/** The Mac's private IPv4 address on a network (Wi-Fi or Ethernet), for a real iPhone (O4-3). */
export function lanAddress(interfaces = networkInterfaces()): string | undefined {
  const privateLan = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  for (const [name, list] of Object.entries(interfaces)) {
    if (/^(lo|utun|bridge|awdl|llw|vmnet|docker)/.test(name)) continue;
    const v4 = list?.find((a) => a.family === "IPv4" && !a.internal && privateLan(a.address));
    if (v4) return v4.address;
  }
  return undefined;
}
