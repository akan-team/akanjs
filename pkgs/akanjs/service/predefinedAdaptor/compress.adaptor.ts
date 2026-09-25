import {
  Any,
  applyFnToArrayObjects,
  type Cls,
  type Dayjs,
  dayjs,
  FIELD_META,
  Float,
  getNonArrayModel,
  ID,
  Int,
  PrimitiveRegistry,
  type PrimitiveScalar,
} from "akanjs/base";
import { Logger } from "akanjs/common";
import { type ConstantCls, type ConstantField, type ConstantModelRef, ConstantRegistry } from "akanjs/constant";
import { adapt } from "../adapt";

type ProtoType = {
  verify(data: unknown): string | null | undefined;
  create(data: unknown): unknown;
  encode(message: unknown): { finish(): Uint8Array };
  decode(buffer: Buffer): unknown;
  toObject(message: unknown): Record<string, unknown>;
};
type ProtoModule = {
  Root: {
    fromJSON(json: unknown): { lookupType(name: string): ProtoType };
  };
};
type ProtoField = Record<string, unknown>;
type ProtoTypeJson = Record<string, unknown>;
type ProtoEnumJson = Record<string, unknown>;
type ProtoNamespace = Record<string, unknown>;

const protobufPackage = "protobufjs";

export interface CompressAdaptor {
  encode(ref: Cls, arrDepth: number, value: unknown): Buffer | null;
  decode<T = unknown>(ref: Cls, arrDepth: number, buffer: Buffer): T;
}

export class JsonCompressor extends adapt("jsonCompressor", () => ({})) implements CompressAdaptor {
  encode(_ref: Cls, _arrDepth: number, value: unknown): Buffer | null {
    return Buffer.from(JSON.stringify(value));
  }
  decode<T = unknown>(ref: Cls, arrDepth: number, buffer: Buffer, { raw = false }: { raw?: boolean } = {}): T {
    const value = JSON.parse(buffer.toString()) as T;
    if (raw || arrDepth > 0 || PrimitiveRegistry.has(ref)) return value;
    return new (ref as ConstantCls)().set(value as object) as T;
  }
}

export class ProtobufCompressor extends adapt("protobufCompressor", () => ({})) implements CompressAdaptor {
  #proto: ProtoModule | null = null;
  #protobufTypeMap = new Map<unknown, string>([
    [String, "string"],
    [Int, "int32"],
    [Float, "float"],
    [Boolean, "bool"],
    [Date, "double"],
  ]);
  #primitiveProtoEncodeMap = new Map<PrimitiveScalar, (value: never) => unknown>([
    [Date, (value: Date | Dayjs) => dayjs(value).toDate().getTime()],
    [String, (value: string) => value],
    [ID, (value: string) => value],
    [Boolean, (value: boolean) => value],
    [Int, (value: number) => value],
    [Float, (value: number) => value],
    [Any, (value: object) => JSON.stringify(value)],
  ]);
  #primitiveProtoDecodeMap = new Map<PrimitiveScalar, (value: never) => unknown>([
    [Date, (value: Date | Dayjs) => dayjs(value).toDate()],
    [String, (value: string) => value],
    [ID, (value: string) => value],
    [Boolean, (value: boolean) => value],
    [Int, (value: number) => value],
    [Float, (value: number) => value],
    [Any, (value: string) => JSON.parse(value) as object],
  ]);
  #protoModelMap = new Map<Cls, ProtoType>();
  #protoEncodeMap = new Map<Cls, (value: never) => object>();
  #protoDecodeMap = new Map<Cls, (value: never) => object>();
  #protoWrapperMap = new Map<string, ProtoType>();

  override async onInit(): Promise<void> {
    this.#proto = (await import(protobufPackage)) as ProtoModule;
  }

  #getProtobuf() {
    if (!this.#proto) {
      throw new Error("ProtobufCompressor is not initialized. Call onInit() before encode/decode.");
    }
    return this.#proto;
  }

  #getProtoModel(modelRef: ConstantModelRef<unknown>) {
    const refName = ConstantRegistry.getRefName(modelRef);
    const predefinedProtoModel = this.#protoModelMap.get(modelRef);
    if (predefinedProtoModel) return predefinedProtoModel;
    const namespace = refName.toLowerCase();
    const allModelRefs = this.#getRelatedProtoModelRefs(modelRef, [...modelRef.children, ...modelRef.relations]);

    const modelDatas = allModelRefs.map((modelRef) => {
      const refName = ConstantRegistry.getRefName(modelRef);
      return [
        refName,
        {
          fields: Object.fromEntries(
            Object.entries(modelRef[FIELD_META]).map(([key, field], id) => {
              const rule = field.isArray ? "repeated" : field.nullable ? "optional" : "required";
              const type = this.#getProtoFieldType(field);
              if (field.isMap) return [key, { keyType: "string", type, id }] as [string, ProtoField];
              return [key, { type, id, rule }] as [string, ProtoField];
            }),
          ),
        },
      ] as [string, ProtoTypeJson];
    });
    const modelJson = Object.fromEntries(modelDatas);

    const enumDatas = allModelRefs.flatMap((modelRef) => {
      const enumJsons = [...modelRef.enums].map((enumCls) => {
        const enumData: ProtoEnumJson = {
          values: Object.fromEntries(enumCls.values.map((value, idx) => [value, idx])),
        };
        return [enumCls.refName, enumData] as [string, ProtoEnumJson];
      });
      return enumJsons;
    });
    const enumJson = Object.fromEntries(enumDatas);
    const protoJson: ProtoNamespace = { nested: { [namespace]: { nested: { ...modelJson, ...enumJson } } } };
    const root = this.#getProtobuf().Root.fromJSON(protoJson);
    const protoModel = root.lookupType(`${namespace}.${refName}`);
    this.#protoModelMap.set(modelRef, protoModel);
    return protoModel;
  }

  #getProtoEncodeFn(modelRef: Cls) {
    const [valueRef] = getNonArrayModel(modelRef);
    return this.#primitiveProtoEncodeMap.get(valueRef) ?? ((value) => value as object);
  }
  #getRelatedProtoModelRefs(modelRef: ConstantModelRef, baseModelRefs: ConstantModelRef[] = []) {
    const allModelRefs = [modelRef, ...baseModelRefs];
    allModelRefs.forEach((mRef) => {
      Object.values(mRef[FIELD_META]).forEach((field) => {
        const relatedRef = field.isMap && field.of ? (field.of as Cls) : field.modelRef;
        if (!PrimitiveRegistry.has(relatedRef) && !allModelRefs.includes(relatedRef as ConstantModelRef)) {
          allModelRefs.push(relatedRef as ConstantModelRef);
        }
      });
    });
    return allModelRefs;
  }
  #getProtoFieldType(field: ConstantField) {
    const modelRef = field.isMap && field.of ? (field.of as Cls) : field.modelRef;
    return field.isClass || (field.isMap && field.of && !PrimitiveRegistry.has(field.of as Cls))
      ? ConstantRegistry.getRefName(modelRef)
      : field.enum
        ? field.enum.refName
        : (this.#protobufTypeMap.get(modelRef) ?? "string");
  }
  #protoEncode(
    field: ConstantField,
    value: unknown,
  ): object | object[] | Map<string, unknown> | number | string | boolean | null {
    if (field.nullable && (value === null || value === undefined)) return null;
    if (field.isArray && Array.isArray(value)) {
      return (value as object[]).map((v: object) => this.#protoEncode(field, v) as object) as object[];
    }
    if (field.isMap && field.of) {
      const protoEncodeFn = this.#getProtoEncodeFn(field.of as Cls);
      return Object.fromEntries(
        [...(value as Map<string, unknown>).entries()].map(([key, val]) => [
          key,
          applyFnToArrayObjects(val, protoEncodeFn),
        ]),
      );
    }
    if (field.isClass) return this.#makeProtoEncode(field.modelRef)(value as never);
    if (field.enum) return field.enum.indexOf(value as string);
    return this.#getProtoEncodeFn(field.modelRef)(value as never) as
      | object
      | object[]
      | Map<string, unknown>
      | number
      | string
      | boolean
      | null;
  }
  #makeProtoEncode = <T>(modelRef: ConstantModelRef<T>): ((value: never) => object) => {
    const predefinedProtoEncode = this.#protoEncodeMap.get(modelRef);
    if (predefinedProtoEncode) return predefinedProtoEncode;
    const protoEncodeFn = (value: T) => {
      const result: Record<string, unknown> = {};
      Object.entries(modelRef[FIELD_META]).forEach(([key, field], id) => {
        result[key] = this.#protoEncode(field, value[key as keyof T]) as object;
      });
      return result;
    };
    this.#protoEncodeMap.set(modelRef, protoEncodeFn as (value: never) => object);
    return protoEncodeFn as (value: never) => object;
  };
  #encode = (modelRef: ConstantCls, value: object) => {
    try {
      const protoModel = this.#getProtoModel(modelRef);
      const protoEncode = this.#makeProtoEncode(modelRef);
      const data = protoEncode(value as never);
      const errMsg = protoModel.verify(data);
      if (errMsg) throw new Error(errMsg);
      const message = protoModel.create(data);
      const buffer = protoModel.encode(message).finish();
      return buffer as unknown as Buffer;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`Failed to encode ${modelRef.name}: ${errMsg}`);
      return null;
    }
  };
  encode(ref: Cls, arrDepth: number, value: unknown): Buffer | null {
    if (arrDepth === 0 && !PrimitiveRegistry.has(ref)) return this.#encode(ref as ConstantCls, value as object);
    try {
      const isPrimitive = PrimitiveRegistry.has(ref);
      const wrapperType = this.#getWrapperProtoModel(ref, arrDepth);
      const isArray = arrDepth > 0;
      const fieldName = isArray ? "values" : "value";

      let encoded: unknown;
      if (isPrimitive) {
        const encodeFn = (this.#primitiveProtoEncodeMap.get(ref) ?? ((v: never) => v)) as (value: unknown) => unknown;
        encoded = isArray ? (value as unknown[]).map((v) => encodeFn(v)) : encodeFn(value);
      } else {
        const modelRef = ref as ConstantCls;
        const protoEncode = this.#makeProtoEncode(modelRef);
        encoded = isArray
          ? (value as object[]).map((v: object) => protoEncode(v as never))
          : protoEncode(value as never);
      }

      const data = { [fieldName]: encoded };
      const errMsg = wrapperType.verify(data);
      if (errMsg) throw new Error(errMsg);
      const message = wrapperType.create(data);
      const buffer = wrapperType.encode(message).finish();
      return buffer as unknown as Buffer;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`Failed to encodeValue: ${errMsg}`);
      return null;
    }
  }

  #getProtoDecodeFn(modelRef: Cls) {
    const [valueRef] = getNonArrayModel(modelRef);
    return this.#primitiveProtoDecodeMap.get(valueRef) ?? ((value) => value as object);
  }
  #protoDecode(
    field: ConstantField,
    value: unknown,
  ): object | object[] | Map<string, unknown> | number | string | boolean | null | undefined {
    if (field.nullable && (value === null || value === undefined)) return null;
    if (field.isArray) {
      if (value === undefined) return [];
      if (Array.isArray(value))
        return (value as object[]).map((v: object) => this.#protoDecode(field, v) as object) as object[];
    }
    if (field.isMap && field.of) {
      const protoDecodeFn = this.#getProtoDecodeFn(field.of as Cls);
      if (value === null || value === undefined) return new Map();
      return new Map(
        Object.entries(value as { [key: string]: string | number }).map(([key, val]) => [
          key,
          applyFnToArrayObjects(val, protoDecodeFn),
        ]),
      );
    }
    if (field.isClass) return this.#makeProtoDecode(field.modelRef)(value as never);
    if (field.enum) return field.enum.values.at(value as number);
    return this.#getProtoDecodeFn(field.modelRef)(value as never) as
      | object
      | object[]
      | Map<string, unknown>
      | number
      | string
      | boolean
      | null
      | undefined;
  }
  #makeProtoDecode<T>(modelRef: ConstantModelRef<T>): (value: never) => object {
    const predefinedProtoDecode = this.#protoDecodeMap.get(modelRef);
    if (predefinedProtoDecode) return predefinedProtoDecode;
    const protoDecodeFn = (value: T) => {
      const result: Record<string, unknown> = {};
      Object.entries(modelRef[FIELD_META]).forEach(([key, field], id) => {
        result[key] = this.#protoDecode(field, value[key as keyof T]) as object;
      });
      return result;
    };
    this.#protoDecodeMap.set(modelRef, protoDecodeFn as (value: never) => object);
    return protoDecodeFn as (value: never) => object;
  }
  #decode<T>(modelRef: ConstantCls<T>, buffer: Buffer, { raw = false }: { raw?: boolean } = {}): T {
    const protoModel = this.#getProtoModel(modelRef as unknown as ConstantModelRef<unknown>);
    const message = protoModel.decode(Buffer.from(buffer));
    const data = protoModel.toObject(message);
    const protoDecode = this.#makeProtoDecode(modelRef);
    const decoded = protoDecode(data as never) as T;
    if (raw) return decoded;
    return new modelRef().set(decoded);
  }

  #getWrapperProtoModel(ref: Cls, arrDepth: number): ProtoType {
    const isPrimitive = PrimitiveRegistry.has(ref);
    const refName = isPrimitive
      ? PrimitiveRegistry.getName(ref as typeof PrimitiveScalar)
      : ConstantRegistry.getRefName(ref as ConstantCls);
    const cacheKey = `${refName}:${arrDepth}`;
    const cachedProtoWrapper = this.#protoWrapperMap.get(cacheKey);
    if (cachedProtoWrapper) return cachedProtoWrapper;

    const isArray = arrDepth > 0;
    const rule = isArray ? "repeated" : "required";
    const fieldName = isArray ? "values" : "value";

    const nested: { [key: string]: ProtoTypeJson | ProtoEnumJson } = {};
    const fieldType = isPrimitive ? (this.#protobufTypeMap.get(ref) ?? "string") : refName;

    if (!isPrimitive) {
      const modelRef = ref as ConstantModelRef;
      const allModelRefs = this.#getRelatedProtoModelRefs(modelRef, [...modelRef.children]);

      for (const mRef of allModelRefs) {
        const mRefName = ConstantRegistry.getRefName(mRef);
        nested[mRefName] = {
          fields: Object.fromEntries(
            Object.entries(mRef[FIELD_META]).map(([key, field], id) => {
              const fRule = field.isArray ? "repeated" : field.nullable ? "optional" : "required";
              const fType = this.#getProtoFieldType(field);
              if (field.isMap) return [key, { keyType: "string", type: fType, id }] as [string, ProtoField];
              return [key, { type: fType, id, rule: fRule }] as [string, ProtoField];
            }),
          ),
        };
      }
      for (const mRef of allModelRefs)
        for (const enumCls of mRef.enums)
          nested[enumCls.refName] = {
            values: Object.fromEntries(enumCls.values.map((value, idx) => [value, idx])),
          } as ProtoEnumJson;
    }

    const wrapperTypeName = `Wrapper_${refName}_${arrDepth}`;
    nested[wrapperTypeName] = {
      fields: { [fieldName]: { type: fieldType, id: 1, rule } },
    };

    const namespace = `wrapper_${refName.toLowerCase()}_${arrDepth}`;
    const protoJson: ProtoNamespace = {
      nested: { [namespace]: { nested } },
    };
    const root = this.#getProtobuf().Root.fromJSON(protoJson);
    const wrapperType = root.lookupType(`${namespace}.${wrapperTypeName}`);
    this.#protoWrapperMap.set(cacheKey, wrapperType);
    return wrapperType;
  }

  decode<T = unknown>(ref: Cls, arrDepth: number, buffer: Buffer, { raw = false }: { raw?: boolean } = {}): T {
    if (arrDepth === 0 && !PrimitiveRegistry.has(ref)) return this.#decode(ref as ConstantCls<T>, buffer, { raw });

    const isPrimitive = PrimitiveRegistry.has(ref);
    const wrapperType = this.#getWrapperProtoModel(ref, arrDepth);
    const isArray = arrDepth > 0;
    const fieldName = isArray ? "values" : "value";

    const message = wrapperType.decode(Buffer.from(buffer));
    const data = wrapperType.toObject(message);
    const rawObj = data[fieldName];

    if (isPrimitive) {
      const decodeFn = (this.#primitiveProtoDecodeMap.get(ref) ?? ((v: never) => v)) as (value: unknown) => unknown;
      if (isArray) return ((rawObj as unknown[]) ?? []).map((v) => decodeFn(v)) as T;
      return decodeFn(rawObj) as T;
    }
    const modelRef = ref as ConstantCls;
    const protoDecode = this.#makeProtoDecode(modelRef);
    if (isArray)
      return ((rawObj as object[]) ?? []).map((v: object) => {
        const decoded = protoDecode(v as never);
        if (raw) return decoded;
        return new modelRef().set(decoded);
      }) as T;
    else {
      const decoded = protoDecode(rawObj as never);
      if (raw) return decoded as T;
      return new modelRef().set(decoded);
    }
  }
}
