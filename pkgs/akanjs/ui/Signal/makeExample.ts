import {
  Any,
  arraiedModel,
  type Cls,
  EXAMPLE_VALUE,
  FIELD_META,
  getNonArrayModel,
  PrimitiveRegistry,
  type PrimitiveScalar,
} from "akanjs/base";
import { type ConstantCls, ConstantRegistry } from "akanjs/constant";

import type { SerializedArg, SerializedEndpoint, SignalType } from "akanjs/signal";

const getResponseExample = (ref: Cls | Cls[]) => {
  const [modelRef, arrDepth] = getNonArrayModel(ref);
  const isPrimitive = PrimitiveRegistry.has(modelRef);
  if (isPrimitive) return arraiedModel((modelRef as typeof PrimitiveScalar)[EXAMPLE_VALUE], arrDepth);

  const example: Record<string, unknown> = {};
  Object.entries((modelRef as ConstantCls)[FIELD_META]).forEach(([key, field]) => {
    if (field.example) example[key] = field.example as unknown;
    else if (field.enum) example[key] = arraiedModel<string>(field.enum.values[0] as string, field.arrDepth);
    else example[key] = getResponseExample(field.modelRef);
  });
  const result = arraiedModel(example, arrDepth);
  return result;
};

const getRequestExample = (modelRef: Cls) => {
  const example: Record<string, unknown> = {};
  const isPrimitive = PrimitiveRegistry.has(modelRef);
  if (isPrimitive) return (modelRef as typeof PrimitiveScalar)[EXAMPLE_VALUE];
  else {
    Object.entries((modelRef as ConstantCls)[FIELD_META]).forEach(([key, field]) => {
      if (!field.isScalar && field.isClass) example[key] = "ObjectID";
      else
        example[key] = (
          (field.example ?? field.enum)
            ? arraiedModel(field.example ?? (field.enum?.values as string[])[0], field.optArrDepth)
            : arraiedModel(getRequestExample(field.modelRef), field.arrDepth)
        ) as unknown;
    });
  }
  return example;
};

export const makeRequestExample = (gqlMeta: SerializedEndpoint) => {
  return getExampleData(gqlMeta.args);
};
export const getExampleData = <Value = unknown>(
  args: SerializedArg[],
  signalType: SignalType = "restapi",
): Record<string, Value> =>
  Object.fromEntries(
    args
      .filter((arg) => arg.refName !== "Upload")
      .map((arg) => {
        const argRef = ConstantRegistry.getModelRef(arg.refName, arg.modelType) as ConstantCls;
        const example = arg.example ?? getRequestExample(argRef);
        return [
          arg.name,
          arraiedModel(
            signalType === "restapi" && argRef.prototype === Any.prototype ? JSON.stringify(example, null, 2) : example,
            arg.arrDepth,
          ),
        ];
      }),
  ) as Record<string, Value>;

export const makeResponseExample = (gqlMeta: SerializedEndpoint) => {
  const returnRef = ConstantRegistry.getModelRef(gqlMeta.returns.refName, gqlMeta.returns.modelType);
  const example = getResponseExample(arraiedModel(returnRef, gqlMeta.returns.arrDepth) as ConstantCls);
  return example;
};
