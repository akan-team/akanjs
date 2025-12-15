import { getNonArrayModel, Type } from "@akanjs/base";
import { type Logger, lowerlize } from "@akanjs/common";
import { deserializeArg } from "@akanjs/constant";
import { getServiceRefs, isServiceEnabled } from "@akanjs/service";
import { ArgMeta, getArgMetas, getGqlMetas, getSigMeta, GqlMeta, InternalArgMeta } from "@akanjs/signal";
import { getQueueToken, Process, Processor } from "@nestjs/bull";
import { Inject } from "@nestjs/common";
import type { DoneCallback, Job, Queue } from "bull";

const convertProcessFunction = (
  gqlMeta: GqlMeta,
  argMetas: ArgMeta[],
  internalArgMetas: InternalArgMeta[],
  fn: (...args) => any
) => {
  return async function (this: { logger?: Logger }, job: Job<any[]>, done: DoneCallback) {
    const args: any[] = [];
    argMetas.forEach((argMeta) => {
      const [argRef, arrDepth] = getNonArrayModel(argMeta.returns() as Type);
      if (argMeta.type === "Msg")
        args[argMeta.idx] = deserializeArg(argRef, arrDepth, job.data[argMeta.idx], argMeta.argsOption);
      else throw new Error(`Invalid ArgMeta Type ${argMeta.type}`);
    });
    args[argMetas.length] = job;
    this.logger?.log(`Process-${gqlMeta.key} started`);
    const result = (await fn.apply(this, args)) as object;
    this.logger?.log(`Process-${gqlMeta.key} finished`);
    done(null, result); // !테스트해봐야함
  };
};

export const processorOf = (sigRef: Type, allSrvs: { [key: string]: Type }) => {
  const sigMeta = getSigMeta(sigRef);
  const serverMode = process.env.SERVER_MODE ?? "federation";
  const gqlMetas = getGqlMetas(sigRef)
    .filter((gqlMeta) => gqlMeta.type === "Process")
    .filter(
      (gqlMeta) =>
        gqlMeta.signalOption.serverMode === "all" ||
        serverMode === "all" ||
        gqlMeta.signalOption.serverMode === serverMode
    );
  class QueueProcessor {}

  // 1. Inject All Services
  Object.keys(allSrvs).forEach((srvName) => {
    if (!isServiceEnabled(allSrvs[srvName])) return;
    const srvRef = getServiceRefs(srvName)[0];
    Inject(srvRef)(QueueProcessor.prototype, lowerlize(srvName));
  });

  // 2. Resolve Process
  for (const gqlMeta of gqlMetas) {
    const [argMetas, internalArgMetas] = getArgMetas(sigRef, gqlMeta.key);
    const descriptor = gqlMeta.descriptor;
    descriptor.value = convertProcessFunction(
      gqlMeta,
      argMetas,
      internalArgMetas,
      descriptor.value as (...args) => any
    );
    Object.defineProperty(QueueProcessor.prototype, gqlMeta.key, descriptor);
    Process(gqlMeta.key)(QueueProcessor.prototype, gqlMeta.key, descriptor);
  }
  Processor(sigMeta.refName)(QueueProcessor);
  return QueueProcessor;
};

export const applyQueueSignal = (targetRef: Type, sigRef: Type) => {
  const sigMeta = getSigMeta(sigRef);
  const gqlMetas = getGqlMetas(sigRef).filter((gqlMeta) => gqlMeta.type === "Process");
  Inject(getQueueToken(sigMeta.refName))(targetRef.prototype as object, "queue");
  for (const gqlMeta of gqlMetas) {
    if ((targetRef.prototype as object)[gqlMeta.key])
      throw new Error(`Queue already has ${gqlMeta.key} in ${sigMeta.refName}`);
    (targetRef.prototype as object)[gqlMeta.key] = function (...args) {
      return (this as { queue: Queue }).queue.add(gqlMeta.key, args);
    };
  }
  return targetRef;
};
