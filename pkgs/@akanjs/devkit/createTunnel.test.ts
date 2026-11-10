import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { readFile, stat, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { Client, type Connection, Server, utils } from "ssh2";
import { createTunnel } from "./createTunnel";
import { SshHostKeys } from "./sshHostKeys";
import { createTempApp, isolateEnv, tempRoots } from "./testHelpers";

const freePort = () => {
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const { port } = listener;
  listener.stop(true);
  return port;
};

const publicBlobOf = (publicKey: string) => {
  const parsed = utils.parseKey(publicKey);
  if (parsed instanceof Error) throw parsed;
  return parsed.getPublicSSH();
};

//? ssh2 1.17's keygen strips a leading zero byte off an ed25519 public key, so 1 pair in 256 cannot be read back.
const ed25519Pair = () => {
  let pair = utils.generateKeyPairSync("ed25519");
  while (utils.parseKey(pair.private) instanceof Error) pair = utils.generateKeyPairSync("ed25519");
  return pair;
};

const sshServers: { server: Server; clients: Set<Connection> }[] = [];

const startSshServer = async () => {
  const hostKey = ed25519Pair();
  const methods: string[] = [];
  const clients = new Set<Connection>();
  const server = new Server({ hostKeys: [hostKey.private] }, (client) => {
    clients.add(client);
    client.on("error", () => clients.delete(client));
    client.on("authentication", (context) => {
      methods.push(context.method);
      if (context.method === "password" || context.method === "publickey") context.accept();
      else context.reject(["publickey", "password"]);
    });
    client.on("ready", () => {
      client.on("tcpip", (accept) => {
        const channel = accept();
        channel.on("data", (chunk: Buffer) => channel.write(chunk));
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  sshServers.push({ server, clients });
  const { port } = server.address() as AddressInfo;
  return { port, methods, fingerprint: SshHostKeys.fingerprintOf(publicBlobOf(hostKey.public)) };
};

const echoThrough = async (port: number) =>
  await new Promise<string>((resolve, reject) => {
    void Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        open: (socket) => void socket.write("ping"),
        data: (socket, chunk) => {
          resolve(Buffer.from(chunk).toString());
          socket.end();
        },
        error: (_socket, error) => reject(error),
        connectError: (_socket, error) => reject(error),
      },
    });
  });

afterEach(() => {
  for (const { server, clients } of sshServers.splice(0)) {
    for (const client of clients) client.end();
    server.close();
  }
});

describe("createTunnel", () => {
  isolateEnv({ AKAN_PUBLIC_REPO_NAME: "repo", AKAN_PUBLIC_SERVE_DOMAIN: "localhost", AKAN_PUBLIC_ENV: "testing" });
  const track = tempRoots();

  test("describes a refused Redis SSH connection and preserves its cause", async () => {
    const { app } = track(await createTempApp("demo"));
    const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    const port = listener.port;
    listener.stop(true);
    process.env.SSH_TUNNEL_PORT = String(port);

    let originalError: Error | undefined;
    const connect = Client.prototype.connect;
    const observeConnect = spyOn(Client.prototype, "connect").mockImplementation(function (this: Client, options) {
      this.once("error", (error: Error) => {
        originalError = error;
      });
      return connect.call(this, options);
    });
    let failure: unknown;
    try {
      await createTunnel("redis", { app, environment: "testing" });
    } catch (error) {
      failure = error;
    } finally {
      observeConnect.mockRestore();
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error("expected tunnel failure");
    expect(failure.message).toContain("redis");
    expect(failure.message).toContain(`demo-testing.localhost:${port}`);
    expect(failure.message).toContain("redis-0.redis-svc.demo-testing.svc.cluster.local:6379");
    expect(failure.message).toContain("ECONNREFUSED");
    expect(failure.cause).toBeInstanceOf(Error);
    expect(failure.cause).toBe(originalError);
    expect(failure.cause).not.toBe(failure);
    if (!(failure.cause instanceof Error)) throw new Error("expected original SSH error");
    const reasons = failure.cause instanceof AggregateError ? failure.cause.errors : [failure.cause];
    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) {
      expect(reason).toBeInstanceOf(Error);
      expect(reason.message).toContain("ECONNREFUSED");
      expect(failure.message).toContain(reason.message);
    }
  });

  test("refuses to dial a cluster host built on the local default serve domain", async () => {
    const { app } = track(await createTempApp("demo"));
    delete process.env.AKAN_PUBLIC_SERVE_DOMAIN;
    const connect = spyOn(Client.prototype, "connect");
    try {
      await expect(createTunnel("redis", { app, environment: "debug" })).rejects.toThrow(
        'The redis tunnel for the "debug" environment needs AKAN_PUBLIC_SERVE_DOMAIN (would be "localhost") set',
      );
      expect(connect).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
    }
  });

  test("forwards on loopback, signs in with the configured key and keeps the host key it first sees", async () => {
    const { root, app } = track(await createTempApp("demo"));
    const ssh = await startSshServer();
    const knownHosts = path.join(root, "known_hosts.json");
    const keyPath = path.join(root, "id_tunnel");
    await writeFile(keyPath, ed25519Pair().private);
    Object.assign(process.env, {
      SSH_TUNNEL_PORT: String(ssh.port),
      SSH_TUNNEL_KNOWN_HOSTS: knownHosts,
      SSH_TUNNEL_PRIVATE_KEY_PATH: keyPath,
    });
    const localPort = freePort();
    const listen = spyOn(Bun, "listen");
    try {
      expect(await createTunnel("redis", { app, environment: "testing", port: localPort })).toBe(
        `localhost:${localPort}`,
      );
      expect(listen.mock.calls[0]?.[0]).toMatchObject({ hostname: "127.0.0.1", port: localPort });
    } finally {
      listen.mockRestore();
    }

    expect(await echoThrough(localPort)).toBe("ping");
    expect(ssh.methods).toContain("publickey");
    expect(ssh.methods).not.toContain("password");
    expect(JSON.parse(await readFile(knownHosts, "utf8"))).toEqual({ [`localhost:${ssh.port}`]: ssh.fingerprint });
    if (process.platform !== "win32") expect((await stat(knownHosts)).mode & 0o777).toBe(0o600);
  });

  test("refuses a host whose key differs from the kept or the pinned one", async () => {
    const { root, app } = track(await createTempApp("demo"));
    const ssh = await startSshServer();
    const knownHosts = path.join(root, "known_hosts.json");
    const other = `SHA256:${Buffer.alloc(32, 1).toString("base64").replace(/=+$/, "")}`;
    Object.assign(process.env, {
      SSH_TUNNEL_PORT: String(ssh.port),
      SSH_TUNNEL_KNOWN_HOSTS: knownHosts,
      SSH_TUNNEL_PASSWORD: "test-password",
    });
    const open = async () => await createTunnel("redis", { app, environment: "testing", port: freePort() });

    await writeFile(knownHosts, JSON.stringify({ [`localhost:${ssh.port}`]: other }));
    await expect(open()).rejects.toThrow(`differs from the one ${knownHosts} keeps`);
    expect(JSON.parse(await readFile(knownHosts, "utf8"))).toEqual({ [`localhost:${ssh.port}`]: other });

    process.env.SSH_TUNNEL_HOST_FINGERPRINT = other;
    await expect(open()).rejects.toThrow("is not one SSH_TUNNEL_HOST_FINGERPRINT pins");
    process.env.SSH_TUNNEL_HOST_FINGERPRINT = ssh.fingerprint;
    await expect(open()).resolves.toStartWith("localhost:");
    expect(ssh.methods.filter((method) => method !== "none")).toEqual(["password"]);
  });

  test("warns when it signs in with the default shared credential", async () => {
    const { root, app } = track(await createTempApp("demo"));
    const ssh = await startSshServer();
    Object.assign(process.env, {
      SSH_TUNNEL_PORT: String(ssh.port),
      SSH_TUNNEL_KNOWN_HOSTS: path.join(root, "known_hosts.json"),
    });
    //? `akan test` runs from the workspace root, whose dotenv may name a password; this case is the one with none.
    delete process.env.SSH_TUNNEL_PASSWORD;
    delete process.env.SSH_TUNNEL_PRIVATE_KEY_PATH;
    const warn = spyOn(app.logger, "warn");

    await createTunnel("redis", { app, environment: "testing", port: freePort() });

    expect(warn.mock.calls.map(([message]) => String(message)).join("\n")).toContain(
      "uses the default shared credential",
    );
  });

  test("listens where SSH_TUNNEL_BIND_HOST says and warns when that is not loopback", async () => {
    const { root, app } = track(await createTempApp("demo"));
    const ssh = await startSshServer();
    Object.assign(process.env, {
      SSH_TUNNEL_PORT: String(ssh.port),
      SSH_TUNNEL_KNOWN_HOSTS: path.join(root, "known_hosts.json"),
      SSH_TUNNEL_PASSWORD: "test-password",
      SSH_TUNNEL_BIND_HOST: "0.0.0.0",
    });
    const warn = spyOn(app.logger, "warn");
    const localPort = freePort();
    const listen = spyOn(Bun, "listen");
    try {
      await createTunnel("redis", { app, environment: "testing", port: localPort });
      expect(listen.mock.calls[0]?.[0]).toMatchObject({ hostname: "0.0.0.0", port: localPort });
    } finally {
      listen.mockRestore();
    }

    expect(warn.mock.calls.map(([message]) => String(message)).join("\n")).toContain(
      "The redis tunnel listens on 0.0.0.0 (SSH_TUNNEL_BIND_HOST)",
    );
  });

  test("takes no host check or listener the repo's dotenv file names, and says it ignored them", async () => {
    const { root, app } = track(await createTempApp("demo"));
    const ssh = await startSshServer();
    const knownHosts = path.join(root, "known_hosts.json");
    const other = `SHA256:${Buffer.alloc(32, 1).toString("base64").replace(/=+$/, "")}`;
    await writeFile(path.join(root, ".env"), "SSH_TUNNEL_HOST_FINGERPRINT=*\nexport SSH_TUNNEL_BIND_HOST=0.0.0.0\n");
    Object.assign(process.env, {
      SSH_TUNNEL_PORT: String(ssh.port),
      SSH_TUNNEL_KNOWN_HOSTS: knownHosts,
      SSH_TUNNEL_PASSWORD: "test-password",
      SSH_TUNNEL_HOST_FINGERPRINT: "*",
      SSH_TUNNEL_BIND_HOST: "0.0.0.0",
    });
    const warn = spyOn(app.logger, "warn");
    const listen = spyOn(Bun, "listen");
    const cwd = process.cwd();
    process.chdir(root);
    try {
      const open = async () => await createTunnel("redis", { app, environment: "testing", port: freePort() });
      await writeFile(knownHosts, JSON.stringify({ [`localhost:${ssh.port}`]: other }));
      await expect(open()).rejects.toThrow(`differs from the one ${knownHosts} keeps`);
      await writeFile(knownHosts, JSON.stringify({ [`localhost:${ssh.port}`]: ssh.fingerprint }));
      await expect(open()).resolves.toStartWith("localhost:");
      expect(listen.mock.calls.at(-1)?.[0]).toMatchObject({ hostname: "127.0.0.1" });
    } finally {
      process.chdir(cwd);
      listen.mockRestore();
    }

    const warnings = warn.mock.calls.map(([message]) => String(message)).join("\n");
    expect(warnings).toContain("SSH_TUNNEL_HOST_FINGERPRINT is set in .env, which the repository controls");
    expect(warnings).toContain("SSH_TUNNEL_BIND_HOST is set in .env");
    expect(warnings).not.toContain("accepts any host key");
  });
});
