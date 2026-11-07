import { closeSync, openSync, realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { DevHostEvent } from "@akanjs/devkit/akanApp";
import type { App } from "@akanjs/devkit/commandDecorators";
import type { AppRouteSource } from "@akanjs/devkit/executors";
import { PreviewChrome, type PreviewEngine, PreviewView } from "@akanjs/devkit/preview";
import { type LogRecord, parseRouteModuleKey } from "akanjs/common";
import { VerifyScope } from "../verify/verifyScope";
import { ApplicationRunner } from "./application.runner";
import { DevSupervisor } from "./devSupervisor";

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
  pages: AppPreviewPage[];
}

interface I18nLike {
  defaultLocale: string;
  locales: readonly string[];
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
    const { i18n } = await app.getConfig();
    const changed = options.changed ? await AppPreview.#changedPages(app) : { paths: [], skipped: [] };
    if (options.changed && !changed.paths.length && !options.paths?.length)
      throw new Error(
        `No page to open: ${changed.skipped.join("; ")}. Pass a concrete path, e.g. \`akan preview ${app.name} /memo/1\`.`,
      );
    const paths = AppPreview.pagePaths([...(options.paths ?? []), ...changed.paths], i18n, { csr: !!options.csr });
    const port = await app.getDevPort();
    const origin = `http://localhost:${port}`;
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
      pages: [],
    };
    try {
      if (started) await AppPreview.#waitBooted(started);
      const records: LogRecord[] = [];
      const tail = await AppPreview.#tail(app, records);
      report.logsRead = !!tail;
      try {
        for (const pagePath of paths) {
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

  /** Every route sits under `/:lang`, and an unprefixed path answers with a redirect or a 503. */
  static pagePaths(paths: string[], i18n: I18nLike, { csr }: { csr: boolean }) {
    const pages = (paths.length ? paths : ["/"]).map((raw) => {
      const url = new URL(/^https?:\/\//.test(raw) ? raw : `http://localhost${raw.startsWith("/") ? "" : "/"}${raw}`);
      const [first] = url.pathname.split("/").filter(Boolean);
      if (!first || !i18n.locales.includes(first))
        url.pathname = `/${i18n.defaultLocale}${url.pathname === "/" ? "/" : url.pathname}`;
      if (csr) {
        url.searchParams.set("csr", "true");
        url.searchParams.set("akanMobileTarget", AppPreview.csrTarget);
      }
      return `${url.pathname}${url.search}`;
    });
    return [...new Set(pages)];
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
    const url = new URL(pagePath, "http://localhost");
    const slug =
      url.pathname
        .split("/")
        .filter(Boolean)
        .join("-")
        .replace(/[^\w-]/g, "_") || "index";
    return `${slug}${url.searchParams.get("csr") === "true" ? ".csr" : ""}.png`;
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
      kept: `started for this preview and left running (pid ${report.serverPid}; stop it with \`kill -INT -${report.serverPid}\`); its log: ${report.serverLog}`,
    }[report.server];
    const lines = [
      `${report.origin}: ${report.app} dev server, ${server}`,
      `${report.engine}, ${report.viewport.width}x${report.viewport.height}`,
    ];
    if (!report.logsRead) lines.push("The app's log socket did not answer, so client and server errors are not shown.");
    for (const reason of report.skipped) lines.push(`Not opened: ${reason}.`);
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
    const url = new URL(pagePath, origin).toString();
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

  static async #stopServer(proc: Bun.Subprocess) {
    if (proc.exitCode !== null) return;
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
