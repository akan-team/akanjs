import { baseEnv, Environment } from "@akanjs/base";
import { Logger } from "@akanjs/common";
import { ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import * as jwt from "jsonwebtoken";
import { Socket } from "socket.io";

interface ResolvedToken {
  appName: string;
  environment: Environment;
}
export const resolveJwt = <Resolved extends ResolvedToken>(
  secret: string,
  authorization: string | undefined,
  defaultResolved: Resolved
): Resolved => {
  const [type, token] = authorization?.split(" ") ?? [undefined, undefined];
  if (!token || type !== "Bearer") return defaultResolved;
  try {
    const resolved = jwt.verify(token, secret) as Resolved;
    if (resolved.appName !== baseEnv.appName || resolved.environment !== baseEnv.environment) return defaultResolved;
    return resolved;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    Logger.error(`failed to verify token for ${authorization}: ${message}`);
    return defaultResolved;
  }
};

export interface ReqType {
  method: string;
  url: string;
  params: object;
  query: object;
  body: object;
}
export interface GqlReqType {
  parentType?: { name?: string };
  fieldName?: string;
}
export const getRequest = (context: ExecutionContext): unknown => {
  const type = context.getType();
  if (type === "ws") throw new Error("Getting Request in Websocket is not allowed");
  return type === "http"
    ? context.switchToHttp().getRequest<unknown>()
    : GqlExecutionContext.create(context).getContext<{ req: unknown }>().req;
};
export const getResponse = (context: ExecutionContext): unknown => {
  const type = context.getType();
  if (type === "ws") throw new Error("Getting Response in Websocket is not allowed");
  return type === "http"
    ? context.switchToHttp().getResponse<unknown>()
    : GqlExecutionContext.create(context).getContext<{ req: { res: unknown } }>().req.res;
};
export const getArgs = (context: ExecutionContext): { [key: string]: any } => {
  const type = context.getType<"http" | "ws" | "graphql" | "unknown">();
  if (type === "ws") throw new Error("Getting Args in Websocket is not allowed");
  if (type === "graphql") return GqlExecutionContext.create(context).getArgs<{ [key: string]: any }>();
  else if (type === "http") {
    const { params, query, body } = context.switchToHttp().getRequest<ReqType>();
    return { ...params, ...query, ...body } as { [key: string]: any };
  } else throw new Error("Getting Args in Unknown context is not allowed");
};
export const getSocket = (context: ExecutionContext) => {
  const type = context.getType();
  if (type !== "ws") throw new Error("Getting Socket in Http or GraphQL is not allowed");
  const socket: Socket = context.getArgByIndex(0);
  return socket;
};
