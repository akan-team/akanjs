import { AppHosts } from "akanjs/common";
import { isLocalDevRuntime } from "../../signal/trace";

type Env = Record<string, string | undefined>;

// A page on a name that re-resolves to 127.0.0.1 (DNS rebinding) is same-origin with a loopback server, and
// CrossSiteGuard reads Origin == Host as same-site; the Host header still names the attacker's domain.
export class HostAllowlist {
  readonly #hosts: Set<string>;
  readonly devDefault: boolean;

  constructor(hosts: Iterable<string>, { devDefault = false }: { devDefault?: boolean } = {}) {
    this.#hosts = new Set([...hosts].map((host) => host.trim().toLowerCase()).filter(Boolean));
    this.devDefault = devDefault;
  }

  /**
   * `AKAN_ALLOWED_HOSTS`: comma-separated `host:port` entries. Unset or blank, a dev server answers only the hosts
   * `AppHosts.isRebindSafe` admits, and a deployed one every Host.
   */
  static fromEnv(env: Env = process.env): HostAllowlist | null {
    const allowlist = new HostAllowlist((env.AKAN_ALLOWED_HOSTS ?? "").split(","));
    if (allowlist.#hosts.size) return allowlist;
    const devHosted =
      env.AKAN_COMMAND_TYPE === "start" ||
      isLocalDevRuntime({ environment: env.AKAN_PUBLIC_ENV ?? "", operationMode: env.AKAN_PUBLIC_OPERATION_MODE });
    return devHosted ? new HostAllowlist([], { devDefault: true }) : null;
  }

  //? The Host header only: x-forwarded-host is an ordinary header a same-origin page may set to anything.
  allows(req: Request): boolean {
    const host = req.headers.get("host")?.trim().toLowerCase();
    if (!host) return false;
    return this.devDefault ? AppHosts.isRebindSafe(host) : this.#hosts.has(host);
  }

  refuse(): Response {
    if (!this.devDefault) return new Response("Forbidden", { status: 403 });
    return new Response(
      "Forbidden: a dev server answers localhost, IP addresses and the app's own hosts. To answer another host, list every host:port to serve in AKAN_ALLOWED_HOSTS.",
      { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
}
