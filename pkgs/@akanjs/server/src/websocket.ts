import { Type } from "@akanjs/base";
import { lowerlize } from "@akanjs/common";
import { getBodyPipes, getNestParamDecorator } from "@akanjs/nest";
import { getServiceRefs, isServiceEnabled } from "@akanjs/service";
import { type ArgMeta, getArgMetas, getGqlMetas, getSigMeta } from "@akanjs/signal";
import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor, UseInterceptors } from "@nestjs/common";
import { MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import type { Server, Socket } from "socket.io";

export interface Response<T> {
  data: T;
}

@Injectable()
class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const [, gqlKey] = [context.getArgByIndex(1), context.getArgByIndex(3)] as [string, string];
    return next.handle().pipe(map((data: T) => ({ event: gqlKey, data })));
  }
}

const makeRoomId = (gqlKey: string, argValues: any[]) => `${gqlKey}-${argValues.join("-")}`;
const getPubsubInterceptor = (argMetas: ArgMeta[]) => {
  @Injectable()
  class PubsubInterceptor implements NestInterceptor<{ roomId: string }, Response<{ roomId: string }>> {
    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<Response<{ roomId: string }>>> {
      const [socket, { __subscribe__, ...body }, gqlKey]: [
        Socket,
        { [key: string]: any } & { __subscribe__?: boolean },
        string,
      ] = [context.getArgByIndex(0), context.getArgByIndex(1), context.getArgByIndex(3)];
      const roomId = makeRoomId(
        gqlKey,
        argMetas.map((argMeta) => body[argMeta.name] as string | number)
      );
      if (__subscribe__) await socket.join(roomId);
      else await socket.leave(roomId);
      return next.handle().pipe(map(() => ({ event: gqlKey, data: { roomId, __subscribe__ } })));
    }
  }
  return PubsubInterceptor;
};

export const websocketOf = (sigRef: Type, allSrvs: { [key: string]: Type }) => {
  const sigMeta = getSigMeta(sigRef);

  class WsGateway {
    __sigRef__ = sigRef;
  }

  // 1. Inject All Services
  Object.keys(allSrvs).forEach((srvName) => {
    if (!isServiceEnabled(allSrvs[srvName])) return;
    const srvRef = getServiceRefs(srvName)[0];
    Inject(srvRef)(WsGateway.prototype, lowerlize(srvName));
  });

  // 2. Apply Message Signals
  const messageGqlMetas = getGqlMetas(sigRef).filter((gqlMeta) => gqlMeta.type === "Message");
  for (const gqlMeta of messageGqlMetas) {
    const descriptor = gqlMeta.descriptor;
    Object.defineProperty(WsGateway.prototype, gqlMeta.key, descriptor);
    const [argMetas, internalArgMetas] = getArgMetas(sigRef, gqlMeta.key);
    argMetas.forEach((argMeta) => {
      if (argMeta.type !== "Msg")
        throw new Error(`Argument of Message should be Msg ${sigMeta.refName}-${gqlMeta.key}-${argMeta.name}`);
      MessageBody(argMeta.name, ...getBodyPipes(argMeta))(WsGateway.prototype, gqlMeta.key, argMeta.idx);
    });
    internalArgMetas.forEach((internalArgMeta) => {
      const internalDecorator = getNestParamDecorator(internalArgMeta.type);
      internalDecorator(internalArgMeta.option ?? {})(WsGateway.prototype, gqlMeta.key, internalArgMeta.idx);
    });
    UseInterceptors(TransformInterceptor)(WsGateway.prototype, gqlMeta.key, gqlMeta.descriptor);
    SubscribeMessage(gqlMeta.key)(WsGateway.prototype, gqlMeta.key, descriptor);
  }

  // 3. Apply Pubsub Signals
  const pubsubGqlMetas = getGqlMetas(sigRef).filter((gqlMeta) => gqlMeta.type === "Pubsub");
  for (const gqlMeta of pubsubGqlMetas) {
    const descriptor = gqlMeta.descriptor;
    Object.defineProperty(WsGateway.prototype, gqlMeta.key, descriptor);
    const [argMetas, internalArgMetas] = getArgMetas(sigRef, gqlMeta.key);
    argMetas.forEach((argMeta) => {
      if (argMeta.type !== "Room")
        throw new Error(`Argument of Message should be Room ${sigMeta.refName}-${gqlMeta.key}-${argMeta.name}`);
      MessageBody(argMeta.name, ...getBodyPipes(argMeta))(WsGateway.prototype, gqlMeta.key, argMeta.idx);
    });
    internalArgMetas.forEach((internalArgMeta) => {
      const internalDecorator = getNestParamDecorator(internalArgMeta.type);
      internalDecorator(internalArgMeta.option ?? {})(WsGateway.prototype, gqlMeta.key, internalArgMeta.idx);
    });
    UseInterceptors(getPubsubInterceptor(argMetas))(WsGateway.prototype, gqlMeta.key, gqlMeta.descriptor);
    SubscribeMessage(gqlMeta.key)(WsGateway.prototype, gqlMeta.key, descriptor);
  }

  WebSocketGateway({ cors: { origin: "*" }, transports: ["websocket"] })(WsGateway);
  return WsGateway;
};

export const applyWebsocketSignal = (targetRef: Type, sigRef: Type): Type<{ websocket: Server }> => {
  const pubsubGqlMetas = getGqlMetas(sigRef).filter((gqlMeta) => gqlMeta.type === "Pubsub");

  WebSocketGateway({ cors: { origin: "*" }, transports: ["websocket"] })(targetRef);
  WebSocketServer()(targetRef.prototype as object, "websocket");
  for (const gqlMeta of pubsubGqlMetas) {
    const [argMetas] = getArgMetas(sigRef, gqlMeta.key);
    (targetRef.prototype as object)[gqlMeta.key] = function (...args: (string | number)[]) {
      const roomId = makeRoomId(
        gqlMeta.key,
        argMetas.map((argMeta) => args[argMeta.idx])
      );
      (this as { websocket: Server }).websocket.to(roomId).emit(roomId, args.at(-1));
    };
  }
  return targetRef;
};
