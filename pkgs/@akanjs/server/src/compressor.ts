import {
  applyFnToArrayObjects,
  type Dayjs,
  dayjs,
  Float,
  getNonArrayModel,
  type GqlScalar,
  ID,
  Int,
  JSON as GqlJSON,
  type Type,
} from "@akanjs/base";
import { capitalize, Logger } from "@akanjs/common";
import {
  type ConstantFieldMeta,
  constantInfo,
  getChildClassRefs,
  getFieldEnumMetas,
  getFieldMetas,
  makeCrystalize,
} from "@akanjs/constant";
import * as proto from "protobufjs";

class ProtoModelStorage {}
const protobufTypeMap = new Map<any, string>([
  [String, "string"],
  [Int, "int32"],
  [Float, "float"],
  [Boolean, "bool"],
  [Date, "double"],
]);
const getPredefinedProtoModel = (modelRef: Type) => {
  const protoModel = Reflect.getMetadata(modelRef, ProtoModelStorage.prototype) as proto.Type | undefined;
  return protoModel;
};
const setPredefinedProtoModel = (modelRef: Type, protoModel: proto.Type) => {
  Reflect.defineMetadata(modelRef, protoModel, ProtoModelStorage.prototype);
};
const getProtoModel = (modelRef: Type) => {
  const refName = constantInfo.getRefName(modelRef);
  const predefinedProtoModel = getPredefinedProtoModel(modelRef);
  if (predefinedProtoModel) return predefinedProtoModel;
  const namespace = refName.toLowerCase();
  const childModelRefs = getChildClassRefs(modelRef);
  const allModelRefs = [modelRef, ...childModelRefs];

  const modelDatas = allModelRefs.map((modelRef) => {
    const refName = constantInfo.getRefName(modelRef);
    const fieldMetas = getFieldMetas(modelRef);
    return [
      refName,
      {
        fields: Object.fromEntries(
          fieldMetas.map((fieldMeta, id) => {
            const rule = fieldMeta.isArray ? "repeated" : fieldMeta.nullable ? "optional" : "required";
            const type = fieldMeta.isClass
              ? constantInfo.getRefName(fieldMeta.modelRef)
              : fieldMeta.enum
                ? `${refName}${capitalize(fieldMeta.key)}Enum`
                : (protobufTypeMap.get(fieldMeta.modelRef) ?? "string");
            return [fieldMeta.key, { type, id, rule }] as [string, proto.IField];
          })
        ),
      },
    ] as [string, proto.IType];
  });
  const modelJson = Object.fromEntries(modelDatas);

  const enumDatas = allModelRefs
    .map((modelRef) => {
      const refName = constantInfo.getRefName(modelRef);
      const enumMetas = getFieldEnumMetas(modelRef);
      const enumJsons = enumMetas.map((enumMeta) => {
        const enumName = `${refName}${capitalize(enumMeta.key)}Enum`;
        const enumData: proto.IEnum = {
          values: Object.fromEntries(enumMeta.enum.values.map((value, idx) => [value, idx])),
        };
        return [enumName, enumData] as [string, proto.IEnum];
      });
      return enumJsons;
    })
    .flat();
  const enumJson = Object.fromEntries(enumDatas);
  const protoJson: proto.INamespace = {
    nested: {
      [namespace]: {
        nested: {
          ...modelJson,
          ...enumJson,
        },
      },
    },
  };
  const root = proto.Root.fromJSON(protoJson);
  const protoModel = root.lookupType(`${namespace}.${refName}`);
  setPredefinedProtoModel(modelRef, protoModel);
  return protoModel;
};

class ProtoEncodeStorage {}
const scalarProtoEncodeMap = new Map<GqlScalar, (value: any) => any>([
  [Date, (value: Date | Dayjs) => dayjs(value).toDate().getTime()],
  [String, (value: string) => value],
  [ID, (value: string) => value],
  [Boolean, (value: boolean) => value],
  [Int, (value: number) => value],
  [Float, (value: number) => value],
  [GqlJSON, (value: object) => JSON.stringify(value)],
]);
const getProtoEncodeFn = (modelRef: Type): ((value: any) => object) => {
  const [valueRef] = getNonArrayModel(modelRef);
  return scalarProtoEncodeMap.get(valueRef) ?? ((value) => value as object);
};

const protoEncode = (metadata: ConstantFieldMeta, value: any) => {
  if (metadata.nullable && (value === null || value === undefined)) return null;
  if (metadata.isArray && Array.isArray(value)) {
    return (value as object[]).map((v: object) => protoEncode(metadata, v) as object) as object[];
  }
  if (metadata.isMap && metadata.of) {
    const protoEncodeFn = getProtoEncodeFn(metadata.of as Type);
    return Object.fromEntries(
      [...(value as Map<string, any>).entries()].map(([key, val]) => [key, applyFnToArrayObjects(val, protoEncodeFn)])
    );
  }
  if (metadata.isClass) return makeProtoEncode(metadata.modelRef)(value as object);
  if (metadata.enum) return metadata.enum.indexOf(value as string);
  return getProtoEncodeFn(metadata.modelRef)(value);
};
const getPredefinedProtoEncodeFn = (refName: string) => {
  const protoEncode = Reflect.getMetadata(refName, ProtoEncodeStorage.prototype) as
    | ((value: any) => object)
    | undefined;
  return protoEncode;
};
const setPredefinedProtoEncodeFn = (refName: string, protoEncode: (value: any) => object) => {
  Reflect.defineMetadata(refName, protoEncode, ProtoEncodeStorage.prototype);
};

const makeProtoEncode = <T>(modelRef: Type<T>): ((value: any) => object) => {
  const refName = constantInfo.getRefName(modelRef);
  const predefinedProtoEncode = getPredefinedProtoEncodeFn(refName);
  if (predefinedProtoEncode) return predefinedProtoEncode;
  const fieldMetas = getFieldMetas(modelRef);
  const protoEncodeFn = (value: T) => {
    const result: { [key: string]: any } = {};
    fieldMetas.forEach((fieldMeta) => {
      result[fieldMeta.key] = protoEncode(fieldMeta, value[fieldMeta.key]) as object;
    });
    return result;
  };
  setPredefinedProtoEncodeFn(refName, protoEncodeFn);
  return protoEncodeFn;
};

export const encode = <T>(modelRef: Type<T>, value: object) => {
  try {
    const protoModel = getProtoModel(modelRef);
    const protoEncode = makeProtoEncode(modelRef);
    const data = protoEncode(value);
    const errMsg = protoModel.verify(data);
    if (errMsg) {
      throw new Error(errMsg);
    }
    const message = protoModel.create(data);
    const buffer = protoModel.encode(message).finish();
    return buffer as unknown as Buffer;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    Logger.error(`Failed to encode ${modelRef.name}: ${errMsg}`);
    return null;
  }
};

class ProtoDecodeStorage {}
const scalarProtoDecodeMap = new Map<GqlScalar, (value: any) => any>([
  [Date, (value: Date | Dayjs) => dayjs(value)],
  [String, (value: string) => value],
  [ID, (value: string) => value],
  [Boolean, (value: boolean) => value],
  [Int, (value: number) => value],
  [Float, (value: number) => value],
  [GqlJSON, (value: string) => JSON.parse(value) as object],
]);
const getProtoDecodeFn = (modelRef: Type): ((value: any) => object) => {
  const [valueRef] = getNonArrayModel(modelRef);
  return scalarProtoDecodeMap.get(valueRef) ?? ((value) => value as object);
};

const protoDecode = (metadata: ConstantFieldMeta, value: any) => {
  if (metadata.nullable && (value === null || value === undefined)) return null;
  if (metadata.isArray) {
    if (value === undefined) return [];
    if (Array.isArray(value))
      return (value as object[]).map((v: object) => protoDecode(metadata, v) as object) as object[];
  }
  if (metadata.isMap && metadata.of) {
    const protoDecodeFn = getProtoDecodeFn(metadata.of as Type);
    return new Map(
      Object.entries(value as { [key: string]: string | number }).map(([key, val]) => [
        key,
        applyFnToArrayObjects(val, protoDecodeFn),
      ])
    );
  }
  if (metadata.isClass) return makeProtoDecode(metadata.modelRef)(value as object);
  if (metadata.enum) return metadata.enum.values.at(value as number);
  return getProtoDecodeFn(metadata.modelRef)(value);
};
const getPredefinedProtoDecodeFn = (refName: string) => {
  const protoDecode = Reflect.getMetadata(refName, ProtoDecodeStorage.prototype) as
    | ((value: any) => object)
    | undefined;
  return protoDecode;
};
const setPredefinedProtoDecodeFn = (refName: string, protoDecode: (value: any) => object) => {
  Reflect.defineMetadata(refName, protoDecode, ProtoDecodeStorage.prototype);
};

const makeProtoDecode = <T>(modelRef: Type<T>): ((value: any) => object) => {
  const refName = constantInfo.getRefName(modelRef);
  const predefinedProtoDecode = getPredefinedProtoDecodeFn(refName);
  if (predefinedProtoDecode) return predefinedProtoDecode;
  const fieldMetas = getFieldMetas(modelRef);
  const protoDecodeFn = (value: T) => {
    const result: { [key: string]: any } = {};
    fieldMetas.forEach((fieldMeta) => {
      result[fieldMeta.key] = protoDecode(fieldMeta, value[fieldMeta.key]) as object;
    });
    return result;
  };
  setPredefinedProtoDecodeFn(refName, protoDecodeFn);
  return protoDecodeFn;
};

export const decode = <T>(modelRef: Type<T>, buffer: Buffer) => {
  const protoModel = getProtoModel(modelRef);
  const message = protoModel.decode(Buffer.from(buffer));
  const data = protoModel.toObject(message);
  const protoDecode = makeProtoDecode(modelRef);
  const crystalize = makeCrystalize(modelRef);
  const result = crystalize(protoDecode(data) as T);
  return result;
};
