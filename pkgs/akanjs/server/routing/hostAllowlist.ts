// A page on a name that re-resolves to 127.0.0.1 (DNS rebinding) is same-origin with a loopback server, and
// CrossSiteGuard reads Origin == Host as same-site; the Host header still names the attacker's domain.
export class HostAllowlist {
  readonly #hosts: Set<string>;

  constructor(hosts: Iterable<string>) {
    this.#hosts = new Set([...hosts].map((host) => host.trim().toLowerCase()).filter(Boolean));
  }

  /** `AKAN_ALLOWED_HOSTS`: comma-separated `host:port` entries; unset or blank serves every Host. */
  static fromEnv(env: Record<string, string | undefined> = process.env): HostAllowlist | null {
    const allowlist = new HostAllowlist((env.AKAN_ALLOWED_HOSTS ?? "").split(","));
    return allowlist.#hosts.size ? allowlist : null;
  }

  //? The Host header only: x-forwarded-host is an ordinary header a same-origin page may set to anything.
  allows(req: Request): boolean {
    const host = req.headers.get("host")?.trim().toLowerCase();
    return !!host && this.#hosts.has(host);
  }

  refuse(): Response {
    return new Response("Forbidden", { status: 403 });
  }
}
