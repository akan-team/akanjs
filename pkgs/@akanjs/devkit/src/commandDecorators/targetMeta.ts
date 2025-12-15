import type { Type } from "./types";

interface TargetMeta {
  key: string;
  descriptor: PropertyDescriptor;
  targetOption: TargetOption;
}
export const getTargetMetas = (command: Type): TargetMeta[] => {
  const targetMetaMap = Reflect.getMetadata("target", command.prototype as object) as
    | Map<string, TargetMeta>
    | undefined;
  if (!targetMetaMap) throw new Error(`TargetMeta is not defined for ${command.name}`);
  return [...targetMetaMap.values()];
};
const getTargetMetaMapOnPrototype = (prototype: object): Map<string, TargetMeta> => {
  const targetMetaMap = Reflect.getMetadata("target", prototype) as Map<string, TargetMeta> | undefined;
  return targetMetaMap ?? new Map<string, TargetMeta>();
};
const setTargetMetaMapOnPrototype = (prototype: object, targetMetaMap: Map<string, TargetMeta>) => {
  Reflect.defineMetadata("target", targetMetaMap, prototype);
};

interface TargetOption {
  type: "public" | "cloud" | "dev";
  short?: string | true;
  devOnly?: boolean;
}
const getTarget =
  (type: "public" | "cloud" | "dev") =>
  (targetOption: Omit<TargetOption, "type"> = {}) => {
    return (prototype: object, key: string, descriptor: PropertyDescriptor) => {
      const metadataMap = getTargetMetaMapOnPrototype(prototype);
      metadataMap.set(key, {
        key,
        descriptor,
        targetOption: { ...targetOption, type },
      });
      setTargetMetaMapOnPrototype(prototype, metadataMap);
    };
  };

export const Target = {
  Public: getTarget("public"),
  Cloud: getTarget("cloud"),
  Dev: getTarget("dev"),
};
