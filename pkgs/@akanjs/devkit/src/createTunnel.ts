import { createTunnel as create, ForwardOptions, ServerOptions, SshOptions, type TunnelOptions } from "tunnel-ssh";

import type { AppExecutor } from "./executors";

const getSshTunnelOptions = (app: AppExecutor, environment: string): SshOptions => {
  const { serveDomain, repoName } = app.workspace.getBaseDevEnv();
  return {
    host: `${app.name}-${environment}.${serveDomain}`,
    port: process.env.SSH_TUNNEL_PORT ? parseInt(process.env.SSH_TUNNEL_PORT) : 32767,
    username: process.env.SSH_TUNNEL_USERNAME ?? "root",
    password: process.env.SSH_TUNNEL_PASSWORD ?? repoName,
  };
};

interface TunnelOption {
  app: AppExecutor;
  environment: string;
  port?: number;
}
export const createTunnel = async ({ app, environment, port = 27017 }: TunnelOption) => {
  const tunnelOptions: TunnelOptions = { autoClose: true, reconnectOnError: true };
  const sshOptions: SshOptions = getSshTunnelOptions(app, environment);
  const serverOptions: ServerOptions = { port };
  const forwardOptions: ForwardOptions = {
    srcAddr: "0.0.0.0",
    srcPort: port,
    dstAddr: `mongo-0.mongo-svc.${app.name}-${environment}`,
    dstPort: 27017,
  };
  const [server, client] = await create(tunnelOptions, serverOptions, sshOptions, forwardOptions);
  return `localhost:${port}`;
};
