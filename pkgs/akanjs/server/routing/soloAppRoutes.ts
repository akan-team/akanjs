import type { AkanChildRole, AkanMetricsReport } from "akanjs/service";
import { AppInfo } from "../ops/appInfo";
import type { OpsRoute } from "../ops/opsRoute";
import { StatusAccess } from "../ops/statusAccess";
import type { HttpRoutes } from "../types";

export interface SoloAppStatus {
  role: AkanChildRole;
  running: boolean;
  status: string;
  port: number | null;
  metrics: AkanMetricsReport;
}

// Answers in the gateway's `/_akan/app/*` shape (one-entry `children`) so probes and tooling read one contract.
export const createSoloAppRoutes = (
  read: () => SoloAppStatus,
  logStream: { handle(req: Request): Response } | null = null,
  ops: OpsRoute | null = null,
  access = StatusAccess.fromEnv(),
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
      GET: (req: Request) =>
        access.health(req, () => ({ status: read().status, pid: process.pid, solo: true, children: [child()] })),
    },
    "/_akan/app/metrics": {
      GET: (req: Request) =>
        access.metrics(req, () => ({
          rooms: 0,
          sockets: 0,
          solo: true,
          gateway: null,
          proxyHop: null,
          children: [{ ...child(), metrics: read().metrics }],
        })),
    },
    [AppInfo.publicPath]: { GET: () => AppInfo.handlePublic() },
    "/_akan/bench/ping": { GET: () => new Response("ok") },
    ...(logStream ? { "/_akan/app/logs": { GET: (req: Request) => logStream.handle(req) } } : {}),
    ...(ops ? { "/_akan/ops/*": (req: Request) => ops.handle(req) } : {}),
  };
};
