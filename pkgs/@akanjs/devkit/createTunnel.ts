import { type AppExecutor, WorkspaceExecutor } from "./executors";
import { createSshTunnel } from "./sshTunnel";

interface TunnelOption {
  app: AppExecutor;
  environment: string;
  port?: number;
}
export const createTunnel = async (
  service: "redis" | "postgres",
  { app, environment, port = service === "postgres" ? 5432 : 6379 }: TunnelOption,
) => {
  const baseDevEnv = WorkspaceExecutor.getBaseDevEnv();
  WorkspaceExecutor.assertDeployableEnv(baseDevEnv, environment, `The ${service} tunnel`);
  const { serveDomain, repoName } = baseDevEnv;
  const host = `${app.name}-${environment}.${serveDomain}`;
  const sshPort = process.env.SSH_TUNNEL_PORT ? parseInt(process.env.SSH_TUNNEL_PORT) : 32767;
  const dstHost = `${service}-0.${service}-svc.${app.name}-${environment}.svc.cluster.local`;
  const dstPort = service === "postgres" ? 5432 : 6379;
  try {
    await createSshTunnel({
      localHost: "0.0.0.0",
      localPort: port,
      srcHost: "0.0.0.0",
      srcPort: port,
      dstHost,
      dstPort,
      sshOptions: {
        //? RFC 6761 makes *.localhost loopback, but only macOS resolves it; glibc without systemd-resolved and Windows answer ENOTFOUND
        host: host.endsWith(".localhost") ? "localhost" : host,
        port: sshPort,
        username: process.env.SSH_TUNNEL_USERNAME ?? "root",
        password: process.env.SSH_TUNNEL_PASSWORD ?? repoName,
      },
    });
  } catch (error) {
    const reasons =
      error instanceof AggregateError
        ? error.errors.map((reason) => (reason instanceof Error ? reason.message : String(reason))).join("; ")
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(
      `Could not open the ${service} tunnel for ${app.name}-${environment}: SSH ${host}:${sshPort} -> ${dstHost}:${dstPort} failed (${reasons})`,
      { cause: error },
    );
  }
  return `localhost:${port}`;
};
