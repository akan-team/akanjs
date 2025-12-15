import { arraiedModel, getNonArrayModel, isGqlScalar, JSON as GqlJSON, type Type } from "@akanjs/base";
import { constantInfo, getFieldMetas, getScalarExample } from "@akanjs/constant";

import { SerializedArg, SerializedEndpoint } from ".";
import { SignalType } from "./signalDecorators";

class ResponseExampleStorage {}

const getPredefinedRequestExample = (modelRef: Type) => {
  return Reflect.getMetadata(modelRef, ResponseExampleStorage.prototype) as { [key: string]: any } | undefined;
};
const getPredefinedResponseExample = (modelRef: Type) => {
  return Reflect.getMetadata(modelRef, ResponseExampleStorage.prototype) as { [key: string]: any } | undefined;
};

const getResponseExample = (ref: Type | Type[]) => {
  const [modelRef, arrDepth] = getNonArrayModel(ref);
  const existing = getPredefinedRequestExample(modelRef);
  if (existing) return existing;
  const isScalar = isGqlScalar(modelRef);
  if (isScalar) return arraiedModel(getScalarExample(modelRef), arrDepth);
  const fieldMetas = getFieldMetas(modelRef);
  const example: { [key: string]: any } = {};
  fieldMetas.forEach((fieldMeta) => {
    if (fieldMeta.example) example[fieldMeta.key] = fieldMeta.example as unknown;
    else if (fieldMeta.enum)
      example[fieldMeta.key] = arraiedModel<string>(fieldMeta.enum.values[0] as string, fieldMeta.arrDepth);
    else example[fieldMeta.key] = getResponseExample(fieldMeta.modelRef);
  });
  const result = arraiedModel(example, arrDepth);
  Reflect.defineMetadata(ref, result, ResponseExampleStorage.prototype);
  return result;
};

class RequestExampleStorage {}

const getRequestExample = (ref: Type) => {
  const existing = getPredefinedRequestExample(ref);
  if (existing) return existing;
  const fieldMetas = getFieldMetas(ref);
  const example = {};
  const isScalar = isGqlScalar(ref);
  if (isScalar) return getScalarExample(ref);
  else {
    fieldMetas.forEach((fieldMeta) => {
      if (!fieldMeta.isScalar && fieldMeta.isClass) example[fieldMeta.key] = "ObjectID";
      else
        example[fieldMeta.key] = (
          (fieldMeta.example ?? fieldMeta.enum)
            ? arraiedModel(fieldMeta.example ?? (fieldMeta.enum?.values as string[])[0], fieldMeta.optArrDepth)
            : arraiedModel(getRequestExample(fieldMeta.modelRef), fieldMeta.arrDepth)
        ) as unknown;
    });
  }

  Reflect.defineMetadata(ref, example, RequestExampleStorage.prototype);
  return example;
};

export const makeRequestExample = (gqlMeta: SerializedEndpoint) => {
  return getExampleData(gqlMeta.args);
};
export const getExampleData = (argMetas: SerializedArg[], signalType: SignalType = "graphql"): { [key: string]: any } =>
  Object.fromEntries(
    argMetas
      .filter((argMeta) => argMeta.type !== "Upload")
      .map((argMeta) => {
        const argRef = constantInfo.getModelRef(argMeta.refName, argMeta.modelType);
        const example = argMeta.argsOption.example ?? getRequestExample(argRef);
        return [
          argMeta.name,
          arraiedModel(
            signalType === "restapi" && argRef.prototype === GqlJSON.prototype
              ? JSON.stringify(example, null, 2)
              : example,
            argMeta.arrDepth
          ),
        ];
      })
  );

export const makeResponseExample = (gqlMeta: SerializedEndpoint) => {
  const returnRef = constantInfo.getModelRef(gqlMeta.returns.refName, gqlMeta.returns.modelType);
  const example = getResponseExample(arraiedModel(returnRef, gqlMeta.returns.arrDepth));
  return example;
};
