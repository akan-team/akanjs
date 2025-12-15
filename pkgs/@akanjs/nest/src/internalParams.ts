import { Type } from "@akanjs/base";
import { ArgsOption } from "@akanjs/signal";
import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import type { Socket } from "socket.io";

import { getRequest, getResponse } from "./authorization";

export interface InternalParamPipe<ParamType = any> {
  getParam: (context: ExecutionContext) => ParamType | null;
}
export type InternalParam<ParamType = any> = Type<InternalParamPipe<ParamType>>;

const paramDecoratorCache = new Map<InternalParam, (option: ArgsOption) => ParameterDecorator>();
export const getNestParamDecorator = (pipe: InternalParam) => {
  const existingParamDecorator = paramDecoratorCache.get(pipe);
  if (existingParamDecorator) return existingParamDecorator;
  const pipeInstance = new pipe();
  const paramDecorator = createParamDecorator((option: ArgsOption, context: ExecutionContext) => {
    const param = pipeInstance.getParam(context) as object | null | undefined;
    if (!option.nullable && (param === null || param === undefined)) throw new Error(`${pipe.name} is required`);
    return param;
  });
  paramDecoratorCache.set(pipe, paramDecorator as (option: ArgsOption) => ParameterDecorator);
  return paramDecorator as (option: ArgsOption) => ParameterDecorator;
};

export class Req implements InternalParamPipe {
  getParam(context: ExecutionContext): ExpressRequest & { [key: string]: any } {
    return getRequest(context) as ExpressRequest & { [key: string]: any };
  }
}
export class Res implements InternalParamPipe {
  getParam(context: ExecutionContext) {
    return getResponse(context) as ExpressResponse;
  }
}

export class Ws implements InternalParamPipe {
  getParam(context: ExecutionContext) {
    const socket: Socket = context.getArgByIndex(0);
    const { __subscribe__ }: { __subscribe__: boolean } = context.getArgByIndex(1);
    return {
      socket,
      subscribe: __subscribe__,
      onDisconnect: (handler: () => void) => {
        socket.on("disconnect", handler);
      },
      onSubscribe: (handler: () => void) => {
        if (__subscribe__) handler();
      },
      onUnsubscribe: (handler: () => void) => {
        if (!__subscribe__) handler();
      },
    };
  }
}
