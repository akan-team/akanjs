import { isIP } from "node:net";

const bare = (hostname: string) =>
  hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();

// Loopback only: a private LAN address is another machine, and a request to it leaves this one.
export const codeAgentIsLoopback = (hostname: string) => {
  const host = bare(hostname);
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (isIP(host) === 4) return host.startsWith("127.");
  if (isIP(host) === 6) return host === "::1" || /^::ffff:(127\.\d+\.\d+\.\d+|7f[0-9a-f]{2}:[0-9a-f]{1,4})$/.test(host);
  return false;
};

export const codeAgentHostListed = (hostname: string, hosts: readonly string[]) => {
  const host = bare(hostname);
  return hosts.some((entry) => host === entry || host.endsWith(`.${entry}`));
};

export const codeAgentHostOf = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.hostname : undefined;
  } catch {
    return undefined;
  }
};
