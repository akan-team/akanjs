import { type Channel, Client, type ConnectConfig } from "ssh2";

export interface SshTunnelOptions {
  localHost?: string;
  localPort: number;
  srcHost?: string;
  srcPort?: number;
  dstHost: string;
  dstPort: number;
  sshOptions: ConnectConfig;
}

export interface SshTunnel {
  close(): void;
}

interface TunnelSocketData {
  stream?: Channel;
  pending: Buffer[];
  closed: boolean;
}

type BunSocket = Bun.Socket<TunnelSocketData>;

const closeQuietly = (close: () => void) => {
  try {
    close();
  } catch {
    // The opposite side may already have closed the tunnel.
  }
};

const createSshClient = async (options: SshTunnelOptions) =>
  new Promise<Client>((resolve, reject) => {
    const client = new Client();

    const cleanup = () => {
      client.off("ready", onReady);
      client.off("error", onError);
      client.off("close", onClose);
    };

    const onReady = () => {
      cleanup();
      resolve(client);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("SSH tunnel closed before it was ready"));
    };

    client.once("ready", onReady);
    client.once("error", onError);
    client.once("close", onClose);
    client.connect({ readyTimeout: 10000, ...options.sshOptions });
  });

export const createSshTunnel = async (options: SshTunnelOptions): Promise<SshTunnel> => {
  const client = await createSshClient(options);
  const sockets = new Set<BunSocket>();
  let closing = false;

  const closeSocket = (socket: BunSocket, error?: Error) => {
    sockets.delete(socket);
    closeBunSocket(socket, error);
  };

  try {
    const server = Bun.listen<TunnelSocketData>({
      hostname: options.localHost ?? "127.0.0.1",
      port: options.localPort,
      socket: {
        open(socket) {
          sockets.add(socket);
          socket.data = { pending: [], closed: false };

          client.forwardOut(
            options.srcHost ?? "127.0.0.1",
            options.srcPort ?? options.localPort,
            options.dstHost,
            options.dstPort,
            (error, stream) => {
              if (error) {
                closeSocket(socket, error);
                return;
              }

              if (socket.data.closed) {
                stream.destroy();
                return;
              }

              socket.data.stream = stream;
              stream.on("data", (chunk: Buffer) => socket.write(chunk));
              stream.once("close", () => closeSocket(socket));
              stream.once("error", (streamError: Error) => closeSocket(socket, streamError));

              for (const chunk of socket.data.pending) stream.write(chunk);
              socket.data.pending = [];
            },
          );
        },
        data(socket, chunk) {
          const buffer = Buffer.from(chunk);
          if (socket.data.stream) socket.data.stream.write(buffer);
          else socket.data.pending.push(buffer);
        },
        close(socket) {
          closeSocket(socket);
        },
        error(socket, error) {
          closeSocket(socket, error);
        },
      },
    });

    const closeTunnel = (error?: Error) => {
      if (closing) return;
      closing = true;
      for (const socket of sockets) closeSocket(socket, error);
      closeQuietly(() => client.end());
      server.stop();
    };

    client.once("error", (error) => closeTunnel(error));
    client.once("close", () => closeTunnel());

    return { close: closeTunnel };
  } catch (error) {
    closeQuietly(() => client.end());
    throw error;
  }
};

const closeBunSocket = (socket: BunSocket, error?: Error) => {
  if (socket.data.closed) return;
  socket.data.closed = true;
  if (error) socket.data.stream?.destroy();
  else socket.data.stream?.end();
  closeQuietly(() => socket.end());
};
