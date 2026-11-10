import { PreviewChrome, type PreviewEngine } from "./PreviewChrome";

export interface PreviewProbeOptions {
  screenshot?: boolean;
  width?: number;
  height?: number;
  engine?: PreviewEngine;
  startTimeoutMs?: number;
  /** Bounds the probe once the browser is up: a dev server that is recovering takes the connection and never answers. */
  timeoutMs?: number;
  /** Waited after the load, so the errors effects throw land before the page is read. */
  settleMs?: number;
}

export interface PreviewProbeResult {
  url: string;
  finalUrl: string;
  status: number | null;
  title: string;
  text: string;
  consoleErrors: string[];
  consoleWarnings: string[];
  pageErrors: string[];
  /** Cheap structural smells that read as "the page is broken" without anyone looking at it. */
  domFindings: string[];
  screenshot?: string;
}

interface WebViewLike {
  navigate(url: string): Promise<void>;
  evaluate(expression: string): Promise<unknown>;
  screenshot(options: { encoding: "base64" }): Promise<string>;
  close(): void | Promise<void>;
}

interface PageRead {
  href: string;
  title: string;
  text: string;
  status: number | null;
  empty: boolean;
  pageErrors: string[];
  domFindings: string[];
}

// Bun.WebView rather than a downloaded browser: on macOS its webkit backend needs no Chromium at all.
// It is experimental, so its whole surface stays behind this adapter; a Bun minor that changes it breaks one file.
export class PreviewView {
  /** A view's first navigation includes the browser's start, which took ~35 s on a cold CI runner. */
  static readonly startTimeoutMs = 120_000;
  static readonly #unstarted = new Map<PreviewEngine, Error>();

  static get available() {
    return PreviewView.isAvailable();
  }

  static isAvailable(engine: PreviewEngine = PreviewChrome.backend) {
    return typeof (Bun as unknown as { WebView?: unknown }).WebView === "function" && PreviewChrome.isAvailable(engine);
  }

  static unavailableReason(engine: PreviewEngine = PreviewChrome.backend) {
    if (typeof (Bun as unknown as { WebView?: unknown }).WebView !== "function")
      return "This Bun build has no WebView, so the page preview is off.";
    return PreviewChrome.unavailableReason(engine);
  }

  static async probe(
    url: string,
    {
      screenshot = false,
      width = 1280,
      height = 800,
      engine = PreviewChrome.backend,
      startTimeoutMs = PreviewView.startTimeoutMs,
      timeoutMs = 30_000,
      settleMs = 0,
    }: PreviewProbeOptions = {},
  ): Promise<PreviewProbeResult> {
    //? Bun spawns the browser once per process, so one that did not start will not start for a later page either.
    const unstarted = PreviewView.#unstarted.get(engine);
    if (unstarted) throw unstarted;
    const logs: string[] = [];
    const view = PreviewView.#open({ width, height, engine, onConsole: (line) => logs.push(line) });
    try {
      const stalled = new Error(`Timed out starting the ${engine} browser after ${startTimeoutMs / 1_000} s.`);
      await PreviewView.#within(view.navigate("about:blank"), Date.now() + startTimeoutMs, stalled).catch(
        (error: unknown) => {
          if (error === stalled) PreviewView.#unstarted.set(engine, stalled);
          throw error;
        },
      );
      const deadline = Date.now() + timeoutMs;
      const within = <T>(work: Promise<T>, what: string) =>
        PreviewView.#within(
          work,
          deadline,
          new Error(`Timed out ${what} ${url}; the dev server may be rebuilding or stuck.`),
        );
      let page = await PreviewView.#load(view, url, settleMs, within);
      //? Right after a save the first load can render nothing (`[rscClient] module not loaded`); the next one has it.
      if (page.empty) {
        logs.length = 0;
        page = await PreviewView.#load(view, url, settleMs, within);
      }
      const result: PreviewProbeResult = {
        url,
        finalUrl: page.href,
        status: page.status ?? (await PreviewView.#statusOf(page.href, deadline)),
        title: page.title,
        text: page.text,
        consoleErrors: logs.filter((line) => line.startsWith("error")),
        consoleWarnings: logs.filter((line) => line.startsWith("warn")),
        pageErrors: page.pageErrors,
        domFindings: page.domFindings,
      };
      if (screenshot) result.screenshot = await within(view.screenshot({ encoding: "base64" }), "screenshotting");
      return result;
    } finally {
      await view.close();
    }
  }

  static async #load(
    view: WebViewLike,
    url: string,
    settleMs: number,
    within: <T>(work: Promise<T>, what: string) => Promise<T>,
  ): Promise<PageRead> {
    await within(view.navigate(url), "loading");
    if (settleMs > 0) await Bun.sleep(settleMs);
    const read = (await within(view.evaluate(readPageExpression), "reading")) as Partial<PageRead> | null;
    return {
      href: typeof read?.href === "string" ? read.href : url,
      title: typeof read?.title === "string" ? read.title : "",
      text: typeof read?.text === "string" ? read.text : "",
      status: typeof read?.status === "number" && read.status > 0 ? read.status : null,
      empty: read?.empty === true,
      pageErrors: PreviewView.#strings(read?.pageErrors),
      domFindings: PreviewView.#strings(read?.domFindings),
    };
  }

  //? webkit has no Navigation Timing `responseStatus`, so the status comes from asking the server again, unredirected.
  static async #statusOf(href: string, deadline: number) {
    const left = Math.max(1, deadline - Date.now());
    const response = await fetch(href, { redirect: "manual", signal: AbortSignal.timeout(left) }).catch(() => null);
    return response?.status ?? null;
  }

  static async #within<T>(work: Promise<T>, deadline: number, expiry: Error): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(expiry), Math.max(0, deadline - Date.now()));
    });
    try {
      return await Promise.race([work, expired]);
    } finally {
      clearTimeout(timer);
    }
  }

  static #open({
    width,
    height,
    engine,
    onConsole,
  }: {
    width: number;
    height: number;
    engine: PreviewEngine;
    onConsole: (line: string) => void;
  }) {
    const Ctor = (Bun as unknown as { WebView: new (options: unknown) => WebViewLike }).WebView;
    return new Ctor({
      width,
      height,
      dataStore: "ephemeral",
      backend: PreviewChrome.backendOption(engine),
      // The console option is a callback taking `(type, ...args)`, not an object of console methods.
      console: (type: string, ...args: unknown[]) => onConsole(`${type} ${PreviewView.formatConsole(args)}`),
    });
  }

  /** Substitutes `%s` as the console does, since React passes a warning's detail as arguments, and cuts it short. */
  static formatConsole(args: unknown[]) {
    const [first, ...rest] = args;
    const head =
      typeof first === "string"
        ? first.replace(/%[sdifoOc]/g, (token) => {
            if (!rest.length) return token;
            const value = rest.shift();
            return token === "%c" ? "" : String(value);
          })
        : String(first);
    return [head, ...rest.map(String)]
      .join(" ")
      .replace(/\n(\s*\n)+/g, "\n")
      .slice(0, 1_500);
  }

  static #strings(value: unknown) {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  }
}

// evaluate() takes one expression (a statement list is a SyntaxError), hence the IIFE; one call in flight per view.
// `view.title` is only refreshed by a navigation, so the title is read from the document.
const readPageExpression = `(() => {
  const pageErrors = [];
  const domFindings = [];
  const body = document.body;
  const rendered = body ? Array.from(body.children).filter((el) => !["SCRIPT", "STYLE", "TEMPLATE", "LINK", "NOSCRIPT"].includes(el.tagName) && !el.classList.contains("__akan_hmr_overlay")) : [];
  const empty = !rendered.length && !(body && body.innerText && body.innerText.trim());
  if (empty) pageErrors.push("The page body rendered empty.");
  if (self.__AKAN_HMR_SYSTEM_PAGE__) pageErrors.push("The server could not render this page and answered with its error page: " + (body ? body.innerText.trim().replace(/\\s+/g, " ").slice(0, 400) : ""));
  const overlay = document.querySelector('.__akan_hmr_overlay[data-status="error"]');
  if (overlay) pageErrors.push("The dev build failed: " + overlay.textContent.trim().slice(0, 400));
  const all = Array.from(document.querySelectorAll("body *"));
  const viewportWidth = document.documentElement.clientWidth;
  const pageWidth = document.documentElement.scrollWidth;
  if (pageWidth > viewportWidth + 8) {
    const wide = all.find((el) => el.getBoundingClientRect().right > viewportWidth + 8);
    domFindings.push("The page is " + pageWidth + "px wide in a " + viewportWidth + "px viewport" + (wide ? ", first wider element: " + (wide.tagName.toLowerCase() + "." + (typeof wide.className === "string" ? wide.className : "")).slice(0, 120) : "") + ".");
  }
  const invisibleText = all.filter((el) => {
    if (!el.textContent || !el.textContent.trim()) return false;
    const style = getComputedStyle(el);
    return style.color === style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)";
  });
  if (invisibleText.length) domFindings.push(invisibleText.length + " element(s) render text in the same colour as their background.");
  const unresolved = all.filter((el) => /(^|\\s)(bg|text|border)-(base-100|base-content|primary-content|error)(\\s|$)/.test(typeof el.className === "string" ? el.className : ""));
  if (unresolved.length) domFindings.push(unresolved.length + " element(s) use a dropped daisyUI colour slot that renders no CSS.");
  const navigation = performance.getEntriesByType("navigation")[0];
  const status = navigation && typeof navigation.responseStatus === "number" ? navigation.responseStatus : null;
  const text = body ? body.innerText.trim().replace(/\\s+/g, " ").slice(0, 600) : "";
  return { href: location.href, title: document.title, text, status, empty, pageErrors, domFindings };
})()`;
