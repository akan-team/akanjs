import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Browser, Page } from "puppeteer";

export interface CsrE2eOptions {
  app: string;
  /** An `akan start` that is already running; without it the harness starts one on `port`. */
  url?: string;
  port?: number;
  /** Extra env for the `akan start` it spawns, e.g. `{ AKAN_DEV_CSR: "registry" }`. */
  env?: Record<string, string>;
  lang?: string;
  mobileTarget?: string;
  workspaceRoot?: string;
  startTimeoutMs?: number;
  viewport?: { width: number; height: number };
}

export interface CsrE2ePageContainer {
  path: string;
  hidden: boolean;
  inert: boolean;
  ariaHidden: boolean;
}

export interface CsrE2eProbe {
  renders: number;
  ticks: number;
  mountId: string;
  mounted: boolean;
  activity: string;
  focused: boolean;
  focusCount: number;
}

interface CsrE2eServer {
  proc: ReturnType<typeof Bun.spawn>;
  logPath: string;
}

const DEFAULT_PORT = 8391;
const RELOAD_MARKER = "__akanE2eBootMarker";
//? Longer than the frame's navigation lock (360ms after a transition commits, `webkit/useCsrValues.ts`).
const SETTLE_MS = 450;

/** Drives a CSR page (`?csr=true` + a mobile target) of a running `akan start` in headless Chrome. */
export class CsrE2eHarness {
  readonly origin: string;
  readonly page: Page;
  readonly #browser: Browser;
  readonly #server: CsrE2eServer | null;
  readonly #lang: string;
  readonly #mobileTarget: string;
  readonly #edited = new Map<string, string>();
  #marker = "";

  private constructor(options: {
    origin: string;
    page: Page;
    browser: Browser;
    server: CsrE2eServer | null;
    lang: string;
    mobileTarget: string;
  }) {
    this.origin = options.origin;
    this.page = options.page;
    this.#browser = options.browser;
    this.#server = options.server;
    this.#lang = options.lang;
    this.#mobileTarget = options.mobileTarget;
  }

  /** E2E suites run only with `AKAN_CSR_E2E=1`: they boot a dev server and a browser. */
  static get enabled() {
    return process.env.AKAN_CSR_E2E === "1";
  }

  static async start(options: CsrE2eOptions): Promise<CsrE2eHarness> {
    const workspaceRoot = options.workspaceRoot ?? CsrE2eHarness.#findWorkspaceRoot();
    const url = options.url ?? process.env.AKAN_CSR_E2E_URL;
    const port = options.port ?? Number(process.env.AKAN_CSR_E2E_PORT ?? DEFAULT_PORT);
    const server = url ? null : await CsrE2eHarness.#startServer({ ...options, workspaceRoot, port });
    const origin = new URL(url ?? `http://localhost:${port}`).origin;
    try {
      await CsrE2eHarness.#waitForHealth(origin, server, options.startTimeoutMs ?? 180_000);
      const puppeteer = (await import("puppeteer")).default;
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844, ...options.viewport });
      return new CsrE2eHarness({
        origin,
        page,
        browser,
        server,
        lang: options.lang ?? "en",
        mobileTarget: options.mobileTarget ?? "e2e",
      });
    } catch (error) {
      await CsrE2eHarness.#stopServer(server);
      throw error;
    }
  }

  /** Loads `path` (without the locale) as a CSR page and plants the marker `reloaded()` checks. */
  async open(path: string) {
    const url = new URL(`/${this.#lang}${path === "/" ? "" : path}`, this.origin);
    url.searchParams.set("csr", "true");
    url.searchParams.set("akanMobileTarget", this.#mobileTarget);
    await this.page.goto(url.toString(), { waitUntil: "load" });
    await this.waitFor(() => document.querySelector('[id^="pageContainer-"]') !== null, { timeout: 30_000 });
    this.#marker = Math.random().toString(36).slice(2);
    await this.page.evaluate(
      (key, value) => {
        (window as unknown as Record<string, string>)[key] = value;
      },
      RELOAD_MARKER,
      this.#marker,
    );
  }

  //? The CSR frame's own dev sync-navigation event: it calls the app router's push/replace, as a click would.
  //? The frame drops a navigation that starts while a transition runs, so each one waits the transition out.
  async navigate(href: string, kind: "push" | "replace" = "push", { settleMs = SETTLE_MS } = {}) {
    const target = new URL(href, this.origin);
    await this.page.evaluate(
      (next, how) => {
        window.dispatchEvent(new CustomEvent("akan:sync-navigation", { detail: { href: next, kind: how } }));
      },
      href,
      kind,
    );
    await this.waitFor(
      (pathname: string, search: string) =>
        location.pathname.endsWith(pathname) &&
        [...new URLSearchParams(search)].every(
          ([key, value]) => new URLSearchParams(location.search).get(key) === value,
        ),
      { args: [target.pathname, target.search], timeout: 10_000 },
    );
    await Bun.sleep(settleMs);
  }

  /** A history back through popstate, the path a native back button or a browser back takes. */
  async back({ settleMs = SETTLE_MS } = {}) {
    const before = await this.currentPath();
    await this.page.evaluate(() => {
      window.history.back();
    });
    await this.waitFor((path: string) => window.location.pathname + window.location.search !== path, {
      args: [before],
      timeout: 10_000,
    });
    await Bun.sleep(settleMs);
  }

  async waitFor<Args extends unknown[]>(
    predicate: (...args: Args) => unknown,
    { timeout = 5_000, args = [] as unknown as Args }: { timeout?: number; args?: Args } = {},
  ) {
    await this.page.waitForFunction(predicate as (...values: unknown[]) => unknown, { timeout, polling: 50 }, ...args);
  }

  async currentPath() {
    return await this.page.evaluate(() => window.location.pathname + window.location.search);
  }

  async containers(): Promise<CsrE2ePageContainer[]> {
    return await this.page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[id^="pageContainer-"]')].map((element) => ({
        path: element.id.slice("pageContainer-".length),
        hidden: getComputedStyle(element).display === "none",
        inert: element.inert || element.closest("[inert]") !== null,
        ariaHidden: element.closest('[aria-hidden="true"]') !== null,
      })),
    );
  }

  async probe(name: string): Promise<CsrE2eProbe | null> {
    return await this.page.evaluate(
      (probeName) =>
        (window as unknown as { __akanE2eProbes?: Record<string, CsrE2eProbe> }).__akanE2eProbes?.[probeName] ?? null,
      name,
    );
  }

  /** Ticks a probe gained over `ms` — 0 while its page's effects are paused. */
  async ticksOver(name: string, ms = 400) {
    const before = (await this.probe(name))?.ticks ?? 0;
    await Bun.sleep(ms);
    return ((await this.probe(name))?.ticks ?? 0) - before;
  }

  /** The tool names the in-page agent is offered right now, built-ins included. */
  async agentTools(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const holder = globalThis as unknown as {
        [key: symbol]: { snapshot: () => { tools: { name: string }[] } } | undefined;
      };
      return holder[Symbol.for("useAgentic.sharedSurface")]?.snapshot().tools.map((tool) => tool.name) ?? [];
    });
  }

  async text(selector: string) {
    return await this.page.evaluate(
      (target) =>
        [...document.querySelectorAll<HTMLElement>(target)]
          .filter((element) => element.checkVisibility())
          .map((element) => element.textContent ?? ""),
      selector,
    );
  }

  /** Whether the page reloaded since `open()`: the boot marker lives only in the page `open()` loaded. */
  async reloaded() {
    const marker = await this.page
      .evaluate((key) => (window as unknown as Record<string, string | undefined>)[key] ?? "", RELOAD_MARKER)
      .catch(() => "");
    return marker !== this.#marker;
  }

  /** Rewrites a workspace file for the duration of `run`, and always puts the original back. */
  async editSource<T>(file: string, transform: (source: string) => string, run: () => Promise<T>): Promise<T> {
    const absolute = path.resolve(file);
    const original = this.#edited.get(absolute) ?? (await Bun.file(absolute).text());
    const next = transform(original);
    if (next === original) throw new Error(`[csr-e2e] editSource left ${file} unchanged`);
    this.#edited.set(absolute, original);
    await Bun.write(absolute, next);
    try {
      return await run();
    } finally {
      await Bun.write(absolute, original);
      this.#edited.delete(absolute);
    }
  }

  async close() {
    for (const [file, original] of this.#edited) await Bun.write(file, original);
    this.#edited.clear();
    await this.#browser.close().catch(() => undefined);
    await CsrE2eHarness.#stopServer(this.#server);
  }

  static #findWorkspaceRoot() {
    let dir = import.meta.dir;
    for (;;) {
      if (existsSync(path.join(dir, "pkgs/@akanjs/cli/build.ts"))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error("[csr-e2e] workspace root not found above the harness");
      dir = parent;
    }
  }

  static async #startServer({
    app,
    port,
    env = {},
    workspaceRoot,
  }: CsrE2eOptions & { port: number; workspaceRoot: string }): Promise<CsrE2eServer> {
    const cli = path.join(workspaceRoot, "dist/pkgs/@akanjs/cli/index.js");
    if (!(await Bun.file(cli).exists()))
      throw new Error(`[csr-e2e] ${cli} is missing; build the CLI first (bun pkgs/@akanjs/cli/build.ts)`);
    const logDir = path.join(workspaceRoot, "local", "csr-e2e");
    await mkdir(logDir, { recursive: true });
    const logPath = path.join(logDir, `${app}-${port}.log`);
    //? Its own process group, so stopping it reaches the gateway, the builder and every replica it spawned.
    const proc = Bun.spawn(["bun", cli, "start", app, "--plain"], {
      cwd: workspaceRoot,
      env: { ...process.env, AKAN_DEV_PORT: String(port), ...env },
      stdout: Bun.file(logPath),
      stderr: Bun.file(logPath.replace(/\.log$/, ".err.log")),
      detached: true,
    });
    return { proc, logPath };
  }

  static async #waitForHealth(origin: string, server: CsrE2eServer | null, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (server && server.proc.exitCode !== null)
        throw new Error(`[csr-e2e] akan start exited with ${server.proc.exitCode}; see ${server.logPath}`);
      const ok = await fetch(`${origin}/_akan/app/health`)
        .then((res) => res.ok)
        .catch(() => false);
      if (ok) return;
      await Bun.sleep(500);
    }
    throw new Error(
      `[csr-e2e] ${origin} did not become healthy in ${timeoutMs}ms${server ? `; see ${server.logPath}` : ""}`,
    );
  }

  static async #stopServer(server: CsrE2eServer | null) {
    if (!server || server.proc.exitCode !== null) return;
    const group = -server.proc.pid;
    const signal = (name: NodeJS.Signals) => {
      try {
        process.kill(group, name);
      } catch {
        // The group is already gone.
      }
    };
    signal("SIGINT");
    const exited = await Promise.race([server.proc.exited.then(() => true), Bun.sleep(15_000).then(() => false)]);
    if (!exited) signal("SIGKILL");
  }
}
