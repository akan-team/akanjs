import {
  applyFnToArrayObjects,
  Dayjs,
  dayjs,
  Float,
  getNonArrayModel,
  GetStateObject,
  GqlScalar,
  ID,
  Int,
  JSON as GqlJSON,
  Type,
} from "@akanjs/base";
import { capitalize } from "@akanjs/common";

import { ConstantFieldMeta, constantInfo, getFieldMetaMap } from ".";

class CrystalizeStorage {}

export type CrystalizeFunc<Model> = (self: GetStateObject<Model>, isChild?: boolean) => Model;

const scalarCrystalizeMap = new Map<GqlScalar, (value: any) => any>([
  [Date, (value: Date | Dayjs) => dayjs(value)],
  [String, (value: string) => value],
  [ID, (value: string) => value],
  [Boolean, (value: boolean) => value],
  [Int, (value: number) => value],
  [Float, (value: number) => value],
  [GqlJSON, (value: any) => value as object],
]);
const crystalize = (metadata: ConstantFieldMeta, value: any): any => {
  if (value === undefined || value === null) return value as undefined | null;
  if (metadata.isArray && Array.isArray(value))
    return value.map((v: any) => crystalize({ ...metadata, isArray: false }, v) as object);
  if (metadata.isMap) {
    const [valueRef] = getNonArrayModel(metadata.of as Type);
    const crystalizeValue = scalarCrystalizeMap.get(valueRef as unknown as GqlScalar) ?? ((value) => value as object);
    return new Map(
      Object.entries(value as Record<string, any>).map(([key, val]) => [
        key,
        applyFnToArrayObjects(val, crystalizeValue),
      ])
    );
  }
  if (metadata.isClass) return makeCrystalize(metadata.modelRef)(value as object, true) as object;
  if (metadata.modelRef === Date) return dayjs(value as Date);
  return (scalarCrystalizeMap.get(metadata.modelRef) ?? ((value) => value as object))(value) as object;
};

const getPredefinedCrystalizeFn = (refName: string) => {
  const crystalize = Reflect.getMetadata(refName, CrystalizeStorage.prototype) as CrystalizeFunc<any> | undefined;
  return crystalize;
};
const setPredefinedCrystalizeFn = (refName: string, crystalize: CrystalizeFunc<any>) => {
  Reflect.defineMetadata(refName, crystalize, CrystalizeStorage.prototype);
};
export const makeCrystalize = <M>(
  modelRef: Type<M>,
  option: { overwrite?: any; partial?: string[] } = {}
): CrystalizeFunc<M> => {
  const refName = constantInfo.getRefName(modelRef);
  const crystalName = `${constantInfo.isLight(modelRef) ? "Light" : ""}${capitalize(refName)}${constantInfo.isInsight(modelRef) ? "Insight" : ""}`;
  const crystalizeFn = getPredefinedCrystalizeFn(crystalName);
  if (crystalizeFn && !option.overwrite && !option.partial?.length) return crystalizeFn;
  const fieldMetaMap = getFieldMetaMap(modelRef);
  const fieldKeys = option.partial?.length
    ? constantInfo.isScalar(modelRef)
      ? option.partial
      : ["id", ...option.partial, "updatedAt"]
    : [...fieldMetaMap.keys()];
  const metadatas = fieldKeys.map((key) => fieldMetaMap.get(key)) as ConstantFieldMeta[];
  const fn = ((self: M, isChild?: boolean): M | null => {
    try {
      const result: { [key: string]: any } = Object.assign(new modelRef() as object, self);
      for (const metadata of metadatas.filter((m) => !!(self as Record<string, any>)[m.key])) {
        if (metadata.fieldType === "hidden") continue;
        result[metadata.key] = crystalize(metadata, (self as Record<string, any>)[metadata.key]) as object;
      }
      return result as M;
    } catch (err) {
      if (isChild) throw new Error(err as string);
      return null;
    }
  }) as CrystalizeFunc<M>;
  if (!option.partial?.length) setPredefinedCrystalizeFn(crystalName, fn);
  return fn;
};
