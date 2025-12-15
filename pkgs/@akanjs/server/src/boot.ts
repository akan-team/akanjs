/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { BackendEnv, baseEnv, logo } from "@akanjs/base";
import { Logger } from "@akanjs/common";
import {
  AllExceptionsFilter,
  CacheClient,
  CacheInterceptor,
  DatabaseClient,
  generateJwtSecret,
  generateMeiliKey,
  generateMeiliUri,
  generateMongoUri,
  generateRedisUri,
  initMongoDB,
  LoggingInterceptor,
  RedisIoAdapter,
  SearchClient,
  TimeoutInterceptor,
} from "@akanjs/nest";
import { signalInfo } from "@akanjs/signal";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { BullModule } from "@nestjs/bull";
import { DynamicModule, Global, INestApplication, Module, NestApplicationOptions } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { GraphQLModule } from "@nestjs/graphql";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { json, urlencoded } from "body-parser";
import cookieParser from "cookie-parser";
import events from "events";
import { graphqlUploadExpress } from "graphql-upload";
import { MeiliSearch } from "meilisearch";
import mongoose from "mongoose";
import { createClient } from "redis";

import { registerBaseModule } from "./base.module";
import { DateScalar } from "./gql";
import { Middleware, useGlobals } from "./module";
import { makeScheduleModule } from "./schedule";
import { SearchDaemonModule } from "./searchDaemon";

interface AppCreateForm {
  registerModules: (options: any) => (DynamicModule | null)[];
  registerMiddlewares: (options: any) => Middleware[];
  serverMode?: "federation" | "batch" | "all" | "none";
  env: BackendEnv;
  log?: boolean;
  nestOptions?: NestApplicationOptions;
}
export interface BackendApp {
  nestApp: INestApplication;
  close: () => Promise<void>;
}

export const createNestApp = async ({
  registerModules,
  registerMiddlewares,
  serverMode = "federation",
  env,
  log = true,
  nestOptions = {},
}: AppCreateForm) => {
  const backendLogger = new Logger("Backend");
  if (log) backendLogger.rawLog(logo);
  // 0. Set up signal & secrets
  signalInfo.initialize();
  const jwtSecret = generateJwtSecret(env.appName, env.environment);

  const [redisUri, mongoUri, meiliUri] = await Promise.all([
    env.redisUri ??
      generateRedisUri({ ...env, ...(env.redis?.sshOptions ? { sshOptions: env.redis.sshOptions } : {}) }),
    env.mongoUri ??
      generateMongoUri({
        ...env,
        ...(env.mongo?.username ? { username: env.mongo.username } : {}),
        password: env.mongo?.password,
        ...(env.mongo?.sshOptions ? { sshOptions: env.mongo.sshOptions } : {}),
      }),
    env.meiliUri ?? generateMeiliUri(env),
  ]);

  if (env.operationMode === "local") {
    backendLogger.verbose(`connect to redis: ${redisUri}`);
    backendLogger.verbose(`connect to mongo: ${mongoUri}`);
    backendLogger.verbose(`connect to meili: ${meiliUri}`);
  }

  // 1. Set up mongoose
  initMongoDB({ logging: baseEnv.environment !== "main", sendReport: false });

  // 2. Set up event emitter
  (events.EventEmitter as unknown as { defaultMaxListeners: number }).defaultMaxListeners = 1000;

  const redisClient = await createClient({ url: redisUri }).connect();
  @Global()
  @Module({
    providers: [
      { provide: "REDIS_CLIENT", useValue: redisClient },
      {
        provide: "MEILI_CLIENT",
        useFactory: () => new MeiliSearch({ host: meiliUri, apiKey: generateMeiliKey(env) }),
      },
      { provide: "GLOBAL_ENV", useValue: env },
      { provide: "MONGO_CLIENT", useValue: mongoose.connection },
    ],
    exports: ["REDIS_CLIENT", "MEILI_CLIENT", "GLOBAL_ENV", "MONGO_CLIENT"],
  })
  class GlobalProvideModule {}

  @Module({
    imports: [
      BullModule.forRoot({ redis: redisUri }),
      ScheduleModule.forRoot(),
      GraphQLModule.forRootAsync<ApolloDriverConfig>({
        imports: [],
        useFactory: () => ({
          useGlobalPrefix: true,
          autoSchemaFile: true,
          sortSchema: true,
          playground: baseEnv.environment !== "main",
          introspection: baseEnv.environment !== "main",
          uploads: false,
          debug: false,
        }),
        driver: ApolloDriver,
      }),
      MongooseModule.forRootAsync({
        useFactory: () => ({ uri: mongoUri, autoIndex: baseEnv.environment !== "main" }),
      }),
      GlobalProvideModule,
      useGlobals({
        injects: { SearchClient, DatabaseClient, CacheClient },
      }),
      ...(["batch", "all"].includes(serverMode) && baseEnv.operationMode !== "edge" ? [SearchDaemonModule] : []),
      ...([registerBaseModule(env), ...registerModules(env)].filter((m) => !!m) as unknown as DynamicModule[]),
      makeScheduleModule(serverMode, env),
    ],
    providers: [DateScalar],
  })
  class AppModule {}

  // create Nestapp
  const app = await NestFactory.create(AppModule, { logger: backendLogger, ...nestOptions });
  const redisIoAdapter = new RedisIoAdapter(app, { jwtSecret });
  await redisIoAdapter.connectToRedis(redisUri);
  app.enableShutdownHooks();

  if (env.operationMode !== "local" && process.env.USE_REDIS_IO_ADAPTER !== "false")
    app.useWebSocketAdapter(redisIoAdapter);

  if (["federation", "all"].includes(serverMode)) {
    app.setGlobalPrefix(process.env.GLOBAL_PREFIX ?? "/backend");
    app.enableCors({
      origin: "*",
      methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
      preflightContinue: false,
      optionsSuccessStatus: 204,
      allowedHeaders:
        "DNT,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization,apollo-require-preflight",
    });
    app.use(json({ limit: "100mb" }));
    app.use(urlencoded({ limit: "100mb", extended: true }));
    app.use("/backend/graphql", graphqlUploadExpress());
    app.use(cookieParser());
    app.useGlobalInterceptors(new LoggingInterceptor());
    app.useGlobalInterceptors(new TimeoutInterceptor());
    app.useGlobalInterceptors(new CacheInterceptor(redisClient));
    app.useGlobalFilters(new AllExceptionsFilter());

    const middlewares = registerMiddlewares(env);
    if (middlewares.length > 0) app.use(...middlewares);
    await app.listen(process.env.PORT ?? env.port ?? 8080);
    backendLogger.log(`🚀 Server is running on: ${await app.getUrl()}`);
  } else {
    await app.init();
    backendLogger.log(`🚀 Batch Server is running`);
  }
  if ((module as any).hot) {
    (module as any).hot.accept();
    (module as any).hot.dispose(() => {
      void app.close();
    });
  }
  return {
    nestApp: app,
    close: async () => {
      await app.close();
      await redisIoAdapter.destroy();
      await redisClient.quit();
    },
  };
};
