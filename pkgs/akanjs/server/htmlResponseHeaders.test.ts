//? Loaded before any test sets NODE_ENV: the system pages import it on first use, and a production build of it
//? beside the development `react` this process already holds cannot render.
import "react-dom/server.browser";
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AkanError, type BaseEnv } from "akanjs/base";
import { DEFAULT_AKAN_I18N, type Logger } from "akanjs/common";
import { SCRIPT_NONCE_HEADER } from "akanjs/fetch";
import { getDefaultInjectRegistry, getDefaultLiveRegistry } from "akanjs/service";
import { RouteClientCache } from "./artifact";
import { DevtoolsRouter } from "./devtools/devtoolsRouter";
import { DevtoolsUnlockPage } from "./devtools/devtoolsUnlockPage";
import type { DiLifecycle } from "./di/diLifecycle";
import { GatewayStatusPage } from "./gateway/gatewayStatusPage";
import { CSR_DEV_DIRNAME, CSR_DEV_MANIFEST_FILE, SSR_DEV_DIRNAME, SSR_DEV_ROUTE_PREFIX } from "./hmr/csrDevManifest";
import { CsrDevShell } from "./hmr/csrDevShell";
import {
  boundaryCount,
  declaredHash,
  declaredSnippet,
  manyDeclaredHashes,
  noncedSnippet,
} from "./htmlResponseHeaders.fixture";
import { HtmlResultCache } from "./htmlResultCache";
import { OAuthErrors } from "./oauth/OAuthErrors";
import { RenderBusyResponse } from "./renderBusyResponse";
import { RouteCacheTally } from "./routeCacheTally";
import { RscRenderRefusal } from "./rscRenderRefusal";
import { RscWorker } from "./rscWorkerHost";
import { MAX_RESPONSE_SCRIPT_HASHES, SCRIPT_POLICY_REPORT_ONLY_HEADER, ScriptPolicy } from "./scriptPolicy";
import { SsrInlineScripts } from "./ssrInlineScripts";
import { createSubRouteIndexResponse, createSystemPageResponse } from "./systemPages";
import { type BaseBuildArtifact, defaultAkanImageConfig } from "./types";
import { WebCsrSurface } from "./webCsrSurface";
import { WebDocumentRoute } from "./webDocumentRoute";
import { WebRouteContext } from "./webRouteContext";
import { WebRscRoute } from "./webRscRoute";

const securityHeaderNames = [
  "content-security-policy",
  "content-security-policy-report-only",
  "reporting-endpoints",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "cache-control",
];
const vendorMap = { react: "/_akan/client/react.js" };
const [bootstrapHash, flushHash, importmapHash] = SsrInlineScripts.policyHashes(vendorMap);
const namedHashes: Record<string, string> = {
  [bootstrapHash ?? ""]: "'sha256-<bootstrap>'",
  [flushHash ?? ""]: "'sha256-<flush>'",
  [importmapHash ?? ""]: "'sha256-<importmap>'",
  [`'${declaredHash}'`]: "'sha256-<declared by the page>'",
};

//? Hashes and nonces differ per build and per response, so each is shown by what it names.
const securityHeadersOf = ({ headers }: Response): Record<string, string> =>
  Object.fromEntries(
    securityHeaderNames.flatMap((name) => {
      const value = headers.get(name);
      if (value === null) return [];
      const shown = value
        .replace(/'nonce-[^']+'/g, "'nonce-<response>'")
        .replace(/'sha256-[^']+'/g, (hash) => namedHashes[hash] ?? "'sha256-<script of this page>'");
      return [[name, shown]];
    }),
  );

interface PageScripts {
  uncovered: string[];
  executable: number;
}

//* What a browser checks against `script-src … 'strict-dynamic'`: an inline script or import map needs its hash or
//* the response's nonce, and a script the parser loads by URL needs the nonce, since 'self' no longer admits it.
const scriptsOf = (html: string, { headers }: Response): PageScripts => {
  const policy = headers.get(SCRIPT_POLICY_REPORT_ONLY_HEADER) ?? "";
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  const hashes = new Set(policy.match(/'sha256-[^']+'/g) ?? []);
  const nonced = (attrs: string) => nonce !== undefined && attrs.includes(`nonce="${nonce}"`);
  const loaded = ScriptPolicy.scriptsOf(html).filter(({ external }) => external);
  const executable = ScriptPolicy.executableScriptsOf(html);
  return {
    executable: executable.length + loaded.length,
    uncovered: [
      ...loaded.filter(({ attrs }) => !nonced(attrs)).map(({ attrs }) => `<script${attrs}>`),
      ...executable
        .filter(({ attrs, text }) => !nonced(attrs) && !hashes.has(ScriptPolicy.hashOf(text)))
        .map(({ attrs, text }) => `<script${attrs}>${text.slice(0, 80)}`),
    ],
  };
};

const withEnv = async <T>(vars: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> => {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const production = { NODE_ENV: "production", AKAN_COMMAND_TYPE: undefined };
const development = { NODE_ENV: "development", AKAN_COMMAND_TYPE: undefined };

const artifact: BaseBuildArtifact = {
  rscClientUrl: "/_akan/client/rsc.js",
  vendorMap,
  pagesBundlePath: path.join(import.meta.dir, "htmlResponseHeaders.fixture.tsx"),
  pagesBundleBuildId: 1,
  cssAssets: {},
  domains: [],
  subRoutes: {},
  basePaths: [],
  branches: [],
  i18n: DEFAULT_AKAN_I18N,
  imageConfig: defaultAkanImageConfig,
};

const contextOf = (prodMode: boolean) =>
  new WebRouteContext({
    artifact,
    prodMode,
    renderState: { buildId: 0, cssAssets: {}, cssBytesByUrl: {} },
    subRoutes: {},
    seedIndex: { entries: [], globalLayoutFiles: [] },
    routeCache: new RouteClientCache({
      buildRoute: async (routeId) => {
        throw new AkanError("artifactMissing", `no route build in this test: ${routeId}`);
      },
    }),
    hub: () => null,
  });

interface Documents {
  get: (pathname: string, init?: RequestInit & { origin?: string }) => Promise<Response>;
  navigate: (pathname: string, init?: RequestInit) => Promise<Response>;
  cache: HtmlResultCache;
  logger: Logger;
}

let tmpDir = "";
let rsc: RscWorker;
const workerEnv = {
  AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
  AKAN_PUBLIC_APP_NAME: "htmlheaders",
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
  AKAN_CONTENT_SECURITY_POLICY: undefined,
  AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY: undefined,
  AKAN_CONTENT_SECURITY_POLICY_REPORT_URI: undefined,
  AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC: undefined,
  AKAN_HSTS: undefined,
  AKAN_HTML_CACHE_CONTROL: undefined,
  AKAN_HTML_RESULT_CACHE: undefined,
  AKAN_HTML_RESULT_CACHE_PATHS: undefined,
  AKAN_HTML_RESULT_CACHE_EXCLUDE_PATHS: undefined,
};
const savedEnv = Object.fromEntries(Object.keys(workerEnv).map((key) => [key, process.env[key]]));

beforeAll(async () => {
  for (const [key, value] of Object.entries(workerEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "akan-html-headers-"));
  rsc = new RscWorker(artifact);
  await rsc.ready;
});

afterAll(async () => {
  rsc.kill();
  await rm(tmpDir, { recursive: true, force: true });
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const documentsOf = (prodMode: boolean): Documents => {
  const cache = new HtmlResultCache({ prodMode, devRegistry: !prodMode });
  const context = contextOf(prodMode);
  const navigations = new WebRscRoute(context, { rsc, importMapKey: "k1" }).routes() as Record<
    string,
    (req: Request) => Promise<Response>
  >;
  const route = new WebDocumentRoute(context, {
    rsc,
    importMapKey: "k1",
    ssrDevShell: prodMode
      ? null
      : new CsrDevShell(tmpDir, { dirName: SSR_DEV_DIRNAME, routePrefix: SSR_DEV_ROUTE_PREFIX }),
    htmlCache: cache,
  });
  return {
    cache,
    logger: context.logger,
    navigate: async (pathname, init) => {
      const request = new Request(`http://localhost/__rsc?url=${encodeURIComponent(pathname)}`, init);
      return (await navigations["/__rsc"]?.(request)) ?? new Response(null, { status: 599 });
    },
    get: async (pathname, { origin = "http://localhost", ...init } = {}) => {
      const request = new Request(`${origin}${pathname}`, init);
      return await route.render(request, new URL(request.url));
    },
  };
};

const stored = async (cache: HtmlResultCache, entries: number) => {
  for (let waited = 0; cache.metrics().httpHtmlCacheEntries < entries; waited += 5) {
    if (waited > 3000) throw new AkanError("timeout", "the page was never stored in the HTML cache");
    await Bun.sleep(5);
  }
};

const csrDocument = `<!doctype html><html><head><meta charset="utf-8"><script type="module">\nconst tag = "<script>";\ndocument.title = tag.length;\n</script></head><body><div id="root"></div></body></html>`;

const csrRoute = async (surface: WebCsrSurface, csrDir: string): Promise<Response> => {
  const routes = (surface.routes(csrDir) ?? {}) as Record<string, (req: Request) => Promise<Response>>;
  const page = await routes["/__csr"]?.(new Request("http://localhost/__csr"));
  return page ?? new Response(null, { status: 599 });
};

const emptyDi = () =>
  ({
    live: getDefaultLiveRegistry(),
    registry: getDefaultInjectRegistry(),
    modules: { database: new Map(), service: new Map(), scalar: new Map(), adaptor: new Map(), middleware: new Map() },
    hierarchy: { adaptorStages: [], serviceStages: [] },
  }) as unknown as DiLifecycle;

const studio = async () => {
  const routes = new DevtoolsRouter({
    di: emptyDi(),
    env: {
      repoName: "akan",
      serveDomain: "example.com",
      appName: "htmlheaders",
      environment: "local",
      operationMode: "local",
    } as BaseEnv,
    name: "AkanServer",
    serverMode: "all",
    prefix: "/api",
    websocketPrefix: "/ws",
    openapi: false,
    web: true,
    getStatus: () => "running",
  }).createRoutes() as Record<string, { GET: (req: Request) => Promise<Response> }>;
  const page = await routes["/_akan/studio"]?.GET(new Request("http://localhost/_akan/studio"));
  return page ?? new Response(null, { status: 599 });
};

const responseClasses: Record<string, { env: typeof production; scripts: number; get: () => Promise<Response> }> = {
  "a server-rendered page": { env: production, scripts: 4, get: () => documentsOf(true).get("/en/plain") },
  "a server-rendered page over https": {
    env: production,
    scripts: 4,
    get: () => documentsOf(true).get("/en/plain", { origin: "https://example.test" }),
  },
  "a page that streams a boundary in": {
    env: production,
    scripts: 6,
    get: () => documentsOf(true).get("/en/streamed"),
  },
  "the same page replayed from the HTML cache": {
    env: production,
    scripts: 6,
    get: async () => {
      const { get, cache } = documentsOf(true);
      await (await get("/en/streamed")).text();
      await stored(cache, 1);
      return await get("/en/streamed");
    },
  },
  "a page that redirects after its first byte": {
    env: production,
    scripts: 5,
    get: () => documentsOf(true).get("/en/late"),
  },
  "a page whose head declares a script hash": {
    env: production,
    scripts: 5,
    get: () => documentsOf(true).get("/en/hashed"),
  },
  "a page whose head reads the nonce": { env: production, scripts: 5, get: () => documentsOf(true).get("/en/nonced") },
  "a page no route matches": { env: production, scripts: 4, get: () => documentsOf(true).get("/en/absent") },
  "a server-rendered page in dev": { env: development, scripts: 5, get: () => documentsOf(false).get("/en/plain") },
  "the CSR document": {
    env: production,
    scripts: 1,
    get: async () => {
      await Bun.write(path.join(tmpDir, "csr", "index.html"), csrDocument);
      const request = new Request("http://localhost/en?csr=true");
      const response = await new WebCsrSurface(contextOf(true), { devShell: null, builderRpc: () => null }).answer(
        request,
        new URL(request.url),
        path.join(tmpDir, "csr"),
      );
      return response ?? new Response(null, { status: 599 });
    },
  },
  "the CSR document in dev": {
    env: development,
    scripts: 2,
    get: async () => {
      await Bun.write(path.join(tmpDir, "csr", "index.html"), csrDocument);
      const request = new Request("http://localhost/en?csr=true");
      const response = await new WebCsrSurface(contextOf(false), { devShell: null, builderRpc: () => null }).answer(
        request,
        new URL(request.url),
        path.join(tmpDir, "csr"),
      );
      return response ?? new Response(null, { status: 599 });
    },
  },
  "the CSR dev shell": {
    env: development,
    scripts: 4,
    get: async () => {
      await Bun.write(
        path.join(tmpDir, CSR_DEV_DIRNAME, CSR_DEV_MANIFEST_FILE),
        JSON.stringify({ version: 1, generation: 7, vendorFile: "vendor-abc.js", entries: { "": "index.csr.tsx" } }),
      );
      const surface = new WebCsrSurface(contextOf(false), {
        devShell: new CsrDevShell(tmpDir),
        builderRpc: () => null,
      });
      return await csrRoute(surface, path.join(tmpDir, "csr"));
    },
  },
  "the CSR route with no built document": {
    env: production,
    scripts: 1,
    get: async () => {
      const surface = new WebCsrSurface(contextOf(true), { devShell: null, builderRpc: () => null });
      return await csrRoute(surface, path.join(tmpDir, "no-csr"));
    },
  },
  "the not-found system page": {
    env: production,
    scripts: 0,
    get: () => createSystemPageResponse({ kind: "not-found", pathname: "/en/absent", homeHref: "/en" }),
  },
  "the error system page in dev": {
    env: development,
    scripts: 1,
    get: () =>
      createSystemPageResponse({
        kind: "error",
        pathname: "/en/broken",
        homeHref: "/en",
        showDetails: true,
        error: new AkanError("unknown", "boom"),
        script: "self.__AKAN_HMR_SYSTEM_PAGE__=true;",
      }),
  },
  "the sub-route index": {
    env: development,
    scripts: 0,
    get: () => createSubRouteIndexResponse({ locale: "en", basePaths: ["admin"] }),
  },
  "Akan Studio": { env: development, scripts: 1, get: studio },
  "the devtools unlock page": {
    env: production,
    scripts: 0,
    get: async () =>
      DevtoolsUnlockPage.render({ action: "/_akan/unlock", next: "/_akan/studio", minutes: 30, failed: false }),
  },
  "the gateway status page": {
    env: production,
    scripts: 1,
    get: async () =>
      new Response(GatewayStatusPage.html({ heading: "Starting", detail: "replica 0", note: "This page reloads." }), {
        status: 503,
        headers: GatewayStatusPage.headers("text/html; charset=utf-8"),
      }),
  },
  "the page a full render queue answers": {
    env: production,
    scripts: 1,
    get: async () =>
      new RenderBusyResponse({ warn: () => undefined } as unknown as Logger).document(
        new Request("https://example.test/docs", { headers: { accept: "text/html" } }),
        new RscRenderRefusal("renderQueueFull", "render queue is full"),
      ),
  },
  "the OAuth error page": {
    env: production,
    scripts: 0,
    get: async () => OAuthErrors.page(400, "Invalid request", "x"),
  },
};

describe("HTML response classes", () => {
  test("each names every script it writes in the policy it sends", async () => {
    for (const [name, { env, scripts, get }] of Object.entries(responseClasses)) {
      await withEnv(env, async () => {
        const response = await get();
        const { uncovered, executable } = scriptsOf(await response.text(), response);

        expect(response.headers.get("content-type"), name).toStartWith("text/html");
        expect(uncovered, name).toEqual([]);
        expect(executable, name).toBeGreaterThanOrEqual(scripts);
        if (scripts === 0) expect(executable, name).toBe(0);
      });
    }
  }, 60_000);

  test("each sends exactly these security headers", async () => {
    const sent: Record<string, Record<string, string>> = {};
    for (const [name, { env, get }] of Object.entries(responseClasses)) {
      await withEnv(env, async () => {
        const response = await get();
        await response.text();
        sent[name] = securityHeadersOf(response);
      });
    }

    expect(sent).toEqual({
      "Akan Studio": {
        "cache-control": "no-store",
        "content-security-policy": "frame-ancestors 'self' vscode-webview: vscode-file:; base-uri 'self'",
        "content-security-policy-report-only":
          "script-src 'self' 'sha256-<script of this page>' 'strict-dynamic' 'unsafe-eval'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
      },
      "a page no route matches": {
        "cache-control": "no-store",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only":
          "script-src 'self' 'nonce-<response>' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<importmap>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "a page that redirects after its first byte": {
        "cache-control": "no-cache",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only":
          "script-src 'self' 'nonce-<response>' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<importmap>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "a page that streams a boundary in": {
        "cache-control": "no-cache",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only":
          "script-src 'self' 'nonce-<response>' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<importmap>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "a page whose head declares a script hash": {
        "cache-control": "no-cache",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only":
          "script-src 'self' 'nonce-<response>' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<importmap>' 'sha256-<declared by the page>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "a page whose head reads the nonce": {
        "cache-control": "no-cache",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only":
          "script-src 'self' 'nonce-<response>' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<importmap>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "a server-rendered page": {
        "cache-control": "no-cache",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only":
          "script-src 'self' 'nonce-<response>' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<importmap>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "a server-rendered page in dev": {
        "cache-control": "no-store",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only":
          "script-src 'self' 'nonce-<response>' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<importmap>' 'strict-dynamic' 'unsafe-eval'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "a server-rendered page over https": {
        "cache-control": "no-cache",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only":
          "script-src 'self' 'nonce-<response>' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<importmap>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "strict-transport-security": "max-age=31536000",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "the CSR dev shell": {
        "cache-control": "no-store",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only": "script-src 'self' 'nonce-<response>' 'strict-dynamic' 'unsafe-eval'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "the CSR document": {
        "cache-control": "no-cache",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only": "script-src 'self' 'sha256-<script of this page>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "the CSR document in dev": {
        "cache-control": "no-store",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only":
          "script-src 'self' 'nonce-<response>' 'sha256-<script of this page>' 'strict-dynamic' 'unsafe-eval'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "the CSR route with no built document": {
        "cache-control": "no-cache",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only": "script-src 'self' 'nonce-<response>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "the OAuth error page": {
        "cache-control": "no-store",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only": "script-src 'self' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "the devtools unlock page": {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
      "the error system page in dev": {
        "cache-control": "no-store",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only": "script-src 'self' 'nonce-<response>' 'strict-dynamic' 'unsafe-eval'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "the gateway status page": {
        "cache-control": "no-store",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only": "script-src 'self' 'sha256-<script of this page>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "the not-found system page": {
        "cache-control": "no-store",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only": "script-src 'self' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "the page a full render queue answers": {
        "cache-control": "no-store",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only": "script-src 'self' 'sha256-<script of this page>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "the same page replayed from the HTML cache": {
        "cache-control": "no-cache",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only":
          "script-src 'self' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<importmap>' 'sha256-<script of this page>' 'sha256-<script of this page>' 'sha256-<script of this page>' 'sha256-<script of this page>' 'strict-dynamic'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
      "the sub-route index": {
        "cache-control": "no-store",
        "content-security-policy": "frame-ancestors 'self'; base-uri 'self'",
        "content-security-policy-report-only": "script-src 'self' 'strict-dynamic' 'unsafe-eval'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      },
    });
  }, 60_000);

  test("a page the framework's scripts are not enough for can name its own, by hash or by the nonce", async () => {
    await withEnv(production, async () => {
      const { get, cache } = documentsOf(true);
      const hashed = await get("/en/hashed");
      expect(await hashed.text()).toContain(`<script>${declaredSnippet}</script>`);
      expect(hashed.headers.get(SCRIPT_POLICY_REPORT_ONLY_HEADER)).toContain(`'${declaredHash}'`);
      await stored(cache, 1);
      const replayed = await get("/en/hashed");
      expect(replayed.headers.get("X-Akan-Cache")).toBe("HIT");
      expect(replayed.headers.get(SCRIPT_POLICY_REPORT_ONLY_HEADER)).toContain(`'${declaredHash}'`);
      expect(scriptsOf(await replayed.text(), replayed).uncovered).toEqual([]);

      const nonced = await get("/en/nonced");
      const nonce = /'nonce-([^']+)'/.exec(nonced.headers.get(SCRIPT_POLICY_REPORT_ONLY_HEADER) ?? "")?.[1];
      expect(await nonced.text()).toContain(`<script nonce="${nonce}">${noncedSnippet}</script>`);
      await (await get("/en/nonced")).text();
      await Bun.sleep(50);
      expect(cache.metrics().httpHtmlCacheEntries).toBe(1);
    });
  }, 30_000);

  test("a replayed page names the scripts React wrote under the first render's nonce by hash, with no nonce of its own", async () => {
    await withEnv(production, async () => {
      const { get, cache } = documentsOf(true);
      const first = await get("/en/streamed");
      const firstHtml = await first.text();
      const firstPolicy = first.headers.get(SCRIPT_POLICY_REPORT_ONLY_HEADER) ?? "";
      const nonce = /'nonce-([^']+)'/.exec(firstPolicy)?.[1] ?? "";
      await stored(cache, 1);
      const replayed = await get("/en/streamed");
      const policy = replayed.headers.get(SCRIPT_POLICY_REPORT_ONLY_HEADER) ?? "";

      expect(firstHtml).toContain(`<script nonce="${nonce}"`);
      expect(firstHtml).toContain('$RC("B:0","S:0")');
      expect(replayed.headers.get("X-Akan-Cache")).toBe("HIT");
      expect(await replayed.text()).toBe(firstHtml);
      expect(policy).not.toContain("'nonce-");
      expect(policy.match(/'sha256-[^']+'/g)?.length).toBeGreaterThan(3);
      expect(
        ScriptPolicy.hashesOfNonced(new TextEncoder().encode(firstHtml), nonce).every((hash) => policy.includes(hash)),
      ).toBe(true);
    });
  }, 30_000);

  test("a page whose replay would name more hashes than a response does skips the cache, says why, and is warned about once", async () => {
    await withEnv(production, async () => {
      const { get, cache, logger } = documentsOf(true);
      const warn = spyOn(logger, "warn").mockImplementation(() => undefined);
      const before = RouteCacheTally.snapshot().html.bypass["script-hashes"];
      const first = await get("/en/boundaries");
      const firstHtml = await first.text();
      const nonce = /'nonce-([^']+)'/.exec(first.headers.get(SCRIPT_POLICY_REPORT_ONLY_HEADER) ?? "")?.[1] ?? "";
      await stored(cache, 1);
      const second = await get("/en/boundaries");
      const secondHtml = await second.text();
      const third = await get("/en/boundaries?from=another-url");
      await third.text();
      await Bun.sleep(50);
      const fourth = await get("/en/boundaries?from=another-url");
      await fourth.text();
      const warnings = warn.mock.calls.map(([line]) => String(line)).filter((line) => line.includes("script-hashes"));
      warn.mockRestore();

      expect(ScriptPolicy.hashesOfNonced(new TextEncoder().encode(firstHtml), nonce).length).toBeGreaterThanOrEqual(
        boundaryCount,
      );
      expect(boundaryCount).toBeGreaterThan(MAX_RESPONSE_SCRIPT_HASHES);
      expect(first.headers.get("X-Akan-Cache")).toBe("MISS");
      expect([second.headers.get("X-Akan-Cache"), second.headers.get("X-Akan-Cache-Reason")]).toEqual([
        "BYPASS",
        "script-hashes",
      ]);
      expect(fourth.headers.get("X-Akan-Cache-Reason")).toBe("script-hashes");
      expect(second.headers.get(SCRIPT_POLICY_REPORT_ONLY_HEADER)).toContain("'nonce-");
      expect(scriptsOf(secondHtml, second).uncovered).toEqual([]);
      expect(RouteCacheTally.snapshot().html.bypass["script-hashes"] - before).toBeGreaterThanOrEqual(2);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(`a response names ${MAX_RESPONSE_SCRIPT_HASHES}`);
    });
  }, 30_000);

  test("a page that names more hashes than a response does keeps the first of them and is warned about once", async () => {
    await withEnv(production, async () => {
      const { get, logger } = documentsOf(true);
      const warn = spyOn(logger, "warn").mockImplementation(() => undefined);
      const first = await get("/en/declares");
      await first.text();
      await (await get("/en/declares?again=1")).text();
      const warnings = warn.mock.calls.map(([line]) => String(line)).filter((line) => line.includes("script policy"));
      warn.mockRestore();
      const policy = first.headers.get(SCRIPT_POLICY_REPORT_ONLY_HEADER) ?? "";
      const kept = MAX_RESPONSE_SCRIPT_HASHES - SsrInlineScripts.policyHashes(vendorMap).length;

      expect(policy.match(/'sha256-[^']+'/g)).toHaveLength(MAX_RESPONSE_SCRIPT_HASHES);
      expect(manyDeclaredHashes.map((hash) => policy.includes(`'${hash}'`))).toEqual(
        manyDeclaredHashes.map((_, index) => index < kept),
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(`its last ${manyDeclaredHashes.length - kept} are left out`);
    });
  }, 30_000);

  test("a page reads the nonce of its own response, never a value the request brought", async () => {
    await withEnv(production, async () => {
      const { get, navigate, cache } = documentsOf(true);
      const brought = { headers: { [SCRIPT_NONCE_HEADER]: "brought-by-the-request" } };
      const stores = spyOn(cache, "storeWhileStreaming");
      const document = await get("/en/echoed", brought);
      const html = await document.text();
      const nonce = /'nonce-([^']+)'/.exec(document.headers.get(SCRIPT_POLICY_REPORT_ONLY_HEADER) ?? "")?.[1];
      const hostRequest = stores.mock.calls[0]?.[1].hostRequestStore.request;
      stores.mockRestore();
      const navigation = await navigate("/en/echoed", brought);
      const flight = await navigation.text();

      expect(html).toContain(`nonce:${nonce}`);
      expect(html).not.toContain("brought-by-the-request");
      expect(hostRequest?.headers.get(SCRIPT_NONCE_HEADER)).toBe(nonce ?? "");
      expect(navigation.status).toBe(200);
      expect(flight).toContain("nonce:none");
      expect(flight).not.toContain("brought-by-the-request");
    });
  }, 30_000);

  test("the settings turn the report-only header off, replace it, add sources to it, and point reports somewhere", async () => {
    const policyOf = async (vars: Record<string, string>) =>
      await withEnv({ ...production, ...vars }, async () => {
        const response = await createSystemPageResponse({ kind: "not-found", pathname: "/x", homeHref: "/" });
        return [
          response.headers.get(SCRIPT_POLICY_REPORT_ONLY_HEADER),
          response.headers.get("Reporting-Endpoints"),
          response.headers.get("Content-Security-Policy"),
        ];
      });
    const enforced = "frame-ancestors 'self'; base-uri 'self'";

    expect(await policyOf({ AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY: "off" })).toEqual([null, null, enforced]);
    expect(await policyOf({ AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY: "default-src 'self'" })).toEqual([
      "default-src 'self'",
      null,
      enforced,
    ]);
    expect(await policyOf({ AKAN_CONTENT_SECURITY_POLICY_REPORT_URI: "/api/csp" })).toEqual([
      "script-src 'self' 'strict-dynamic'; report-uri /api/csp; report-to akan-csp",
      'akan-csp="/api/csp"',
      enforced,
    ]);
    expect(await policyOf({ AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC: "'wasm-unsafe-eval'" })).toEqual([
      "script-src 'self' 'wasm-unsafe-eval' 'strict-dynamic'",
      null,
      enforced,
    ]);
    expect(await policyOf({ AKAN_CONTENT_SECURITY_POLICY: "off" })).toEqual([
      "script-src 'self' 'strict-dynamic'",
      null,
      null,
    ]);
  });

  test("no other file of the server answers with HTML: a new one joins the classes above", async () => {
    const files = await Array.fromAsync(new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: import.meta.dir }));
    const naming: string[] = [];
    for (const file of files.sort()) {
      if (/\.(test|fixture)\.tsx?$/.test(file)) continue;
      if ((await Bun.file(path.join(import.meta.dir, file)).text()).includes("text/html")) naming.push(file);
    }

    expect(naming).toEqual([
      "devtools/devtoolsAccess.ts",
      "devtools/devtoolsUnlockPage.ts",
      "gateway/gatewayHttpProxy.ts",
      "gateway/gatewayStatusPage.ts",
      "mcp/McpApps.ts",
      "oauth/OAuthErrors.ts",
      "remote/RemoteSource.ts",
      "renderBusyResponse.ts",
      "systemPages.tsx",
      "webRouteContext.ts",
    ]);
  });
});
