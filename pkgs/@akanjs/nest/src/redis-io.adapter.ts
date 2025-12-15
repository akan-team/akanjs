import { Logger, sleep } from "@akanjs/common";
import { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, RedisClientType } from "redis";
import { type Server, ServerOptions } from "socket.io";

interface RedisIoAdapterOption extends Partial<ServerOptions> {
  jwtSecret: string;
}

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger: Logger = new Logger("RedisIoAdapter");
  private server: Server;
  private pubClient: RedisClientType;
  private subClient: RedisClientType;

  option: RedisIoAdapterOption;
  constructor(appOrHttpServer: INestApplicationContext, option: RedisIoAdapterOption) {
    super(appOrHttpServer);
    this.option = option;
  }
  async connectToRedis(url: string): Promise<void> {
    this.pubClient = createClient({ url });
    this.subClient = this.pubClient.duplicate();
    this.pubClient.on("disconnect", (err) => {
      this.logger.error(`Redis pub database is disconnected. Error: ${err}`);
      void this.pubClient.connect();
    });
    this.subClient.on("disconnect", (err) => {
      this.logger.error(`Redis sub database is disconnected. Error: ${err}`);
      void this.subClient.connect();
    });
    this.pubClient.on("error", (err) => {
      this.logger.error(`Redis pub database is errored. Error: ${err}`);
      const reconnect = async () => {
        await this.pubClient.quit();
        await sleep(1000);
        await this.pubClient.connect();
      };
      void reconnect();
    });
    this.subClient.on("error", (err) => {
      this.logger.error(`Redis sub database is errored. Error: ${err}`);
      const reconnect = async () => {
        await this.subClient.quit();
        await sleep(1000);
        await this.subClient.connect();
      };
      void reconnect();
    });
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }
  createIOServer(port: number, options?: ServerOptions): any {
    this.server = super.createIOServer(port, options) as Server;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.server.adapter(this.adapterConstructor as any);
    // server.use(async (socket: AuthenticatedSocket, next) => {
    //   console.log("Inside Websocket Middleware");
    //   try {
    //     const { cookie: clientCookie } = socket.handshake.headers;
    //     if (!clientCookie) {
    //       console.log("Client has no cookies");
    //       return next(new Error("Not Authenticated. No cookies were sent"));
    //     }
    //     const { JWT } = cookie.parse(clientCookie);
    //     console.log("JWT", JWT);
    //     if (!JWT) {
    //       console.log("JWT DOES NOT EXIST");
    //       return next(new Error("Not Authenticated"));
    //     }
    //     const user = verifyToken(this.option.jwtSecret, JWT);
    //     if (!user) return next(new Error("Error signing cookie"));
    //     //   const sessionDB = await sessionRepository.findOne({ id: signedCookie });
    //     //   if (!sessionDB) return next(new Error("No session found"));

    //     socket.user = user;
    //     console.log("PASSSSS", user);
    //     next();
    //   } catch (e) {
    //     Logger.error(`SOCKET-MIDDLEWARE: ${e.message}`);
    //   }
    // });
    return this.server;
  }
  async destroy() {
    await Promise.all([this.pubClient.quit(), this.subClient.quit()]);
    await this.close(this.server);
    this.logger.log("RedisIoAdapter is closed");
  }
}
