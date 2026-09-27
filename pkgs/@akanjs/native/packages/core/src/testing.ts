// Mock host for tests and browser demos (PL-9).
//
//   const host = installMockHost({
//     platform: "ios",
//     plugins: { camera: { methods: { takePhoto: () => ({ url: "/x.jpg", mime: "image/jpeg", size: 1 }) } } },
//   });
//   host.emit("camera", "someEvent", data);
//   host.uninstall();

import { aclCheck, type CallScope, listenItem, type ResolvedAcl } from "./acl.ts";
import type { Platform, PluginDecl } from "./boot.ts";
import { akanNativeGlobal } from "./boot.ts";
import { AkanNativeError } from "./errors.ts";
import {
  BRIDGE_PLUGIN,
  type BridgeRequest,
  type BridgeResponse,
  CANCEL,
  errorResponse,
  LISTEN,
  type ListenArgs,
  okResponse,
  RELEASE,
  UNLISTEN,
  validateRequest,
} from "./protocol.ts";
import { resetRuntime, runtime } from "./runtime.ts";
import { refreshBoot } from "./state.ts";

/**
 * `scope`: what the app's capabilities allow this call (PL-11), as a real host passes it. `signal`
 * fires when the page cancels the call ($bridge.cancel), like a desktop plugin's ctx.signal.
 */
export type MockMethod = (args: any, host: MockHost, scope?: CallScope, signal?: AbortSignal) => unknown;

export interface MockPlugin {
  methods?: Record<string, MockMethod>;
  events?: string[];
  /** The other methods and events use the web implementation (a native subset with `web: true`). */
  web?: true;
}

export interface MockHostOptions {
  platform?: Platform;
  env?: Record<string, string>;
  dev?: boolean;
  /** "web" makes the page use the plugin's web implementation, as a desktop host may declare. */
  plugins?: Record<string, MockPlugin | "web">;
  /** Capabilities (PL-11): the mock host enforces them like a real host, and the page sees them in boot. */
  acl?: ResolvedAcl;
  /** The page's window id (desktop multi-window). Default 1. */
  windowId?: number;
}

export interface MockHost {
  readonly requests: BridgeRequest[];
  /** $bridge.cancel requests the page sent: the call id and the reason. */
  readonly cancels: { id: number; reason: string; cancelled: boolean }[];
  /** $bridge.release requests: the FileRef URLs (answered released: true). */
  readonly releases: string[];
  /** Pushes an event the way a native host would. Delivered only while subscribed. */
  emit(plugin: string, event: string, data?: unknown): boolean;
  subscriptions(plugin: string, event: string): number;
  uninstall(): void;
}

export function installMockHost(options: MockHostOptions = {}): MockHost {
  const platform = options.platform ?? "ios";
  const plugins = options.plugins ?? {};
  const decls: Record<string, PluginDecl> = {};
  for (const [id, plugin] of Object.entries(plugins)) {
    decls[id] =
      plugin === "web"
        ? "web"
        : {
            methods: Object.keys(plugin.methods ?? {}),
            events: plugin.events ?? [],
            ...(plugin.web ? { web: true as const } : {}),
          };
  }

  resetRuntime();
  const g = akanNativeGlobal();
  for (const key of Object.keys(g)) delete (g as Record<string, unknown>)[key];
  Object.assign(g, {
    v: 1,
    platform,
    runtimeVersion: "0.0.0-mock",
    dev: options.dev ?? false,
    env: options.env ?? {},
    plugins: decls,
    ...(options.acl ? { acl: options.acl } : {}),
    ...(options.windowId ? { windowId: options.windowId } : {}),
  });

  const subs = new Map<string, number>();
  const requests: BridgeRequest[] = [];
  const cancels: MockHost["cancels"] = [];
  const releases: string[] = [];
  const running = new Map<number, AbortController>();

  const host: MockHost = {
    requests,
    cancels,
    releases,
    emit(plugin, event, data) {
      if ((subs.get(`${plugin}.${event}`) ?? 0) === 0) return false;
      g.receive?.(JSON.stringify({ v: 1, plugin, event, data }));
      return true;
    },
    subscriptions: (plugin, event) => subs.get(`${plugin}.${event}`) ?? 0,
    uninstall() {
      resetRuntime();
      for (const key of Object.keys(g)) delete (g as Record<string, unknown>)[key];
      refreshBoot();
    },
  };

  const handle = async (req: BridgeRequest): Promise<BridgeResponse> => {
    const invalid = validateRequest(req);
    if (invalid) return errorResponse(req.id, "INVALID_ARGS", invalid);
    if (req.plugin === BRIDGE_PLUGIN && req.method === CANCEL) {
      const { id, reason = "abort" } = req.args as { id: number; reason?: string };
      const call = running.get(id);
      call?.abort(
        new AkanNativeError(reason === "timeout" ? "TIMEOUT" : "CANCELLED", `cancelled by the page (${reason})`),
      );
      cancels.push({ id, reason, cancelled: call !== undefined });
      return okResponse(req.id, { cancelled: call !== undefined });
    }
    if (req.plugin === BRIDGE_PLUGIN && req.method === RELEASE) {
      releases.push((req.args as { url: string }).url);
      return okResponse(req.id, { released: true });
    }
    const plugin = plugins[req.plugin];
    if (!plugin || plugin === "web") return errorResponse(req.id, "NOT_FOUND", `unknown plugin ${req.plugin}`);
    let scope: CallScope | undefined;
    if (req.method !== UNLISTEN) {
      const item = req.method === LISTEN ? listenItem(String((req.args as ListenArgs | undefined)?.event)) : req.method;
      const access = aclCheck(options.acl, req.plugin, item, options.windowId ?? 1);
      if (!access.allowed)
        return errorResponse(
          req.id,
          "NOT_ALLOWED",
          `${req.plugin}.${req.method} is not allowed by the app's capabilities`,
        );
      scope = access.scope;
    }
    if (req.method === LISTEN || req.method === UNLISTEN) {
      const { event } = req.args as ListenArgs;
      if (!plugin.events?.includes(event)) return errorResponse(req.id, "NOT_FOUND", `unknown event ${event}`);
      const key = `${req.plugin}.${event}`;
      const count = (subs.get(key) ?? 0) + (req.method === LISTEN ? 1 : -1);
      subs.set(key, Math.max(0, count));
      return okResponse(req.id);
    }
    const method = plugin.methods?.[req.method];
    if (!method) return errorResponse(req.id, "NOT_FOUND", `unknown method ${req.plugin}.${req.method}`);
    const controller = new AbortController();
    running.set(req.id, controller);
    try {
      return okResponse(req.id, await method(req.args, host, scope, controller.signal));
    } catch (error) {
      const e = AkanNativeError.from(error);
      return errorResponse(req.id, e.code, e.message, e);
    } finally {
      running.delete(req.id);
    }
  };

  const rt = runtime();
  rt.transport = {
    async send(req) {
      // Round-trip through JSON like every real transport does.
      const wire = JSON.parse(JSON.stringify(req)) as BridgeRequest;
      requests.push(wire);
      await Promise.resolve();
      return JSON.parse(JSON.stringify(await handle(wire))) as BridgeResponse;
    },
  };
  refreshBoot();
  return host;
}
