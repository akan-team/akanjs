import { renderInitScript } from "../../../core/src/protocol.ts";
import { type ParsedArgs, stringFlag } from "../lib/args.ts";
import { makeBoot } from "../lib/boot.ts";
import { openHeadless } from "../lib/chrome.ts";
import { envFromProcess, follow, type Launched, type LaunchOptions, printLine } from "../lib/launch.ts";
import { bold, log } from "../lib/log.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { type LiveReload, serveApp } from "../lib/serve.ts";

export interface WebLaunchOptions extends LaunchOptions {
  port?: number;
  hostname?: string;
  /** Called with the server URL once it listens. */
  onReady?: (url: string) => void;
  liveReload?: LiveReload;
}

/** The web platform's /__akan_native/init.js with runtime env overrides (AKAN_NATIVE_PUBLIC_X → PUBLIC_X), as the native dev hosts do (§3.1). */
export function webInitScript(ctx: BuildContext, env: Record<string, string>): string {
  const overrides = Object.fromEntries(Object.entries(env).map(([k, v]) => [k.replace(/^AKAN_NATIVE_/, ""), v]));
  const plugins = Object.fromEntries(
    ctx.project.plugins.filter((p) => p.manifest.web).map((p) => [p.manifest.id, "web" as const]),
  );
  return renderInitScript(
    JSON.stringify(makeBoot(ctx.project.config, "web", plugins, ctx.dev, ctx.project)),
    JSON.stringify({ ...ctx.env, ...overrides }),
  );
}

export async function launchWeb(ctx: BuildContext, outDir: string, opts: WebLaunchOptions): Promise<Launched> {
  // Runtime env overrides replace the built init.js.
  const initScript = Object.keys(opts.env).length ? () => webInitScript(ctx, opts.env) : undefined;

  const server = serveApp({
    dir: outDir,
    port: opts.port ?? 4173,
    hostname: opts.hostname ?? "localhost",
    initScript,
    liveReload: opts.liveReload,
  });
  opts.onReady?.(server.url.href);
  let resolveExit!: (code: number) => void;
  const exited = new Promise<number>((resolve) => (resolveExit = resolve));
  let browser: Awaited<ReturnType<typeof openHeadless>> | null = null;
  if (opts.headless) browser = await openHeadless(server.url.href, opts.onLine ?? printLine);
  return {
    exited,
    stop() {
      browser?.stop();
      server.stop(true);
      resolveExit(0);
    },
  };
}

export async function runWeb(ctx: BuildContext, outDir: string, args: ParsedArgs): Promise<number> {
  const app = await launchWeb(ctx, outDir, {
    env: envFromProcess(),
    headless: false,
    port: Number(stringFlag(args, "port") ?? 4173),
    hostname: stringFlag(args, "host"),
    onReady(url) {
      log.ok(`serving ${outDir}`);
      log.info(bold(`→ ${url}`));
      if (args.flags.open) Bun.spawn(["open", url]);
    },
  });
  return follow(app);
}
