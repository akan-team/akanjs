import { getNonArrayModel, Type, Upload } from "@akanjs/base";
import { lowerlize } from "@akanjs/common";
import { getBodyPipes, getNestParamDecorator, getQueryPipes, MulterToUploadPipe, None } from "@akanjs/nest";
import { getServiceRefs, isServiceEnabled } from "@akanjs/service";
import {
  ArgMeta,
  copySignal,
  getArgMetas,
  getControllerPath,
  getControllerPrefix,
  getGqlMetas,
  getSigMeta,
} from "@akanjs/signal";
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";

// TODO: user.signal에서 SSO를 선언하면 authguard가 shared, social, app 등 여러번 적용돼서 중복에러가 뜸. 나중에 signalmeta를 잘 모아서 하나의 signal로 만들어서 해결해야함.
const processedKeys = new Set<string>();

export const controllerOf = (sigRef: Type, allSrvs: { [key: string]: Type }) => {
  const sigMeta = getSigMeta(sigRef);
  const gqlMetas = getGqlMetas(sigRef);
  const prefix = getControllerPrefix(sigMeta);
  const Ctrl = copySignal(sigRef);

  // 1. Inject All Services
  Object.keys(allSrvs).forEach((srvName) => {
    if (!isServiceEnabled(allSrvs[srvName])) return;
    const srvRef = getServiceRefs(srvName)[0];
    Inject(srvRef)(Ctrl.prototype, lowerlize(srvName));
  });

  // 2. Resolve Apis
  for (const gqlMeta of gqlMetas) {
    if (
      gqlMeta.signalOption.guards?.some((guard) => guard === None) ||
      gqlMeta.signalOption.onlyFor === "graphql" ||
      !["Query", "Mutation"].includes(gqlMeta.type) ||
      processedKeys.has(gqlMeta.key)
    )
      continue;
    const [argMetas, internalArgMetas] = getArgMetas(Ctrl, gqlMeta.key);
    internalArgMetas.forEach((internalArgMeta) => {
      const internalDecorator = getNestParamDecorator(internalArgMeta.type);
      internalDecorator(internalArgMeta.option ?? {})(Ctrl.prototype, gqlMeta.key, internalArgMeta.idx);
    });

    // TODO: Should be optimized later
    const uploadArgMeta = argMetas.find((argMeta) => getNonArrayModel(argMeta.returns() as Type)[0] === Upload);
    if (uploadArgMeta && gqlMeta.signalOption.onlyFor === "restapi") {
      const [modelRef, arrDepth] = getNonArrayModel(uploadArgMeta.returns() as Type);
      if (modelRef.prototype !== Upload.prototype) throw new Error("Upload must be Upload");
      else if (!arrDepth) throw new Error(`Only Array of Upload is allowed - ${sigMeta.refName}/${gqlMeta.key}`);
      UseInterceptors(FilesInterceptor(uploadArgMeta.name))(Ctrl.prototype, gqlMeta.key, gqlMeta.descriptor);
      UploadedFiles(MulterToUploadPipe)(Ctrl.prototype, gqlMeta.key, uploadArgMeta.idx);
    }

    const queryArgMetas = argMetas.filter((argMeta) => argMeta.type === "Query");
    queryArgMetas.forEach((argMeta: ArgMeta) => {
      const [modelRef, arrDepth] = getNonArrayModel(argMeta.returns() as Type);
      Query(argMeta.name, ...getQueryPipes(modelRef, arrDepth))(Ctrl.prototype, gqlMeta.key, argMeta.idx);
    });
    const paramArgMetas = argMetas.filter((argMeta) => argMeta.type === "Param");
    paramArgMetas.forEach((argMeta: ArgMeta) => {
      Param(argMeta.name)(Ctrl.prototype, gqlMeta.key, argMeta.idx);
    });
    const path = getControllerPath(gqlMeta, paramArgMetas);

    // TODO: Should be optimized later
    const bodyArgMetas = argMetas.filter(
      (argMeta) => argMeta.type === "Body" && getNonArrayModel(argMeta.returns() as Type)[0] !== Upload
    );
    if (bodyArgMetas.length)
      bodyArgMetas.forEach((argMeta: ArgMeta) => {
        Body(argMeta.name, ...getBodyPipes(argMeta))(Ctrl.prototype, gqlMeta.key, argMeta.idx);
      });

    UseGuards(...(gqlMeta.signalOption.guards ?? []))(Ctrl.prototype, gqlMeta.key, gqlMeta.descriptor);

    if (gqlMeta.type === "Query") Get(path)(Ctrl.prototype, gqlMeta.key, gqlMeta.descriptor);
    else if (gqlMeta.type === "Mutation") Post(path)(Ctrl.prototype, gqlMeta.key, gqlMeta.descriptor);
    processedKeys.add(gqlMeta.key);
  }
  if (prefix) Controller(prefix)(Ctrl);
  else Controller()(Ctrl);
  return Ctrl;
};
