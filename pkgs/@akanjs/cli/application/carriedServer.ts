import type { ResolvedMobileTarget } from "@akanjs/devkit/mobile";
import type { ServerPolicy } from "@akanjs/native/api";

export interface CarriedServer extends ServerPolicy {
  omit: string[];
  profile?: string;
  modules: string[];
  env?: Record<string, string>;
}

//? One build stages one server, so the targets that carry it must agree on how: its packages, env profile and modules.
export const carriedServerOf = (carrying: ResolvedMobileTarget[]): CarriedServer => {
  const servers = carrying.map(({ config }): CarriedServer => {
    const server = config.desktop?.server;
    if (typeof server !== "object") return { omit: [], modules: [] };
    const { omit = [], modules = [], profile, env, restart, watchdog } = server;
    const { intervalMs, failures } = typeof watchdog === "object" ? watchdog : {};
    return {
      omit,
      modules,
      ...(profile ? { profile } : {}),
      ...(env ? { env } : {}),
      ...(restart !== undefined ? { restart } : {}),
      ...(intervalMs && failures ? { watchdog: { intervalMs, failures } } : {}),
    };
  });
  const [first = { omit: [], modules: [] }, ...rest] = servers;
  const agree = (what: string, of: (server: CarriedServer) => string) => {
    if (rest.every((server) => of(server) === of(first))) return;
    throw new Error(
      `The targets that carry the server ${what} (${carrying.map(({ name }, idx) => `${name}: ${(servers[idx] && of(servers[idx])) || "none"}`).join("; ")}); build them one --target at a time.`,
    );
  };
  agree("omit different packages", ({ omit }) => omit.join(", "));
  agree("name different env profiles", ({ profile }) => profile ?? "");
  agree("mount different modules", ({ modules }) => modules.join(", "));
  agree("set a different env", ({ env }) =>
    env
      ? JSON.stringify(
          env,
          Object.keys(env).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : "",
  );
  agree("restart differently", ({ restart }) => String(restart ?? ""));
  agree("watch it differently", ({ watchdog }) => (watchdog ? JSON.stringify(watchdog) : ""));
  return first;
};
