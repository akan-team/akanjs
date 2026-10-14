// What the Windows VM checks share: PowerShell with a deadline, polling, and the app page's DevTools socket, which a
// debug shell opens on AKAN_NATIVE_WEBVIEW2_DEBUG_PORT.

export function powershell(command: string, { timeoutMs = 60_000 }: { timeoutMs?: number } = {}): string {
  const p = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
  });
  if (p.exitedDueToTimeout) throw new Error(`PowerShell did not answer within ${timeoutMs / 1000} s: ${command}`);
  return p.stdout.toString().trim();
}

/** `check` every 250 ms until it answers; one that throws is asked again, and its last error named on timeout. */
export async function until<T>(
  what: string,
  check: () => T | undefined | false | Promise<T | undefined | false>,
  timeout = 30_000,
): Promise<T> {
  let last: unknown;
  for (const started = Date.now(); Date.now() - started < timeout; await Bun.sleep(250)) {
    const value = await Promise.resolve()
      .then(check)
      .catch((error: unknown) => {
        last = error;
        return undefined;
      });
    if (value) return value;
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (${String(last)})` : ""}`);
}

export interface Evaluated {
  value?: string;
  /** What the expression threw, as DevTools describes it. */
  exception?: string;
  /** The page went away before it answered: a relaunch, a quit or a crash the call itself caused. */
  closed?: boolean;
}

export interface BridgeAnswer<T = unknown> {
  ok: boolean;
  result?: T;
  error?: { code?: string; message?: string };
  closed?: boolean;
}

interface DevtoolsTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

interface EvaluateAnswer {
  result?: {
    result?: { value?: string };
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  };
}

export class AppPage {
  constructor(readonly port: number) {}

  async socket(): Promise<WebSocket> {
    const pages = (await (await fetch(`http://127.0.0.1:${this.port}/json`)).json()) as DevtoolsTarget[];
    const page = pages.find((p) => p.type === "page" && p.url.startsWith("https://app.localhost"));
    if (!page) throw new Error("no app page yet");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    return ws;
  }

  /** One DevTools Protocol call: its answer, or null when the page closed the socket before answering. */
  async call<T>(method: string, params: Record<string, unknown>, what: string, timeout = 10_000): Promise<T | null> {
    const ws = await this.socket();
    ws.send(JSON.stringify({ id: 1, method, params }));
    try {
      return await new Promise<T | null>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${what}: no answer`)), timeout);
        ws.onmessage = (event) => {
          const message = JSON.parse(String(event.data)) as { id?: number };
          if (message.id !== 1) return;
          clearTimeout(timer);
          resolve(message as T);
        };
        ws.onclose = () => {
          clearTimeout(timer);
          resolve(null);
        };
      });
    } finally {
      ws.close();
    }
  }

  async evaluate(expression: string, what: string, timeout = 10_000): Promise<Evaluated> {
    const answer = await this.call<EvaluateAnswer>(
      "Runtime.evaluate",
      { expression, awaitPromise: true },
      what,
      timeout,
    );
    if (!answer) return { closed: true };
    const details = answer.result?.exceptionDetails;
    if (details) return { exception: details.exception?.description ?? details.text ?? "an exception" };
    return { value: answer.result?.result?.value };
  }

  /** Calls a plugin method from the page, as a page does (the runtime's own request ids). */
  async bridge<T = unknown>(plugin: string, method: string, args?: unknown): Promise<BridgeAnswer<T>> {
    const request = JSON.stringify({ v: 1, plugin, method, ...(args === undefined ? {} : { args }) });
    const expression = `(async () => { const rt = window.__AKAN_NATIVE__.__runtime; const r = ${request};
    r.id = ++rt.nextId; return JSON.stringify(await rt.transport.send(r)); })()`;
    const answer = await this.evaluate(expression, `${plugin}.${method}`);
    if (answer.closed) return { ok: true, closed: true };
    if (answer.exception) throw new Error(`${plugin}.${method} threw in the page: ${answer.exception}`);
    return JSON.parse(answer.value ?? "{}") as BridgeAnswer<T>;
  }
}
