import { CloudApi, GlobalConfig, type TunnelGrant } from "@akanjs/devkit/cloud";
import type { App, Workspace } from "@akanjs/devkit/commandDecorators";
import { TunnelAgent } from "akanjs/server/tunnel";
import { TunnelGate } from "./TunnelGate";

export interface TunnelShareOptions {
  workspace: Workspace;
  host?: string;
  port?: number;
  ttlMinutes?: number;
  devRoutes?: boolean;
  onLost?: (reason: string) => void;
}

// The agent lives in this process, not in a binary the user installs, so nothing stands between `akan tunnel` and a URL.
export class TunnelShare {
  readonly #api: CloudApi;
  readonly #agent: TunnelAgent;
  readonly #gate: TunnelGate | null;
  readonly grant: TunnelGrant;
  #closed = false;

  private constructor(api: CloudApi, agent: TunnelAgent, grant: TunnelGrant, gate: TunnelGate | null) {
    this.#api = api;
    this.#agent = agent;
    this.grant = grant;
    this.#gate = gate;
  }

  static async open(app: App, { workspace, host, port, ttlMinutes, devRoutes = false, onLost }: TunnelShareOptions) {
    const api = await CloudApi.fromHost(workspace, await GlobalConfig.hostFor(workspace, host));
    const grant = await api.requestTunnel({ name: app.name, ...(ttlMinutes ? { ttlMinutes } : {}) });
    const appOrigin = `http://localhost:${port ?? (await app.getDevPort())}`;
    // A dev server serves devtools, the HMR socket and source maps to whoever asks, so a share passes a gate first.
    const gate = devRoutes ? null : new TunnelGate(appOrigin);
    const agent = new TunnelAgent({
      gatewayUrl: grant.gatewayUrl,
      token: grant.token,
      hostnames: [grant.hostname],
      origin: gate?.origin ?? appOrigin,
      name: app.name,
      ...(onLost ? { onLost } : {}),
    });
    try {
      await agent.start();
    } catch (error) {
      gate?.stop();
      throw error;
    }
    return new TunnelShare(api, agent, grant, gate);
  }

  static exposureNotice(appName: string, devRoutes: boolean) {
    const reach = `Anyone with this URL reaches ${appName} on this machine, without signing in.`;
    return devRoutes
      ? `${reach} --dev-routes also hands them devtools, the HMR socket and source maps.`
      : `${reach} Devtools, the HMR socket and source maps stay local; \`akan tunnel --dev-routes\` shares them too.`;
  }

  get url() {
    return this.grant.url;
  }

  /** Stops the agent and hands the hostname back, so a share does not outlive the process that opened it. */
  async close() {
    if (this.#closed) return;
    this.#closed = true;
    await this.#agent.stop("cli exited");
    this.#gate?.stop();
    try {
      await this.#api.revokeTunnel(this.grant.code);
    } catch {
      // The share expires on its own TTL, and failing to release it must not stop the CLI from exiting.
    }
  }
}
