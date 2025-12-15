import { scalarDefaultMap, Type } from "@akanjs/base";
import { capitalize } from "@akanjs/common";

import { constantInfo } from "./constantInfo";
import { getFieldMetas } from "./scalar";
import { DefaultOf } from "./types";

class DefaultStorage {}

const getPredefinedDefault = (refName: string) => {
  const defaultData = Reflect.getMetadata(refName, DefaultStorage.prototype) as object | undefined;
  return defaultData;
};
const setPredefinedDefault = (refName: string, defaultData: object) => {
  Reflect.defineMetadata(refName, defaultData, DefaultStorage.prototype);
};

export const makeDefault = <T>(
  modelRef: Type<T>,
  option: { isChild?: boolean; overwrite?: any } = {}
): DefaultOf<T> => {
  const refName = constantInfo.getRefName(modelRef);
  const defaultName = `${capitalize(refName)}${constantInfo.isInsight(modelRef) ? "Insight" : ""}`;
  const predefinedDefault = getPredefinedDefault(defaultName);
  if (predefinedDefault && !option.overwrite) return predefinedDefault as DefaultOf<T>;
  if (option.isChild && constantInfo.isScalar(modelRef)) return null as unknown as DefaultOf<T>;
  const metadatas = getFieldMetas(modelRef);
  const result: { [key: string]: any } = {};
  for (const metadata of metadatas) {
    if (metadata.fieldType === "hidden") result[metadata.key] = null;
    else if (metadata.default) {
      if (typeof metadata.default === "function") result[metadata.key] = (metadata.default as () => object)();
      else result[metadata.key] = metadata.default as object;
    } else if (metadata.isArray) result[metadata.key] = [];
    else if (metadata.nullable) result[metadata.key] = null;
    else if (metadata.isClass) result[metadata.key] = metadata.isScalar ? makeDefault(metadata.modelRef) : null;
    else result[metadata.key] = scalarDefaultMap.get(metadata.modelRef) as object;
  }
  setPredefinedDefault(defaultName, result);
  return result as DefaultOf<T>;
};
