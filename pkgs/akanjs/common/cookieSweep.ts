export interface CookieSweepTarget {
  names: readonly string[];
  host: string;
  path: string;
}

export class CookieSweep {
  static readonly #maxDepth = 4;
  static readonly #maxPathLength = 128;
  static readonly #maxParents = 4;

  //? A deletion reaches only the copy with its name, Domain, Path and partition. RFC 6265bis keys a Domain cookie apart
  //? from a host-only one, so `Domain=<request host>` expires a copy a subdomain set and leaves the app's own.
  static setCookies({ names, host, path }: CookieSweepTarget): string[] {
    const domains = CookieSweep.domains(host);
    const paths = CookieSweep.pathPrefixes(path);
    //? A browser takes a `__Host-` name only host-only at `Path=/`, so it has no copy to sweep and refuses the deletion.
    return names
      .filter((name) => !name.startsWith("__Host-"))
      .flatMap((name) =>
        domains.flatMap((domain) =>
          paths.flatMap((prefix) => {
            const deletion = `${name}=; Domain=${domain}; Path=${prefix}; Max-Age=0; Secure; SameSite=Lax`;
            return [deletion, `${deletion}; Partitioned`];
          }),
        ),
      );
  }

  static domains(host: string): string[] {
    const labels = CookieSweep.#labelsOf(host);
    return labels ? [labels.join("."), ...CookieSweep.#parentsOf(labels)] : [];
  }

  static parentDomains(host: string): string[] {
    const labels = CookieSweep.#labelsOf(host);
    return labels ? CookieSweep.#parentsOf(labels) : [];
  }

  //? A cookie path matches a request path equal to it, or one it prefixes up to a `/`; both spellings of each
  //? directory (`/api` and `/api/`) are distinct paths a cookie may have been written under.
  static pathPrefixes(path: string): string[] {
    const cut = path.search(/[^A-Za-z0-9\-._~!$&'()*+=:@%/]/);
    const safe = path.startsWith("/") ? path.slice(0, cut === -1 ? path.length : cut) : "/";
    const prefixes = new Set(["/"]);
    const end = Math.min(safe.length, CookieSweep.#maxPathLength);
    let depth = 0;
    for (let idx = 1; idx < end && depth < CookieSweep.#maxDepth; idx++) {
      if (safe[idx] !== "/") continue;
      depth++;
      prefixes.add(safe.slice(0, idx));
      prefixes.add(safe.slice(0, idx + 1));
    }
    if (safe === path && depth < CookieSweep.#maxDepth && path.length <= CookieSweep.#maxPathLength) prefixes.add(path);
    return [...prefixes];
  }

  //? Kept from the root end: every host under the registrable domain can write a cookie for it, so it is the parent
  //? a cap must not drop.
  static #parentsOf(labels: string[]): string[] {
    return labels
      .slice(1, -1)
      .map((_, idx) => labels.slice(idx + 1).join("."))
      .slice(-CookieSweep.#maxParents);
  }

  //? DNS bounds a name at 253 characters and a label at 63; anything longer was never a host a browser addressed.
  static #labelsOf(host: string): string[] | null {
    const hostname = CookieSweep.#hostnameOf(host);
    if (!hostname || hostname.length > 253) return null;
    const labels = hostname.split(".");
    if (labels.length < 2 || labels.some((label) => !label || label.length > 63)) return null;
    return /^\d+$/.test(labels.at(-1) ?? "") ? null : labels;
  }

  static #hostnameOf(host: string): string | null {
    const trimmed = host.trim().toLowerCase();
    if (!trimmed || trimmed.startsWith("[")) return null;
    const colons = trimmed.split(":").length - 1;
    if (colons > 1) return null;
    const hostname = (colons === 1 ? trimmed.slice(0, trimmed.indexOf(":")) : trimmed).replace(/\.$/, "");
    return /^[a-z0-9.-]+$/.test(hostname) ? hostname : null;
  }
}
