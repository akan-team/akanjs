import { getEnv } from "akanjs/base";

export class AppHosts {
  static readonly #declared = new Set<string>();

  static declare(hosts: Iterable<string>) {
    for (const host of hosts) {
      const name = AppHosts.nameOf(host);
      if (name) AppHosts.#declared.add(name);
    }
  }

  static reset() {
    AppHosts.#declared.clear();
  }

  //? The build records route domains without their port, so a host matches on its name alone.
  static allows(host: string, extra: Iterable<string> = []): boolean {
    const name = AppHosts.nameOf(host);
    if (!name) return false;
    const { appName, environment, serveDomain } = getEnv();
    if (name === AppHosts.nameOf(`${appName}-${environment}.${serveDomain}`) || AppHosts.#declared.has(name))
      return true;
    const listed = [...(process.env.AKAN_ALLOWED_HOSTS ?? "").split(","), ...extra];
    return listed.some((entry) => AppHosts.nameOf(entry) === name);
  }

  static nameOf(host: string): string | null {
    const url = URL.parse(`http://${host.trim()}`);
    if (!url || url.href !== `${url.origin}/`) return null;
    return url.hostname.replace(/\.$/, "") || null;
  }
}
