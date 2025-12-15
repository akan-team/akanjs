import { baseClientEnv, baseEnv } from "@akanjs/base";
import { Logger, sleep } from "@akanjs/common";
import { cacheExchange, type Client as GqlClient, createClient, fetchExchange } from "@urql/core";
import type * as dgram from "dgram";
import { io, type Socket } from "socket.io-client";

interface SubscribeOption {
  key: string;
  roomId: string;
  message: { [key: string]: any };
}
class SocketIo {
  socket: Socket;
  roomSubscribeMap = new Map<string, SubscribeOption>();
  constructor(uri: string) {
    this.socket = io(uri, { transports: ["websocket"] });
    // send subscribe when reconnected
    this.socket.on("connect", () => {
      this.roomSubscribeMap.forEach((option) => {
        this.socket.emit(option.key, { ...option.message, __subscribe__: true });
      });
    });
  }
  on(event: string, callback: (data: any) => void) {
    this.socket.on(event, callback);
  }
  once(event: string, callback: (data: any) => void) {
    this.socket.once(event, callback);
  }
  removeListener(event: string, callback?: (data: any) => void) {
    this.socket.removeListener(event, callback);
  }
  removeAllListeners() {
    this.socket.removeAllListeners();
  }
  hasListeners(event: string) {
    return this.socket.hasListeners(event);
  }
  emit(key: string, data: any, { volatile = false, timeout }: { volatile?: boolean; timeout?: number } = {}) {
    let socket = this.socket;
    if (volatile) socket = socket.volatile;
    if (timeout) socket = socket.timeout(timeout);
    socket.emit(key, data);
  }
  subscribe(option: {
    key: string;
    roomId: string;
    message: { [key: string]: any };
    handleEvent: (data: any) => void;
  }) {
    if (!this.roomSubscribeMap.has(option.roomId)) {
      this.roomSubscribeMap.set(option.roomId, option);
      this.socket.emit(option.key, { ...option.message, __subscribe__: true });
    }
    this.socket.on(option.roomId, option.handleEvent);
  }
  unsubscribe(roomId: string, handleEvent: (data: any) => void) {
    this.socket.removeListener(roomId, handleEvent);
    const option = this.roomSubscribeMap.get(roomId);
    if (this.hasListeners(roomId) || !option) return;
    this.roomSubscribeMap.delete(roomId);
    this.socket.emit(option.key, { ...option.message, __subscribe__: false });
  }
  disconnect() {
    this.socket.disconnect();
    return this;
  }
}

class Client {
  static globalIoMap = new Map<string, SocketIo>();
  static tokenStore = new Map<Client, string>();

  async waitUntilWebSocketConnected(ws = baseClientEnv.serverWsUri) {
    if (baseClientEnv.side === "server") return true;
    while (!this.getIo(ws).socket.connected) {
      Logger.verbose("waiting for websocket to initialize...");
      await sleep(300);
    }
  }
  isInitialized = false;
  uri = baseClientEnv.serverGraphqlUri;
  ws = baseClientEnv.serverWsUri;
  udp: dgram.Socket | null = null;
  gql: GqlClient = createClient({ url: this.uri, fetch, exchanges: [cacheExchange, fetchExchange] });
  jwt = null as string | undefined | null;
  async getJwt(): Promise<string | null> {
    const isNextServer = baseClientEnv.side === "server" && baseEnv.operationType === "client";
    if (isNextServer) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nextHeaders = require("next/headers") as {
        cookies?: () => Promise<Map<string, { value: string }>>;
        headers?: () => Promise<Map<string, string>>;
      };
      return (
        (await nextHeaders.cookies?.())?.get("jwt")?.value ??
        (await nextHeaders.headers?.())?.get("jwt") ??
        this.jwt ??
        null
      );
    } else return Client.tokenStore.get(this) ?? null;
  }
  io: SocketIo | null = null;
  init(data: Partial<Client> = {}) {
    Object.assign(this, data);
    this.setLink(data.uri);
    this.setIo(data.ws);
    this.isInitialized = true;
  }
  setIo(ws = baseClientEnv.serverWsUri) {
    this.ws = ws;
    const existingIo = Client.globalIoMap.get(ws);
    if (existingIo) {
      this.io = existingIo;
      return;
    }
    this.io = new SocketIo(ws);
    Client.globalIoMap.set(ws, this.io);
  }
  getIo(ws = baseClientEnv.serverWsUri) {
    const existingIo = Client.globalIoMap.get(ws);
    if (existingIo) return existingIo;
    const io = new SocketIo(ws);
    Client.globalIoMap.set(ws, io);
    return io;
  }
  setLink(uri = baseClientEnv.serverGraphqlUri) {
    this.uri = uri;
    this.gql = createClient({
      url: this.uri,
      fetch,
      exchanges: [cacheExchange, fetchExchange],
      // requestPolicy: "network-only",
      fetchOptions: () => {
        return {
          headers: {
            "apollo-require-preflight": "true",
            ...(this.jwt ? { authorization: `Bearer ${this.jwt}` } : {}),
          },
        };
      },
    });
  }
  setJwt(jwt: string) {
    Client.tokenStore.set(this, jwt);
  }
  reset() {
    this.io?.disconnect();
    this.io = null;
    this.jwt = null;
  }
  clone(data: Partial<Client> = {}) {
    const newClient = new Client();
    newClient.init({ ...this, ...data });
    if (data.jwt) Client.tokenStore.set(newClient, data.jwt);
    return newClient;
  }
  terminate() {
    this.reset();
    Client.globalIoMap.forEach((io) => io.disconnect());
    this.isInitialized = false;
  }
  setUdp(udp: dgram.Socket) {
    this.udp = udp;
  }
}

export const client = new Client();
export type { Client, SocketIo };
