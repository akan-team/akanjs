import { readFileSync } from "node:fs";
import type { ConnectConfig } from "ssh2";
import { type AppExecutor, WorkspaceExecutor } from "./executors";
import { ShellOnlyEnv } from "./shellOnlyEnv";
import { SshHostKeys } from "./sshHostKeys";
import { createSshTunnel } from "./sshTunnel";

//? Loosening the host check or the listener, or picking a key, is the person's call; a repo's dotenv cannot set it.
const tunnelEnv = new ShellOnlyEnv([
  "SSH_TUNNEL_PRIVATE_KEY_PATH",
  "SSH_TUNNEL_PASSPHRASE",
  "SSH_TUNNEL_HOST_FINGERPRINT",
  "SSH_TUNNEL_KNOWN_HOSTS",
  "SSH_TUNNEL_BIND_HOST",
]);

interface TunnelOption {
  app: AppExecutor;
  environment: string;
  port?: number;
}

const tunnelAuth = (
  app: AppExecutor,
  repoName: string,
): Pick<ConnectConfig, "privateKey" | "passphrase" | "password"> => {
  const keyPath = tunnelEnv.get("SSH_TUNNEL_PRIVATE_KEY_PATH");
  const passphrase = tunnelEnv.get("SSH_TUNNEL_PASSPHRASE");
  if (keyPath) return { privateKey: readFileSync(keyPath), ...(passphrase ? { passphrase } : {}) };
  if (process.env.SSH_TUNNEL_PASSWORD) return { password: process.env.SSH_TUNNEL_PASSWORD };
  app.logger.warn(
    "The SSH tunnel uses the default shared credential. " +
      "Set SSH_TUNNEL_PRIVATE_KEY_PATH to a key (or SSH_TUNNEL_PASSWORD) once the cluster's tunnel endpoint accepts it.",
  );
  return { password: repoName };
};

const tunnelHostVerifier = (app: AppExecutor, hostId: string, onRefusal: (reason: string) => void) => {
  const pinned = SshHostKeys.parsePinned(tunnelEnv.get("SSH_TUNNEL_HOST_FINGERPRINT"));
  const hostKeys = new SshHostKeys(tunnelEnv.get("SSH_TUNNEL_KNOWN_HOSTS") || undefined);
  return (key: Buffer, verify: (valid: boolean) => void) => {
    if (pinned.includes("SHA256:*")) {
      app.logger.warn(`SSH_TUNNEL_HOST_FINGERPRINT=* accepts any host key ${hostId} shows.`);
      verify(true);
      return;
    }
    hostKeys.verify(hostId, key, pinned).then(
      ({ trusted, firstUse, fingerprint }) => {
        if (firstUse)
          app.logger.warn(
            `Trusting the SSH host key ${fingerprint} of ${hostId} on first use; kept in ${hostKeys.filePath}.`,
          );
        if (!trusted)
          onRefusal(
            pinned.length
              ? `the host key ${fingerprint} of ${hostId} is not one SSH_TUNNEL_HOST_FINGERPRINT pins`
              : `the host key ${fingerprint} of ${hostId} differs from the one ${hostKeys.filePath} keeps; if the host was rebuilt, remove its entry or pin the new key with SSH_TUNNEL_HOST_FINGERPRINT`,
          );
        verify(trusted);
      },
      (error: unknown) => {
        onRefusal(
          `the host key store ${hostKeys.filePath} could not be read (${error instanceof Error ? error.message : String(error)})`,
        );
        verify(false);
      },
    );
  };
};

export const createTunnel = async (
  service: "redis" | "postgres",
  { app, environment, port = service === "postgres" ? 5432 : 6379 }: TunnelOption,
) => {
  const baseDevEnv = WorkspaceExecutor.getBaseDevEnv();
  WorkspaceExecutor.assertDeployableEnv(baseDevEnv, environment, `The ${service} tunnel`);
  for (const line of tunnelEnv.ignored()) app.logger.warn(line);
  const { serveDomain, repoName } = baseDevEnv;
  const host = `${app.name}-${environment}.${serveDomain}`;
  //? RFC 6761 makes *.localhost loopback, but only macOS resolves it; glibc without systemd-resolved and Windows answer ENOTFOUND
  const sshHost = host.endsWith(".localhost") ? "localhost" : host;
  const sshPort = process.env.SSH_TUNNEL_PORT ? parseInt(process.env.SSH_TUNNEL_PORT) : 32767;
  const dstHost = `${service}-0.${service}-svc.${app.name}-${environment}.svc.cluster.local`;
  const dstPort = service === "postgres" ? 5432 : 6379;
  //? The forward reaches a cluster database, so it listens on loopback unless SSH_TUNNEL_BIND_HOST widens it.
  const bindHost = tunnelEnv.get("SSH_TUNNEL_BIND_HOST") || "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(bindHost))
    app.logger.warn(
      `The ${service} tunnel listens on ${bindHost} (SSH_TUNNEL_BIND_HOST), so other machines that reach it reach ${dstHost}.`,
    );
  let refusal: string | null = null;
  try {
    await createSshTunnel({
      localHost: bindHost,
      localPort: port,
      srcHost: "127.0.0.1",
      srcPort: port,
      dstHost,
      dstPort,
      sshOptions: {
        host: sshHost,
        port: sshPort,
        username: process.env.SSH_TUNNEL_USERNAME ?? "root",
        ...tunnelAuth(app, repoName),
        hostVerifier: tunnelHostVerifier(app, `${sshHost}:${sshPort}`, (reason) => {
          refusal = reason;
        }),
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
      `Could not open the ${service} tunnel for ${app.name}-${environment}: SSH ${host}:${sshPort} -> ${dstHost}:${dstPort} failed (${refusal ?? reasons})`,
      { cause: error },
    );
  }
  return `localhost:${port}`;
};
