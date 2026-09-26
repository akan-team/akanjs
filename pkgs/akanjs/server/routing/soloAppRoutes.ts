import type { AkanChildRole, AkanMetricsReport } from "akanjs/service";
import { AppInfo } from "../ops/appInfo";
import type { OpsRoute } from "../ops/opsRoute";
import type { HttpRoutes } from "../types";

export interface SoloAppStatus {
  role: AkanChildRole;
  running: boolean;
  status: string;
  port: number | null;
  metrics: AkanMetricsReport;
}

/**
 * The gateway's `/_akan/app/*` surface, answered by a process nothing is proxying. The payload keeps the
 * gateway's own shape — a `children` array with this process as its only entry — so a probe, a k8s check and
 * `akan` tooling read one contract whether or not a gateway is in front.
 */
export const createSoloAppRoutes = (
  read: () => SoloAppStatus,
  logStream: { handle(req: Request): Response } | null = null,
  ops: OpsRoute | null = null,
): HttpRoutes => {
  const child = () => {
    const { role, running, status, port } = read();
    return {
      idx: 0,
      role,
      status: running ? "healthy" : status,
      ready: running,
      pid: process.pid,
      upstream: { type: "tcp" as const, host: "127.0.0.1", port },
    };
  };
  return {
    "/_akan/app/health": {
      GET: () => Response.json({ status: read().status, pid: process.pid, solo: true, children: [child()] }),
    },
    "/_akan/app/metrics": {
      GET: () =>
        Response.json({
          rooms: 0,
          sockets: 0,
          solo: true,
          gateway: null,
          proxyHop: null,
          children: [{ ...child(), metrics: read().metrics }],
        }),
    },
    [AppInfo.publicPath]: { GET: () => AppInfo.handlePublic() },
    "/_akan/bench/ping": { GET: () => new Response("ok") },
    ...(logStream ? { "/_akan/app/logs": { GET: (req: Request) => logStream.handle(req) } } : {}),
    ...(ops ? { "/_akan/ops/*": (req: Request) => ops.handle(req) } : {}),
  };
};
