import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserError } from "../signal/browserError";
import { type ErrorReportContext, ErrorReporting } from "../signal/errorReporting";
import { AkanLib } from "./akanLib";
import { AkanOption } from "./akanOption";
import { AkanServer } from "./akanServer";
import { ClientReportId } from "./clientReportId";
import { makeSqliteEnv, serverResolverTestModule } from "./resolver/resolver.contract.fixture";

const pageId = "0af7651916cd43dd8448eb211c80319c";
const processEvents = ["SIGTERM", "SIGINT", "uncaughtException", "unhandledRejection"] as const;
const env = {
  AKAN_PUBLIC_APP_NAME: "clientReportTest",
  AKAN_PUBLIC_REPO_NAME: "akan",
  AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
  AKAN_PUBLIC_ENV: "local",
  AKAN_PUBLIC_OPERATION_MODE: "local",
  SERVER_MODE: "all",
  NODE_ENV: "test",
  AKAN_SSR: "false",
  AKAN_COMMAND_TYPE: undefined,
  AKAN_CHILD_SOCKET: undefined,
  AKAN_CHILD_WS_PORT: undefined,
  AKAN_RUNTIME_DIR: undefined,
  PORT: undefined,
} as Record<string, string | undefined>;
const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
const setEnv = (values: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  ErrorReporting.use(null);
  setEnv(saved);
});

const freePort = () => {
  const probe = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const { port } = probe;
  probe.stop(true);
  return port;
};

const serve = async (option: AkanOption) => {
  const dir = mkdtempSync(join(tmpdir(), "akan-client-report-"));
  const port = freePort();
  setEnv({ ...env, AKAN_RUNTIME_DIR: join(dir, "runtime"), PORT: String(port) });
  const listeners = new Map(processEvents.map((event) => [event, [...process.listeners(event)]]));
  const lib = new AkanLib("clientReportTest", {
    databases: [serverResolverTestModule()],
    services: [],
    scalars: [],
    option,
  });
  const server = new AkanServer("clientReportTest", makeSqliteEnv(dir), "all", lib);
  cleanups.push(async () => {
    await server.stop();
    for (const event of processEvents)
      for (const listener of process.listeners(event))
        if (!listeners.get(event)?.includes(listener)) process.removeListener(event, listener as never);
    rmSync(dir, { recursive: true, force: true });
  });
  await server.start({ listen: true, schedules: false });
  const origin = `http://127.0.0.1:${port}`;
  return () =>
    fetch(`${origin}/_akan/client-report`, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8", origin, "sec-fetch-site": "same-origin" },
      body: JSON.stringify({
        requestId: ClientReportId.sign(pageId),
        routeId: "/:lang/orders/:orderId",
        kind: "error",
        name: "TypeError",
        message: "price was undefined",
      }),
    });
};

test("a server takes a browser report at /_akan/client-report once its option turns reports on, and has no such route without", async () => {
  const reported: [Error, ErrorReportContext][] = [];
  const reporter = (error: Error, context: ErrorReportContext) => void reported.push([error, context]);

  const withoutOption = await serve(new AkanOption().setErrorReporter(reporter));
  const missing = await withoutOption();
  await ErrorReporting.flush();
  expect(missing.status).toBe(404);
  expect(reported).toEqual([]);
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();

  const withOption = await serve(new AkanOption().setErrorReporter(reporter).setClientReport());
  const taken = await withOption();
  await ErrorReporting.flush();
  expect([taken.status, await taken.text(), taken.headers.get("cache-control")]).toEqual([204, "", "no-store"]);
  expect(reported).toHaveLength(1);
  expect(reported[0]?.[0]).toBeInstanceOf(BrowserError);
  expect(reported[0]?.[1]).toMatchObject({ source: "client", traceId: pageId, routeId: "/:lang/orders/:orderId" });
}, 30_000);

test("a server gives a native shell's page an id over the network and takes that page's report with its shell", async () => {
  const reported: [Error, ErrorReportContext][] = [];
  const send = await serve(
    new AkanOption().setErrorReporter((error, context) => void reported.push([error, context])).setClientReport(),
  );
  const url = new URL((await send()).url);
  const shellOrigin = "app://localhost";
  const asked = await fetch(url, { headers: { origin: shellOrigin, "sec-fetch-site": "cross-site" } });
  const requestId = await asked.text();
  const traceId = ClientReportId.verify(requestId);
  const posted = await fetch(url, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", origin: shellOrigin, "sec-fetch-site": "cross-site" },
    body: JSON.stringify({ requestId, kind: "rejection", name: "Error", message: "save failed", shell: "ios" }),
  });
  await ErrorReporting.flush();

  expect([asked.status, asked.headers.get("access-control-allow-origin")]).toEqual([200, shellOrigin]);
  expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  expect(posted.status).toBe(204);
  expect(reported.map(([error, context]) => [(error as BrowserError).data.shell, context.traceId])).toEqual([
    [null, pageId],
    ["ios", traceId],
  ]);
}, 30_000);
