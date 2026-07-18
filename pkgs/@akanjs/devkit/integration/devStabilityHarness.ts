import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface DevStabilityFixture {
  appName: string;
  appDir: string;
  workspaceRoot: string;
  port: number;
}

export interface DevStabilityHost {
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  logs: string[];
  markLog(): number;
  waitForLog(pattern: RegExp, timeoutMs?: number): Promise<RegExpMatchArray>;
  waitForLogSince(mark: number, pattern: RegExp, timeoutMs?: number): Promise<RegExpMatchArray>;
  stop(): Promise<void>;
}

export interface DevStabilityHmrProbe {
  ws: WebSocket;
  messages: unknown[];
  mark(): number;
  waitForMessageSince(mark: number, predicate: (message: unknown) => boolean, timeoutMs?: number): Promise<unknown>;
  waitForNoMessageSince(mark: number, predicate: (message: unknown) => boolean, quietMs?: number): Promise<void>;
  close(): void;
}

const DEFAULT_TIMEOUT_MS = 60_000;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class DevStabilityHarness {
  readonly workspaceRoot: string;
  readonly appName: string;
  readonly appDir: string;
  readonly portOffset: number;
  #host: DevStabilityHost | null = null;

  constructor({
    workspaceRoot = path.resolve(import.meta.dir, "../../../.."),
    appName = `zz-dev-stability-${process.pid}-${Date.now()}`,
    portOffset = 3_000 + Math.floor(Math.random() * 1_000),
  }: {
    workspaceRoot?: string;
    appName?: string;
    portOffset?: number;
  } = {}) {
    this.workspaceRoot = workspaceRoot;
    this.appName = appName;
    this.appDir = path.join(workspaceRoot, "apps", appName);
    this.portOffset = portOffset;
  }

  async createFixture(): Promise<DevStabilityFixture> {
    await rm(this.appDir, { recursive: true, force: true });
    await Promise.all([
      mkdir(path.join(this.appDir, "page"), { recursive: true }),
      mkdir(path.join(this.appDir, "common"), { recursive: true }),
      mkdir(path.join(this.appDir, "srvkit"), { recursive: true }),
      mkdir(path.join(this.appDir, "ui"), { recursive: true }),
      mkdir(path.join(this.appDir, "webkit"), { recursive: true }),
      mkdir(path.join(this.appDir, "lib"), { recursive: true }),
      mkdir(path.join(this.appDir, "env"), { recursive: true }),
      mkdir(path.join(this.appDir, "public"), { recursive: true }),
    ]);
    await Promise.all([
      this.writeFile(
        "main.ts",
        `import { AkanApp } from "akanjs/server";

const run = async () => {
  await new AkanApp("./server").start();
};
void run();
`,
      ),
      this.writeFile(
        "akan.config.ts",
        `import type { AppConfig } from "akanjs";

const config: AppConfig = {};
export default config;
`,
      ),
      this.writeFile(
        "package.json",
        `{
  "type": "module",
  "name": "${this.appName}",
  "version": "0.0.1"
}
`,
      ),
      this.writeFile(
        "tsconfig.json",
        `{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "resolveJsonModule": true,
    "jsx": "preserve"
  },
  "include": ["./**/*.ts", "./**/*.tsx"]
}
`,
      ),
      this.writeFile(
        "env/env.client.ts",
        `import { getEnv } from "akanjs/base";

export const env = {
  ...getEnv(),
} as const;
`,
      ),
      this.writeFile(
        "env/env.server.ts",
        `import { getEnv } from "akanjs/base";

export const env = {
  ...getEnv(),
} as const;
`,
      ),
      this.writeFile(
        "env/env.server.testing.ts",
        `export { env } from "./env.server";
`,
      ),
      this.writeFile(
        "lib/option.ts",
        `import { AkanOption } from "akanjs/server";

export type ModulesOptions = Record<string, never>;
export const option = new AkanOption<ModulesOptions>();
`,
      ),
      this.writeFile(
        "server.ts",
        `import { AkanServer, AkanLib } from "akanjs/server";
import { backendMarker } from "./srvkit/backendMarker";

void backendMarker;

export const lib = new AkanLib("${this.appName}", {});
export const server = new AkanServer("${this.appName}", {
  appName: "${this.appName}",
  env: "local",
  operation: "local",
  publicOrigin: "http://localhost",
  serveDomain: "localhost",
} as never, undefined, lib);
`,
      ),
      this.writeFile(
        "page/_layout.tsx",
        `import "./styles.css";
import type { LayoutProps } from "akanjs/client";

export default function Layout({ children }: LayoutProps) {
  return <>{children}</>;
}
`,
      ),
      this.writeFile(
        "page/_index.tsx",
        `import { marker } from "../common/marker";
import { ClientMarker } from "../ui/ClientMarker";

export default function Page() {
  return (
    <main>
      <h1>Dev stability fixture</h1>
      <p data-testid="marker">{marker}</p>
      <ClientMarker />
    </main>
  );
}
`,
      ),
      this.writeFile(
        "page/styles.css",
        `main {
  color: black;
}
`,
      ),
      this.writeFile(
        "common/marker.ts",
        `export const marker = "initial-shared-marker";
`,
      ),
      this.writeFile(
        "srvkit/backendMarker.ts",
        `export const backendMarker = "initial-backend-marker";
`,
      ),
      this.writeFile(
        "lib/_fixture/fixture.service.ts",
        `import { serve } from "akanjs/service";

export class FixtureService extends serve("fixture" as const, { serverMode: "batch" }, () => ({})) {}
`,
      ),
      this.writeFile(
        "lib/_fixture/fixture.signal.ts",
        `import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class FixtureInternal extends internal(srv.fixture, () => ({})) {}

export class FixtureEndpoint extends endpoint(srv.fixture, () => ({})) {}
`,
      ),
      this.writeFile(
        "lib/_fixture/fixture.dictionary.ts",
        `import { serviceDictionary } from "akanjs/dictionary";

import type { FixtureEndpoint } from "./fixture.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<FixtureEndpoint>(() => ({}))
  .translate({
    hello: ["Initial Dictionary", "초기 사전"],
    removeMe: ["Remove Me", "삭제 예정"],
  });
`,
      ),
      this.writeFile(
        "ui/ClientMarker.tsx",
        `export function ClientMarker() {
  return <p data-testid="client-marker">initial-client-marker</p>;
}
`,
      ),
      this.writeFile(
        "webkit/useMarker.ts",
        `export const useMarker = () => "initial-webkit-marker";
`,
      ),
    ]);
    const port = await this.resolvePort();
    return { appName: this.appName, appDir: this.appDir, workspaceRoot: this.workspaceRoot, port };
  }

  async cleanup(): Promise<void> {
    await this.stopHost();
    await rm(this.appDir, { recursive: true, force: true });
  }

  async startHost(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<DevStabilityHost> {
    const logs: string[] = [];
    const proc = Bun.spawn(["bash", "-lc", `bun run akan start ${JSON.stringify(this.appName)}`], {
      cwd: this.workspaceRoot,
      env: {
        ...process.env,
        AKAN_VERBOSE: "1",
        NODE_NO_WARNINGS: "1",
        PORT_OFFSET: String(this.portOffset),
      },
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const consume = async (stream: ReadableStream<Uint8Array> | null) => {
      if (!stream) return;
      const decoder = new TextDecoder();
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          logs.push(decoder.decode(value, { stream: true }));
        }
      } finally {
        reader.releaseLock();
      }
    };
    void consume(proc.stdout);
    void consume(proc.stderr);
    const host: DevStabilityHost = {
      proc,
      logs,
      markLog: () => markLog(logs),
      waitForLog: (pattern, waitMs) => waitForLog(logs, pattern, waitMs),
      waitForLogSince: (mark, pattern, waitMs) => waitForLogSince(logs, mark, pattern, waitMs),
      stop: async () => {
        proc.kill("SIGTERM");
        await Promise.race([proc.exited.catch(() => undefined), wait(3_000)]);
        if (!proc.killed) proc.kill("SIGKILL");
      },
    };
    this.#host = host;
    await host.waitForLog(/backend ready pid=(\d+)|AkanApp gateway is running on port/, timeoutMs);
    return host;
  }

  async stopHost(): Promise<void> {
    await this.#host?.stop();
    this.#host = null;
  }

  async writeFile(relativePath: string, contents: string): Promise<void> {
    const target = path.join(this.appDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }

  async replaceText(relativePath: string, search: string | RegExp, replacement: string): Promise<void> {
    const file = Bun.file(path.join(this.appDir, relativePath));
    const contents = await file.text();
    await this.writeFile(relativePath, contents.replace(search, replacement));
  }

  async removeFile(relativePath: string): Promise<void> {
    await rm(path.join(this.appDir, relativePath), { force: true });
  }

  async waitForHttpText(text: string | RegExp, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
    const body = await this.tryWaitForHttpText(text, timeoutMs);
    if (body) return body;
    throw new Error(`Timed out waiting for HTTP text ${String(text)}`);
  }

  async tryWaitForHttpText(text: string | RegExp, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string | null> {
    const port = await this.resolvePort();
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const body = await fetch(`http://127.0.0.1:${port}/`)
        .then((res) => res.text())
        .catch(() => null);
      if (body && (typeof text === "string" ? body.includes(text) : text.test(body))) return body;
      await wait(100);
    }
    return null;
  }

  async connectHmr(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<WebSocket> {
    const port = await this.resolvePort();
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const ws = await new Promise<WebSocket | null>((resolve) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/_akan/hmr`);
        const timeout = setTimeout(() => {
          socket.close();
          resolve(null);
        }, 750);
        socket.addEventListener("open", () => {
          clearTimeout(timeout);
          resolve(socket);
        });
        socket.addEventListener("error", () => {
          clearTimeout(timeout);
          socket.close();
          resolve(null);
        });
      });
      if (ws) return ws;
      await wait(100);
    }
    throw new Error("Timed out connecting HMR websocket");
  }

  async connectHmrProbe(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<DevStabilityHmrProbe> {
    const ws = await this.connectHmr(timeoutMs);
    const messages: unknown[] = [];
    ws.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : "";
      try {
        messages.push(JSON.parse(raw));
      } catch {
        /* ignore non-json websocket payloads */
      }
    });
    return {
      ws,
      messages,
      mark: () => messages.length,
      waitForMessageSince: (mark, predicate, waitMs) => waitForHmrMessageSince(messages, mark, predicate, waitMs),
      waitForNoMessageSince: (mark, predicate, quietMs) => waitForNoHmrMessageSince(messages, mark, predicate, quietMs),
      close: () => ws.close(),
    };
  }

  async tryConnectHmrProbe(timeoutMs = 3_000): Promise<DevStabilityHmrProbe | null> {
    try {
      return await this.connectHmrProbe(timeoutMs);
    } catch {
      return null;
    }
  }

  async waitForHmrMessage(
    ws: WebSocket,
    predicate: (message: unknown) => boolean,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<unknown> {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.removeEventListener("message", onMessage);
        reject(new Error("Timed out waiting for HMR message"));
      }, timeoutMs);
      const onMessage = (event: MessageEvent) => {
        const raw = typeof event.data === "string" ? event.data : "";
        let message: unknown;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }
        if (!predicate(message)) return;
        clearTimeout(timeout);
        ws.removeEventListener("message", onMessage);
        resolve(message);
      };
      ws.addEventListener("message", onMessage);
    });
  }

  async resolvePort(): Promise<number> {
    const apps = await readdir(path.join(this.workspaceRoot, "apps")).catch(() => []);
    const appIndex = Math.max([...new Set([...apps, this.appName])].sort().indexOf(this.appName), 0);
    return 8282 + appIndex + this.portOffset;
  }
}

export async function waitForHmrMessageSince(
  messages: unknown[],
  mark: number,
  predicate: (message: unknown) => boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = messages.slice(mark).find(predicate);
    if (found) return found;
    await wait(50);
  }
  throw new Error(`Timed out waiting for HMR message since mark ${mark}`);
}

export async function waitForNoHmrMessageSince(
  messages: unknown[],
  mark: number,
  predicate: (message: unknown) => boolean,
  quietMs = 750,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < quietMs) {
    const found = messages.slice(mark).find(predicate);
    if (found) throw new Error(`Unexpected HMR message after mark ${mark}: ${JSON.stringify(found)}`);
    await wait(50);
  }
}

export async function waitForLog(
  logs: string[],
  pattern: RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RegExpMatchArray> {
  return await waitForLogSince(logs, 0, pattern, timeoutMs);
}

export const markLog = (logs: string[]): number => logs.join("").length;

export async function waitForLogSince(
  logs: string[],
  mark: number,
  pattern: RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RegExpMatchArray> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const joined = logs.join("").slice(mark);
    const match = joined.match(pattern);
    if (match) return match;
    await wait(50);
  }
  const tail = logs.join("").slice(mark).slice(-4_000);
  throw new Error(`Timed out waiting for log pattern ${pattern} since mark ${mark}\nRecent logs:\n${tail}`);
}
