import { closeSync, openSync, realpathSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { DevHostEvent } from "@akanjs/devkit/akanApp";
import type { App } from "@akanjs/devkit/commandDecorators";
import type { AppRouteSource } from "@akanjs/devkit/executors";
import { PreviewChrome, type PreviewEngine, PreviewView } from "@akanjs/devkit/preview";
import { type AkanLocalePrefix, type LogRecord, parseRouteModuleKey } from "akanjs/common";
import { VerifyScope } from "../verify/verifyScope";
import { ApplicationRunner } from "./application.runner";
import { DevSupervisor } from "./devSupervisor";
import { HostProcessProbe } from "./hostProcessProbe";

export interface AppPreviewOptions {
  paths?: string[];
  changed?: boolean;
  csr?: boolean;
  engine?: PreviewEngine | null;
  screenshot?: boolean;
  desktop?: boolean;
  keep?: boolean;
  timeoutMs?: number;
}

export interface AppPreviewPage {
  path: string;
  url: string;
  finalUrl: string;
  status: number | null;
  title: string;
  text: string;
  ms: number;
  failed: boolean;
  /** The probe itself gave up, so nothing else on this page was read. */
  error: string | null;
  pageErrors: string[];
  clientReports: string[];
  serverErrors: string[];
  consoleErrors: string[];
  consoleWarnings: string[];
  domFindings: string[];
  screenshot: string | null;
}

export interface AppPreviewReport {
  app: string;
  origin: string;
  engine: PreviewEngine;
  viewport: { width: number; height: number };
  server: "running" | "started" | "kept";
  serverPid: number | null;
  serverLog: string | null;
  /** False when the app's log socket could not be read, so client and server errors are missing. */
  logsRead: boolean;
  /** Pages `--changed` reached but did not open, each with why. */
  skipped: string[];
  notes: string[];
  pages: AppPreviewPage[];
}

interface I18nLike {
  defaultLocale: string;
  locales: readonly string[];
  localePrefix?: AkanLocalePrefix;
}

interface PathRuleOptions {
  csr: boolean;
  apiPrefix?: string;
  publicDir?: string | null;
  pages?: string[];
}

interface StartedServer {
  proc: Bun.Subprocess;
  logPath: string;
  settled: Promise<{ state: "booted" | "failed" | "exited"; detail?: string }>;
}

export class AppPreview {
  static readonly mobileViewport = { width: 390, height: 844 };
  static readonly desktopViewport = { width: 1280, height: 800 };
  //? Not a configured target: `akanMobileTarget` only switches the page into its CSR boot, which is what is checked.
  static readonly csrTarget = "preview";
  static readonly settleMs = 1_000;
  //? A client report travels page → replica → gateway log hub → this socket after the page read.
  static readonly logGraceMs = 300;
  static readonly stopGraceMs = 15_000;

  static async run(app: App, options: AppPreviewOptions = {}): Promise<AppPreviewReport> {
    const engine = options.engine ?? PreviewChrome.backend;
    const unavailable = PreviewView.unavailableReason(engine);
    if (unavailable) throw new Error(unavailable);
    const changed = options.changed ? await AppPreview.#changedPages(app) : { paths: [], skipped: [] };
    const port = await app.getDevPort();
    const origin = `http://localhost:${port}`;
    const plan = await AppPreview.planOf(app, options, changed, origin);
    const root = app.workspace.workspaceRoot;
    const previewDir = path.join(ApplicationRunner.runtimeDirOf(app), "preview");
    const started = (await ApplicationRunner.answers(origin, app.name, root))
      ? null
      : await AppPreview.#startServer(app, port, previewDir);
    const viewport = options.desktop ? AppPreview.desktopViewport : AppPreview.mobileViewport;
    const report: AppPreviewReport = {
      app: app.name,
      origin,
      engine,
      viewport,
      server: started ? (options.keep ? "kept" : "started") : "running",
      serverPid: started?.proc.pid ?? null,
      serverLog: started ? path.relative(root, started.logPath) : null,
      logsRead: false,
      skipped: changed.skipped,
      notes: plan.notes,
      pages: [],
    };
    try {
      if (started) await AppPreview.#waitBooted(started);
      const records: LogRecord[] = [];
      const tail = await AppPreview.#tail(app, records);
      report.logsRead = !!tail;
      try {
        for (const pagePath of plan.paths) {
          const mark = records.length;
          const page = await AppPreview.#probe(origin, pagePath, {
            engine,
            viewport,
            screenshot: options.screenshot ? path.join(previewDir, AppPreview.screenshotName(pagePath)) : null,
            timeoutMs: options.timeoutMs ?? 60_000,
          });
          if (tail) await Bun.sleep(AppPreview.logGraceMs);
          AppPreview.attribute(page, records.slice(mark));
          if (page.screenshot) page.screenshot = path.relative(root, page.screenshot);
          report.pages.push(page);
        }
      } finally {
        tail?.close();
      }
      return report;
    } finally {
      if (started && !options.keep) await AppPreview.#stopServer(started.proc);
      else started?.proc.unref();
    }
  }

  static async planOf(
    app: Pick<App, "name" | "getConfig" | "cwdPath">,
    options: Pick<AppPreviewOptions, "paths" | "changed" | "csr">,
    changed: { paths: string[]; skipped: string[] },
    origin: string,
  ) {
    const typed = options.paths ?? [];
    if (options.changed && !changed.paths.length && !typed.length)
      throw new Error(
        `No page to open: ${changed.skipped.join("; ")}. Pass a concrete path, e.g. \`akan preview ${app.name} /memo/1\`.`,
      );
    const { i18n, api } = await app.getConfig();
    const { paths, asWritten } = AppPreview.#plan(typed, i18n, {
      csr: !!options.csr,
      apiPrefix: api.prefix,
      publicDir: path.join(app.cwdPath, "public"),
      pages: changed.paths,
    });
    const dev = new URL(origin);
    const isDevServer = (url: URL) =>
      url.protocol === dev.protocol && url.port === dev.port && AppPreview.#isLoopback(url.hostname);
    const elsewhere = [...new Set(typed)].filter((raw) => /^https?:\/\//.test(raw) && !isDevServer(new URL(raw)));
    const skipsBoot = [...new Set(asWritten)];
    const notes = [
      ...(elsewhere.length
        ? [
            `${elsewhere.join(", ")} ${elsewhere.length === 1 ? "names another server: its path opens" : "name other servers: their paths open"} on ${origin}.`,
          ]
        : []),
      ...(options.csr && skipsBoot.length
        ? [
            `--csr does not apply to ${skipsBoot.join(", ")}: ${skipsBoot.length === 1 ? "it opens" : "they open"} without the CSR boot.`,
          ]
        : []),
    ];
    return { paths, notes };
  }

  /** An unprefixed path answers with a redirect or a 503 where it does not name the default locale itself: under
   * `"always"`, and in a CSR boot, whose routes match on the locale segment. */
  static #plan(
    paths: string[],
    i18n: I18nLike,
    { csr, apiPrefix = "/api", publicDir = null, pages = [] }: PathRuleOptions,
  ) {
    const keepsUnprefixed = i18n.localePrefix === "as-needed" && !csr;
    const urlOf = (raw: string) => {
      const url = /^https?:\/\//.test(raw) ? new URL(raw) : AppPreview.probeUrlOf("http://localhost", raw);
      url.pathname = url.pathname.replace(/^\/{2,}/, "/");
      return url;
    };
    const asPage = (url: URL) => {
      const [first] = url.pathname.split("/").filter(Boolean);
      if (!keepsUnprefixed && (!first || !i18n.locales.includes(first)))
        url.pathname = `/${i18n.defaultLocale}${url.pathname === "/" ? "/" : url.pathname}`;
      if (csr) {
        url.searchParams.set("csr", "true");
        url.searchParams.set("akanMobileTarget", AppPreview.csrTarget);
      }
      return `${url.pathname}${url.search}`;
    };
    const asWritten: string[] = [];
    const typed = (paths.length || pages.length ? paths : ["/"]).map((raw) => {
      const url = urlOf(raw);
      if (!/^https?:\/\//.test(raw) && AppPreview.#isPagePath(url.pathname, i18n, { apiPrefix, publicDir }))
        return asPage(url);
      asWritten.push(raw);
      return `${url.pathname}${url.search}`;
    });
    const byScreenshot = new Map<string, string>();
    for (const pagePath of [...typed, ...pages.map((page) => asPage(urlOf(page)))]) {
      const name = AppPreview.screenshotName(pagePath);
      if (!byScreenshot.has(name)) byScreenshot.set(name, pagePath);
    }
    return { paths: [...byScreenshot.values()], asWritten };
  }

  //? RFC 6761 makes `*.localhost` loopback, and a connect to the unspecified address reaches this machine.
  static #isLoopback(hostname: string) {
    const name = hostname.replace(/\.$/, "");
    return (
      name === "localhost" ||
      name.endsWith(".localhost") ||
      /^127\.\d+\.\d+\.\d+$/.test(name) ||
      ["0.0.0.0", "[::1]", "[::]"].includes(name)
    );
  }

  //? Joined as text, not resolved: `new URL("//host/x", origin)` is protocol-relative and leaves the dev server.
  static probeUrlOf(origin: string, pagePath: string) {
    return new URL(`${origin}${pagePath.startsWith("/") ? "" : "/"}${pagePath}`);
  }

  static readonly #serverFiles = new Set([
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/openapi.json",
    "/mcp",
  ]);

  //? The server routes these outside `/:lang` and the locale proxy skips them, so a locale prefix 404s them.
  static #isPagePath(
    rawPath: string,
    i18n: I18nLike,
    { apiPrefix, publicDir }: { apiPrefix: string; publicDir: string | null },
  ) {
    const pathname = rawPath.replace(/(.)\/+$/, "$1");
    const segments = pathname.split("/").filter(Boolean);
    const [first] = segments;
    if (first && i18n.locales.includes(first)) return true;
    const prefixes = ["/_akan", "/__csr", "/__rsc", "/.well-known", apiPrefix.replace(/\/+$/, "")].filter(Boolean);
    if (prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
    if (AppPreview.#serverFiles.has(pathname)) return false;
    if (segments.length === 2 && segments[1] === "manifest.webmanifest") return false;
    return !(publicDir && AppPreview.#isPublicFile(publicDir, pathname));
  }

  static #isPublicFile(publicDir: string, pathname: string) {
    try {
      const root = path.resolve(publicDir);
      const filePath = path.resolve(root, `.${decodeURIComponent(pathname)}`);
      return filePath.startsWith(`${root}${path.sep}`) && statSync(filePath).isFile();
    } catch {
      return false;
    }
  }

  static readonly changedPageLimit = 8;

  static changedPages(sources: AppRouteSource[], changedFiles: Iterable<string>) {
    //? Real paths on both sides: a synced lib page is read through its symlink, and git names the lib's own file.
    const realOf = (file: string) => {
      try {
        return realpathSync(file);
      } catch {
        return file;
      }
    };
    const changed = new Set([...changedFiles].map(realOf));
    const routes = sources.map((source) => ({
      route: parseRouteModuleKey(source.key),
      touched: changed.has(realOf(source.absPath)),
    }));
    const layouts = routes
      .filter(({ route, touched }) => touched && route.kind === "layout")
      .map(({ route }) => route.routeSegments.join("/"));
    const reached: string[] = [];
    const skipped: string[] = [];
    let anyRoute = layouts.length > 0;
    for (const { route, touched } of routes) {
      if (route.kind !== "page") continue;
      anyRoute ||= touched;
      const segments = route.routeSegments;
      const reach = route.leaf === "_index" ? segments.length : segments.length - 1;
      const wrapped = layouts.some((layout) =>
        Array.from({ length: reach + 1 }, (_, idx) => segments.slice(0, idx).join("/")).includes(layout),
      );
      if (!touched && !wrapped) continue;
      const urlPath = route.pattern.replace(/^\/:lang/, "") || "/";
      if (urlPath.includes("/:")) skipped.push(`${urlPath} needs a concrete path`);
      else reached.push(urlPath);
    }
    if (!anyRoute) return { paths: ["/"], skipped };
    const paths = reached.sort((a, b) => a.localeCompare(b)).slice(0, AppPreview.changedPageLimit);
    if (reached.length > paths.length)
      skipped.push(`${reached.length - paths.length} more page(s) under a changed layout`);
    return { paths, skipped };
  }

  static screenshotName(pagePath: string) {
    const url = AppPreview.probeUrlOf("http://localhost", pagePath);
    const slugOf = (text: string) => text.replace(/[^\w-]/g, "_");
    const hashOf = (text: string) => Bun.hash(text).toString(36).slice(0, 6);
    const pathname = url.pathname.replace(/(.)\/+$/, "$1");
    const plain = pathname.split("/").filter(Boolean).join("-");
    //? Lower case only: on a case-insensitive disk, macOS's default, `/A` and `/a` would write one file.
    const isPlain = /^(\/[a-z0-9]+)*$/.test(pathname) && plain.length <= 80;
    const page = !plain ? "_index" : isPlain ? plain : `${slugOf(plain).slice(0, 80)}_${hashOf(pathname)}`;
    const boot = ["csr=true", `akanMobileTarget=${AppPreview.csrTarget}`];
    const pairs = url.search.slice(1).split("&").filter(Boolean);
    const isBoot = boot.every((pair) => pairs.includes(pair));
    const rest = isBoot ? pairs.filter((pair) => !boot.includes(pair)) : pairs;
    const params = [...new URLSearchParams(rest.join("&"))];
    const readable = slugOf(params.map(([key, value]) => `${key}-${value}`).join("-")).slice(0, 40);
    //? Hashed raw, not decoded: the probe sends the query as written, and `?a=b+c` and `?a=b%20c` decode alike.
    const query = rest.length ? `.${readable}-${hashOf(rest.join("&"))}` : "";
    return `${page}${query}${isBoot ? ".csr" : ""}.png`;
  }

  static attribute(page: AppPreviewPage, records: LogRecord[]) {
    const pathname = new URL(page.finalUrl).pathname;
    for (const record of records) {
      if (record.name === "ClientReport") {
        const href = typeof record.attrs?.href === "string" ? record.attrs.href : null;
        if (href && new URL(href, page.finalUrl).pathname !== pathname) continue;
        page.clientReports.push(record.message);
      } else page.serverErrors.push(AppPreview.#firstLines(`[${record.name}] ${record.message}`));
    }
    page.failed ||= page.clientReports.length > 0 || page.serverErrors.length > 0;
  }

  static render(report: AppPreviewReport) {
    const server = {
      running: "already running",
      started: `started for this preview and stopped; its log: ${report.serverLog}`,
      kept: `started for this preview and left running (pid ${report.serverPid}; stop it with \`${AppPreview.stopArgvOf(report.serverPid ?? 0).join(" ")}\`); its log: ${report.serverLog}`,
    }[report.server];
    const lines = [
      `${report.origin}: ${report.app} dev server, ${server}`,
      `${report.engine}, ${report.viewport.width}x${report.viewport.height}`,
    ];
    if (!report.logsRead) lines.push("The app's log socket did not answer, so client and server errors are not shown.");
    for (const reason of report.skipped) lines.push(`Not opened: ${reason}.`);
    for (const note of report.notes) lines.push(`Note: ${note}`);
    lines.push("");
    for (const page of report.pages) {
      const verdict = page.failed ? "FAIL" : page.domFindings.length || page.consoleWarnings.length ? "warn" : "ok";
      const landed = new URL(page.finalUrl).pathname;
      const moved = landed !== new URL(page.url).pathname ? ` -> ${landed}` : "";
      const status = page.status === null ? "---" : String(page.status);
      lines.push(
        `${verdict.padEnd(4)}  ${page.path}${moved}  ${status}  "${page.title}"  ${(page.ms / 1000).toFixed(1)}s`,
      );
      const items: [string, string[]][] = [
        ["error", page.error ? [page.error] : []],
        ["page", page.pageErrors],
        ["client", page.clientReports],
        ["server", page.serverErrors],
        ["console", [...page.consoleErrors, ...page.consoleWarnings]],
        ["dom", page.domFindings],
        [
          "text",
          page.text ? [JSON.stringify(page.text.length > 160 ? `${page.text.slice(0, 160)}...` : page.text)] : [],
        ],
        ["screenshot", page.screenshot ? [page.screenshot] : []],
      ];
      for (const [label, entries] of items)
        for (const entry of entries) lines.push(`  ${label}: ${entry.split("\n").join("\n    ")}`);
    }
    const failed = report.pages.filter((page) => page.failed).length;
    lines.push(
      "",
      failed ? `${failed} of ${report.pages.length} page(s) failed.` : `${report.pages.length} page(s) rendered.`,
    );
    return lines.join("\n");
  }

  static async #probe(
    origin: string,
    pagePath: string,
    {
      engine,
      viewport,
      screenshot,
      timeoutMs,
    }: {
      engine: PreviewEngine;
      viewport: { width: number; height: number };
      screenshot: string | null;
      timeoutMs: number;
    },
  ): Promise<AppPreviewPage> {
    const url = AppPreview.probeUrlOf(origin, pagePath).toString();
    const at = Date.now();
    const page: AppPreviewPage = {
      path: pagePath,
      url,
      finalUrl: url,
      status: null,
      title: "",
      text: "",
      ms: 0,
      failed: true,
      error: null,
      pageErrors: [],
      clientReports: [],
      serverErrors: [],
      consoleErrors: [],
      consoleWarnings: [],
      domFindings: [],
      screenshot: null,
    };
    try {
      const probe = await PreviewView.probe(url, {
        engine,
        ...viewport,
        screenshot: !!screenshot,
        timeoutMs,
        settleMs: AppPreview.settleMs,
      });
      Object.assign(page, {
        finalUrl: probe.finalUrl,
        status: probe.status,
        title: probe.title,
        text: probe.text,
        pageErrors: probe.pageErrors,
        consoleErrors: probe.consoleErrors,
        consoleWarnings: probe.consoleWarnings,
        domFindings: probe.domFindings,
      });
      if (screenshot && probe.screenshot) {
        await mkdir(path.dirname(screenshot), { recursive: true });
        await Bun.write(screenshot, Buffer.from(probe.screenshot, "base64"));
        page.screenshot = screenshot;
      }
      page.failed =
        (page.status !== null && page.status >= 400) || page.pageErrors.length > 0 || page.consoleErrors.length > 0;
    } catch (error) {
      page.error = error instanceof Error ? error.message : String(error);
    }
    page.ms = Date.now() - at;
    return page;
  }

  static async #changedPages(app: App) {
    const root = app.workspace.workspaceRoot;
    const changes = (await VerifyScope.changesIn(root)) ?? [];
    const files = changes.filter((change) => !change.code.includes("D")).map((change) => path.join(root, change.file));
    return AppPreview.changedPages(await app.getRouteSources(), files);
  }

  static async #tail(app: App, records: LogRecord[]) {
    const { LogTailClient } = await import("akanjs/server/logging/logTailClient");
    const socketPath = LogTailClient.socketPath(ApplicationRunner.runtimeDirOf(app));
    try {
      const client = await LogTailClient.connect(socketPath, { onRecord: (entry) => void records.push(entry.record) });
      await client.subscribe({ level: "error" });
      return client;
    } catch {
      return null;
    }
  }

  //? Detached so one group signal stops gateway, builder and replicas; never `--kill`, the port may be the user's.
  static async #startServer(app: App, port: number, previewDir: string): Promise<StartedServer> {
    await mkdir(previewDir, { recursive: true });
    const logPath = path.join(previewDir, "server.log");
    const { promise: settled, resolve: settle } = Promise.withResolvers<Awaited<StartedServer["settled"]>>();
    //? One descriptor for both streams, as `>log 2>&1` does; two sinks on one path would overwrite each other.
    const fd = openSync(logPath, "w");
    try {
      const proc = Bun.spawn([process.execPath, Bun.main, "start", app.name, "--plain"], {
        cwd: app.workspace.workspaceRoot,
        //? Supervised, so the host reports its boot over IPC: the health route hides readiness outside the local env.
        env: { ...process.env, AKAN_DEV_PORT: String(port), [DevSupervisor.supervisedEnvKey]: "1" },
        stdio: ["ignore", fd, fd],
        detached: true,
        ipc: (message: DevHostEvent) => {
          if (!message || typeof message !== "object") return;
          if ("booted" in message) settle({ state: "booted" });
          else if (message.state === "failed")
            settle({ state: "failed", ...(message.detail ? { detail: message.detail } : {}) });
        },
        serialization: "advanced",
        onExit: (_proc, exitCode) => settle({ state: "exited", detail: `exit code ${exitCode}` }),
      });
      return { proc, logPath, settled };
    } finally {
      closeSync(fd);
    }
  }

  static async #waitBooted({ settled, logPath }: StartedServer) {
    const { state, detail } = await AppPreview.#raceTimer(settled, DevSupervisor.bootTimeoutMs, {
      state: "timeout" as const,
      detail: undefined,
    });
    if (state === "booted") return;
    const what = {
      failed: "failed to boot",
      exited: "exited before it booted",
      timeout: `did not boot within ${DevSupervisor.bootTimeoutMs / 1000}s`,
    }[state];
    throw new Error(`The dev server this preview started ${what}${detail ? ` (${detail})` : ""}; see ${logPath}`);
  }

  //? Windows has no process groups or SIGINT; `taskkill /T` ends the tree, as DevPortReclaimer does.
  static stopArgvOf(pid: number, platform: NodeJS.Platform = process.platform) {
    return platform === "win32" ? ["taskkill", "/PID", String(pid), "/T", "/F"] : ["kill", "-INT", `-${pid}`];
  }

  static async #stopServer(proc: Bun.Subprocess) {
    if (proc.exitCode !== null) return;
    if (process.platform === "win32") {
      await HostProcessProbe.run(AppPreview.stopArgvOf(proc.pid));
      await AppPreview.#raceTimer(proc.exited, AppPreview.stopGraceMs, null);
      return;
    }
    const signal = (name: NodeJS.Signals) => {
      try {
        process.kill(-proc.pid, name);
      } catch {
        // The group is already gone.
      }
    };
    signal("SIGINT");
    const exited = await AppPreview.#raceTimer(
      proc.exited.then(() => true),
      AppPreview.stopGraceMs,
      false,
    );
    if (!exited) signal("SIGKILL");
  }

  //? A cleared timer, not `Bun.sleep`: a pending sleep keeps this process alive after the work it raced has won.
  static async #raceTimer<T, F>(work: Promise<T>, ms: number, fallback: F): Promise<T | F> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<F>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    });
    try {
      return await Promise.race([work, expired]);
    } finally {
      clearTimeout(timer);
    }
  }

  static #firstLines(text: string, count = 6) {
    return text.split("\n").slice(0, count).join("\n").slice(0, 2_000);
  }
}
