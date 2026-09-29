import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

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
  /** `webkit` is macOS only; elsewhere, or with `AKAN_CSR_E2E_BACKEND=chrome`, an installed Chrome is driven. */
  backend?: "webkit" | "chrome";
}

export interface CsrE2ePageContainer {
  key: string;
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

/** Drives a page of a running `akan start` in a headless `Bun.WebView`: CSR (`?csr=true` + a mobile target) or SSR. */
export class CsrE2eHarness {
  readonly origin: string;
  readonly #view: Bun.WebView;
  readonly #server: CsrE2eServer | null;
  readonly #lang: string;
  readonly #mobileTarget: string;
  readonly #edited = new Map<string, string>();
  readonly #console: string[];
  #marker = "";
  #csr: boolean = true;

  private constructor(options: {
    origin: string;
    view: Bun.WebView;
    server: CsrE2eServer | null;
    lang: string;
    mobileTarget: string;
    console: string[];
  }) {
    this.origin = options.origin;
    this.#view = options.view;
    this.#console = options.console;
    this.#server = options.server;
    this.#lang = options.lang;
    this.#mobileTarget = options.mobileTarget;
  }

  /** What keeps this host from driving a page, or null when a `Bun.WebView` opens one and answers. */
  static async preflight(backend = CsrE2eHarness.#defaultBackend()): Promise<string | null> {
    if (typeof (Bun as { WebView?: unknown }).WebView !== "function") return `Bun ${Bun.version} has no Bun.WebView`;
    let view: Bun.WebView | null = null;
    try {
      const opened = new Bun.WebView({
        width: 320,
        height: 240,
        backend: backend === "chrome" ? { type: "chrome", url: false } : backend,
      });
      view = opened;
      const answer = await Promise.race([
        opened.navigate("about:blank").then(async () => await opened.evaluate<number>("1 + 1")),
        Bun.sleep(30_000).then(() => null),
      ]);
      return answer === 2 ? null : `a ${backend} Bun.WebView did not answer within 30s`;
    } catch (error) {
      return `a ${backend} Bun.WebView cannot start: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      view?.close();
    }
  }

  /** E2E suites run only with `AKAN_CSR_E2E=1`: they boot a dev server and a browser. */
  static get enabled() {
    return process.env.AKAN_CSR_E2E === "1";
  }

  static async start(options: CsrE2eOptions): Promise<CsrE2eHarness> {
    const workspaceRoot = options.workspaceRoot ?? CsrE2eHarness.#findWorkspaceRoot();
    const url = options.url ?? process.env.AKAN_CSR_E2E_URL;
    //? A running server took its env when it started: a suite's hooks would be dropped and its checks pass for nothing.
    if (url && Object.keys(options.env ?? {}).length > 0)
      throw new Error(
        `[csr-e2e] this suite starts its dev server with ${Object.keys(options.env ?? {}).join(", ")}, which the server at ${url} does not have; unset AKAN_CSR_E2E_URL`,
      );
    const port = options.port ?? Number(process.env.AKAN_CSR_E2E_PORT ?? DEFAULT_PORT);
    const server = url ? null : await CsrE2eHarness.#startServer({ ...options, workspaceRoot, port });
    const origin = new URL(url ?? `http://localhost:${port}`).origin;
    try {
      await CsrE2eHarness.#waitForHealth(origin, server, options.startTimeoutMs ?? 180_000);
      const { width, height } = { width: 390, height: 844, ...options.viewport };
      const backend = options.backend ?? CsrE2eHarness.#defaultBackend();
      const messages: string[] = [];
      const print = process.env.AKAN_CSR_E2E_CONSOLE === "1";
      //? `url: false` spawns a fresh Chrome instead of attaching to one the developer runs with remote debugging on.
      const view = new Bun.WebView({
        width,
        height,
        backend: backend === "chrome" ? { type: "chrome", url: false } : backend,
        //? Kept for `consoleMessages()`; AKAN_CSR_E2E_CONSOLE=1 also prints it, the only view of a hydration warning or
        //? a failed patch. An uncaught error is not a console call and never arrives here.
        console: (type: string, ...args: unknown[]) => {
          messages.push(`[${type}] ${args.map(CsrE2eHarness.#formatArg).join(" ")}`);
          if (print) globalThis.console.info(`[page ${type}]`, ...args);
        },
      });
      return new CsrE2eHarness({
        origin,
        view,
        server,
        lang: options.lang ?? "en",
        mobileTarget: options.mobileTarget ?? "e2e",
        console: messages,
      });
    } catch (error) {
      await CsrE2eHarness.#stopServer(server);
      throw error;
    }
  }

  /** Loads `path` (without the locale), as CSR unless `csr: false`, and plants the marker `reloaded()` checks. */
  async open(path: string, { csr = true }: { csr?: boolean } = {}) {
    const url = new URL(`/${this.#lang}${path === "/" ? "" : path}`, this.origin);
    if (csr) {
      url.searchParams.set("csr", "true");
      url.searchParams.set("akanMobileTarget", this.#mobileTarget);
    }
    this.#csr = csr;
    this.#console.length = 0;
    await this.#view.navigate(url.toString());
    await this.#markBoot();
  }

  /**
   * Reloads the page where it is, as a WebView does after its content process died, and marks the new boot. Returns
   * the `performance.timeOrigin` of the first document seen after it: one that differs later was reloaded again.
   */
  async reload(): Promise<number> {
    await this.#view.reload();
    //? On the WebKit backend `reload()` resolves before the old document is gone; its marker going is the reload.
    await this.waitFor(
      (key: string, previous: string) => (window as unknown as Record<string, string | undefined>)[key] !== previous,
      { args: [RELOAD_MARKER, this.#marker], timeout: 30_000 },
    );
    const timeOrigin = await this.evaluate(() => performance.timeOrigin);
    await this.#markBoot();
    return timeOrigin;
  }

  //? An SSR page has no page stack; `rscClient` installs its refresh hook in the root's layout effect, once hydrated.
  async #markBoot() {
    if (this.#csr)
      await this.waitFor(() => document.querySelector('[id^="pageContainer-"]') !== null, { timeout: 30_000 });
    else
      await this.waitFor(
        () => typeof (globalThis as unknown as { __AKAN_RSC_REFRESH__?: unknown }).__AKAN_RSC_REFRESH__ === "function",
        { timeout: 30_000 },
      );
    await Bun.sleep(SETTLE_MS);
    this.#marker = Math.random().toString(36).slice(2);
    await this.evaluate(
      (key: string, value: string) => {
        (window as unknown as Record<string, string>)[key] = value;
      },
      RELOAD_MARKER,
      this.#marker,
    );
  }

  /** Reports the document as `state` and tells the page, as an app moving to or from the background does. */
  async setVisibility(state: "hidden" | "visible") {
    await this.evaluate((next: string) => {
      Object.defineProperty(document, "visibilityState", { value: next, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
    await Bun.sleep(50);
  }

  //? The CSR frame's own dev sync-navigation event: it calls the app router's push/replace, as a click would.
  //? The frame drops a navigation that starts while a transition runs, so each one waits the transition out.
  async navigate(href: string, kind: "push" | "replace" = "push", { settleMs = SETTLE_MS } = {}) {
    const target = new URL(href, this.origin);
    await this.evaluate(
      (next: string, how: string) => {
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
    await this.go(-1, { settleMs });
  }

  async go(delta: number, { settleMs = SETTLE_MS } = {}) {
    const before = await this.currentPath();
    await this.evaluate((steps: number) => {
      window.history.go(steps);
    }, delta);
    await this.waitFor((path: string) => window.location.pathname + window.location.search !== path, {
      args: [before],
      timeout: 10_000,
    });
    await Bun.sleep(settleMs);
  }

  /**
   * Runs `fn` in the page. Only its source crosses, so it closes over nothing; `args` and the result travel as JSON.
   */
  async evaluate<Args extends unknown[], Result>(fn: (...args: Args) => Result, ...args: Args) {
    return await this.#view.evaluate<Awaited<Result>>(`(${fn.toString()})(...${JSON.stringify(args)})`);
  }

  //? A poll that lands while the page reloads rejects; it is retried, so a wait spans a reload.
  async waitFor<Args extends unknown[]>(
    predicate: (...args: Args) => unknown,
    { timeout = 5_000, args = [] as unknown as Args }: { timeout?: number; args?: Args } = {},
  ) {
    const deadline = Date.now() + timeout;
    let lastError: unknown = null;
    for (;;) {
      try {
        if (await this.evaluate(predicate, ...args)) return;
        lastError = null;
      } catch (error) {
        lastError = error;
      }
      if (Date.now() >= deadline) break;
      await Bun.sleep(50);
    }
    throw new Error(`[csr-e2e] waitFor timed out after ${timeout}ms: ${predicate.toString()}`, { cause: lastError });
  }

  async currentPath() {
    return await this.evaluate(() => window.location.pathname + window.location.search);
  }

  async containers(): Promise<CsrE2ePageContainer[]> {
    return await this.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[id^="pageContainer-"]')].map((element) => ({
        key: element.id.slice("pageContainer-".length),
        path: element.dataset.path ?? element.id.slice("pageContainer-".length),
        hidden: getComputedStyle(element).display === "none",
        inert: element.inert || element.closest("[inert]") !== null,
        ariaHidden: element.closest('[aria-hidden="true"]') !== null,
      })),
    );
  }

  async probe(name: string): Promise<CsrE2eProbe | null> {
    return await this.evaluate(
      (probeName: string) =>
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
    return await this.evaluate(() => {
      const holder = globalThis as unknown as {
        [key: symbol]: { snapshot: () => { tools: { name: string }[] } } | undefined;
      };
      return holder[Symbol.for("useAgentic.sharedSurface")]?.snapshot().tools.map((tool) => tool.name) ?? [];
    });
  }

  /** Text of every rendered match; `{ mounted: true }` reads hidden ones too, which is how a parked page is seen. */
  async text(selector: string, { mounted = false }: { mounted?: boolean } = {}) {
    return await this.evaluate(
      (target: string, all: boolean) =>
        [...document.querySelectorAll<HTMLElement>(target)]
          .filter((element) => all || element.checkVisibility())
          .map((element) => element.textContent ?? ""),
      selector,
      mounted,
    );
  }

  /** Waits until the rendered matches read `expected`, for a step whose cost is a mount rather than a transition. */
  async waitForText(selector: string, expected: string[], { timeout = 5_000 } = {}) {
    await this.waitFor(
      (target: string, want: string[]) =>
        JSON.stringify(
          [...document.querySelectorAll<HTMLElement>(target)]
            .filter((element) => element.checkVisibility())
            .map((element) => element.textContent ?? ""),
        ) === JSON.stringify(want),
      { args: [selector, expected], timeout },
    );
  }

  async values(selector: string) {
    return await this.evaluate(
      (target: string) => [...document.querySelectorAll<HTMLInputElement>(target)].map((element) => element.value),
      selector,
    );
  }

  //? `Bun.WebView.type` inserts into the focused element as a paste does: `input` fires, `keydown` does not.
  async type(selector: string, text: string) {
    const focused = await this.evaluate((target: string) => {
      const element = document.querySelector<HTMLElement>(target);
      element?.focus();
      return element !== null && document.activeElement === element;
    }, selector);
    if (!focused) throw new Error(`[csr-e2e] type: ${selector} is not a focusable element on the page`);
    await this.#view.type(text);
  }

  /** The process group of the `akan start` this harness spawned; null when it drives a running one. */
  get serverGroup(): number | null {
    return this.#server?.proc.pid ?? null;
  }

  /** Where the spawned `akan start`'s stdout and stderr end now, for `serverLogSince`. */
  async serverLogMark(): Promise<{ out: number; err: number }> {
    const [out, err] = await this.#serverLogs();
    return { out: out.length, err: err.length };
  }

  /** What the spawned `akan start` wrote to stdout and stderr since `mark`; empty when it drives a running one. */
  async serverLogSince(mark: { out: number; err: number } = { out: 0, err: 0 }): Promise<string> {
    const [out, err] = await this.#serverLogs();
    return `${out.slice(mark.out)}${err.slice(mark.err)}`;
  }

  async #serverLogs(): Promise<[string, string]> {
    if (!this.#server) return ["", ""];
    const read = async (file: string) =>
      await Bun.file(file)
        .text()
        .catch(() => "");
    const { logPath } = this.#server;
    return [await read(logPath), await read(logPath.replace(/\.log$/, ".err.log"))];
  }

  /** The page's console calls since `open()`, as `[type] text`. */
  consoleMessages(): string[] {
    return [...this.#console];
  }

  /** Whether the page reloaded since `open()`: the boot marker lives only in the page `open()` loaded. */
  async reloaded() {
    const marker = await this.evaluate(
      (key: string) => (window as unknown as Record<string, string | undefined>)[key] ?? "",
      RELOAD_MARKER,
    ).catch(() => "");
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
    this.#view.close();
    await CsrE2eHarness.#stopServer(this.#server);
  }

  static #formatArg(arg: unknown): string {
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(arg) ?? String(arg);
    } catch {
      // A circular descriptor still names itself.
      return String(arg);
    }
  }

  static #defaultBackend(): "webkit" | "chrome" {
    const requested = process.env.AKAN_CSR_E2E_BACKEND;
    if (requested === "webkit" || requested === "chrome") return requested;
    return process.platform === "darwin" ? "webkit" : "chrome";
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
    //? The dev host runs from the CLI's dist bundle while the builder runs from source: a stale dist tests an old host.
    //? The build is a no-op when its stamp matches the sources.
    const built = Bun.spawnSync(["bun", path.join(workspaceRoot, "pkgs/@akanjs/cli/build.ts")], { cwd: workspaceRoot });
    if (built.exitCode !== 0) throw new Error(`[csr-e2e] building the CLI failed: ${built.stderr.toString()}`);
    const cli = path.join(workspaceRoot, "dist/pkgs/@akanjs/cli/index.js");
    const logDir = path.join(workspaceRoot, "local", "csr-e2e");
    await mkdir(logDir, { recursive: true });
    const logPath = path.join(logDir, `${app}-${port}.log`);
    const errPath = logPath.replace(/\.log$/, ".err.log");
    //? A `Bun.file` sink writes from offset 0 without truncating, so the last run's tail would outlive this one's start.
    await Promise.all([Bun.write(logPath, ""), Bun.write(errPath, "")]);
    //? Its own process group, so stopping it reaches the gateway, the builder and every replica it spawned. That group
    //? outlives a run killed before it could stop it, so `--kill` takes the suite's own port back from it first.
    const proc = Bun.spawn(["bun", cli, "start", app, "--plain", "--kill"], {
      cwd: workspaceRoot,
      env: { ...process.env, AKAN_DEV_PORT: String(port), ...env },
      stdout: Bun.file(logPath),
      stderr: Bun.file(errPath),
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
