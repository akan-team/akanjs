/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  applyFnToArrayObjects,
  arraiedModel,
  Dayjs,
  dayjs,
  Float,
  type GqlScalar,
  ID,
  Int,
  JSON,
  Type,
} from "@akanjs/base";
import { isDayjs, Logger } from "@akanjs/common";
import { ConstantFieldMeta, constantInfo, getFieldMetas, makeDefault } from "@akanjs/constant";
import { BaseMiddleware, documentInfo, getDefaultSchemaOptions, ObjectId } from "@akanjs/document";
import { Schema, Types } from "mongoose";

import { applyNestField } from ".";

class ScalarSchemaStorage {}
class SchemaStorage {}
const getSchemaMetaByName = (refName: string) => {
  const schemaMeta = Reflect.getMetadata(refName, SchemaStorage.prototype) as
    | Schema<any, any, any, any, any, any>
    | undefined;
  return schemaMeta;
};
const setSchemaMetaByName = (refName: string, schema: Schema) => {
  Reflect.defineMetadata(refName, schema, SchemaStorage.prototype);
};
export const hasSchema = (modelRef: Type) => {
  const refName = constantInfo.getRefName(modelRef);
  return !!getSchemaMetaByName(refName);
};

const getScalarSchemaMetaByName = (refName: string) => {
  const schemaMeta = Reflect.getMetadata(refName, ScalarSchemaStorage.prototype) as
    | Schema<any, any, any, any, any, any>
    | undefined;
  return schemaMeta;
};
const setScalarSchemaMetaByName = (refName: string, schema: Schema) => {
  Reflect.defineMetadata(refName, schema, ScalarSchemaStorage.prototype);
};

const scalarMongoTypeMap = new Map<GqlScalar, any>([
  [ID, ObjectId],
  [Int, Number],
  [Float, Number],
  [JSON, Schema.Types.Mixed],
  [Map, Map],
  [String, String],
  [Boolean, Boolean],
  [Date, Date],
]);
const applyMongoProp = (schemaProps: any, fieldMeta: ConstantFieldMeta) => {
  if (["id", "createdAt", "updatedAt"].includes(fieldMeta.key) || fieldMeta.fieldType === "resolve") return;
  const type = fieldMeta.isClass
    ? fieldMeta.isScalar
      ? createSchema(fieldMeta.modelRef)
      : ObjectId
    : (scalarMongoTypeMap.get(fieldMeta.modelRef) ?? fieldMeta.modelRef);
  let prop: any = {};
  if (fieldMeta.optArrDepth) {
    prop.type = type;
    prop.required = true;
    if (fieldMeta.isClass && !fieldMeta.refPath) prop.ref = constantInfo.getRefName(fieldMeta.modelRef);
    if (fieldMeta.refPath) prop.refPath = fieldMeta.refPath;
    if (typeof fieldMeta.min === "number") prop.min = fieldMeta.min;
    if (typeof fieldMeta.max === "number") prop.max = fieldMeta.max;
    if (fieldMeta.enum) prop.enum = [...fieldMeta.enum.values, ...(fieldMeta.nullable ? [null] : [])];
    if (typeof fieldMeta.minlength === "number") prop.minlength = fieldMeta.minlength;
    if (typeof fieldMeta.maxlength === "number") prop.maxlength = fieldMeta.maxlength;
    if (fieldMeta.validate) {
      prop.validate = function (value: any) {
        return fieldMeta.validate?.(fieldMeta.modelRef === Date && !!value ? dayjs() : value, this) ?? true;
      };
    }
    prop = { type: arraiedModel(prop, fieldMeta.optArrDepth), default: [], required: true };
    if (fieldMeta.modelRef.prototype === Date.prototype) {
      prop.get = (dates: Date[]) => applyFnToArrayObjects(dates, (date: Date) => dayjs(date));
      prop.set = (days: Dayjs[]) => applyFnToArrayObjects(days, (day: Dayjs) => day.toDate());
    }
    if ((fieldMeta.isClass && !fieldMeta.isScalar) || fieldMeta.modelRef.prototype === ID.prototype) {
      prop.get = (ids: Types.ObjectId[]) => applyFnToArrayObjects(ids, (id: Types.ObjectId) => id.toString());
      prop.set = (ids: string[]) => applyFnToArrayObjects(ids, (id: string) => new Types.ObjectId(id));
    }
  } else {
    prop.type = arraiedModel(type, fieldMeta.arrDepth);
    prop.required = !fieldMeta.nullable;
    if (fieldMeta.isMap) {
      prop.of = scalarMongoTypeMap.get(fieldMeta.of as Type) ?? createSchema(fieldMeta.of as Type);
      if (!fieldMeta.default) prop.default = new Map();
    }
    if (fieldMeta.default !== null) {
      if (typeof fieldMeta.default === "function")
        prop.default = function () {
          const def = fieldMeta.default(this);
          return isDayjs(def) ? def.toDate() : def;
        };
      else prop.default = isDayjs(fieldMeta.default) ? fieldMeta.default.toDate() : fieldMeta.default;
    }
    if (typeof fieldMeta.immutable !== "undefined") prop.immutable = fieldMeta.immutable;
    if (fieldMeta.isClass && !fieldMeta.refPath) prop.ref = constantInfo.getRefName(fieldMeta.modelRef);
    if (fieldMeta.refPath) prop.refPath = fieldMeta.refPath;
    if (typeof fieldMeta.min === "number") prop.min = fieldMeta.min;
    if (typeof fieldMeta.max === "number") prop.max = fieldMeta.max;
    if (fieldMeta.enum) prop.enum = [...fieldMeta.enum.values, ...(fieldMeta.nullable ? [null] : [])];
    if (typeof fieldMeta.select === "boolean") prop.select = fieldMeta.select;
    if (typeof fieldMeta.minlength === "number") prop.minlength = fieldMeta.minlength;
    if (typeof fieldMeta.maxlength === "number") prop.maxlength = fieldMeta.maxlength;
    if (fieldMeta.nullable) {
      prop.get = (v) => (v === undefined ? undefined : v);
      prop.set = (v) => (v === null ? undefined : v);
    }
    if (fieldMeta.modelRef.prototype === Date.prototype) {
      prop.get = (date: Date[] | Date | null) =>
        applyFnToArrayObjects(date, (date: Date | null) => (date ? dayjs(date) : undefined));
      prop.set = (day: Dayjs[] | Dayjs | null) =>
        applyFnToArrayObjects(day, (day: Dayjs | null) => (day ? dayjs(day).toDate() : undefined));
    }
    if ((fieldMeta.isClass && !fieldMeta.isScalar) || fieldMeta.modelRef.prototype === ID.prototype) {
      if (fieldMeta.arrDepth === 0) {
        prop.get = (id: Types.ObjectId | null) => (id ? id.toString() : undefined);
        prop.set = (id: string | null) => (id ? new Types.ObjectId(id) : undefined);
      } else {
        prop.get = (val: Types.ObjectId[] | Types.ObjectId | null) =>
          applyFnToArrayObjects(val, (id: Types.ObjectId | null) => (id ? id.toString() : undefined));
        prop.set = (val: string[] | string | null) =>
          applyFnToArrayObjects(val, (id: string | null) => (id ? new Types.ObjectId(id) : undefined));
      }
    }
    if (fieldMeta.isClass && fieldMeta.isScalar && fieldMeta.default === null && !fieldMeta.nullable) {
      prop.default = makeDefault(fieldMeta.modelRef);
    }
    if (fieldMeta.validate) {
      prop.validate = function (value: any) {
        return fieldMeta.validate?.(fieldMeta.modelRef === Date && !!value ? dayjs() : value, this) ?? true;
      };
    }
  }
  schemaProps[fieldMeta.key] = prop;
};
const createSchema = <Mdl, DocMtds, QryHelps, MdlStats>(
  modelRef: Type
): Schema<null, Mdl, DocMtds, QryHelps, null, MdlStats> => {
  const refName = constantInfo.getRefName(modelRef);
  const schemaMeta = getScalarSchemaMetaByName(refName);
  if (schemaMeta) return schemaMeta;
  const fieldMetas = getFieldMetas(modelRef);
  const schemaProps = {};
  fieldMetas.forEach((fieldMeta) => {
    applyMongoProp(schemaProps, fieldMeta);
  });
  const schema = new Schema(schemaProps);
  setScalarSchemaMetaByName(refName, schema);
  return schema as any;
};

export const schemaOf = <Mdl, Doc, Middleware extends BaseMiddleware>(
  modelRef: Type<Mdl>,
  docRef: Type<Doc>,
  middleware: Type<Middleware>
): Schema<null, Mdl, Doc, undefined, null, Mdl> => {
  const refName = documentInfo.getRefName(docRef);
  const schemaMeta = getSchemaMetaByName(refName);
  if (schemaMeta) return schemaMeta;
  const fieldMetas = getFieldMetas(docRef);
  const schemaProps = {
    createdAt: {
      type: Date,
      get: (date: Date | null) => (date ? dayjs(date) : date),
      set: (day: Dayjs | null) => (day ? dayjs(day).toDate() : day),
    },
    updatedAt: {
      type: Date,
      get: (date: Date | null) => (date ? dayjs(date) : date),
      set: (day: Dayjs | null) => (day ? dayjs(day).toDate() : day),
    },
  };
  fieldMetas.forEach((fieldMeta) => {
    applyMongoProp(schemaProps, fieldMeta);
  });
  const schema: any = new Schema(schemaProps, getDefaultSchemaOptions());
  schema.methods.refresh = async function (this: any) {
    Object.assign(this, await this.constructor.findById(this._id));
    return this;
  };
  Object.getOwnPropertyNames(docRef.prototype).forEach((name) => {
    if (name === "constructor") return;
    schema.methods[name] = Object.getOwnPropertyDescriptor(docRef.prototype, name)?.value;
  });

  schema.pre("save", async function (this, next) {
    const saveType: "create" | "update" | "remove" = this.isNew
      ? "create"
      : this.isModified("removedAt")
        ? this.removedAt
          ? "remove"
          : "create"
        : "update";
    const saveListeners = [
      ...this.constructor.preSaveListenerSet,
      ...(saveType === "create"
        ? [...this.constructor.preCreateListenerSet]
        : saveType === "update"
          ? [...this.constructor.preUpdateListenerSet]
          : [...this.constructor.preRemoveListenerSet]),
    ];
    await Promise.all(
      saveListeners.map(async (listener) => {
        try {
          await listener(this, saveType);
        } catch (e) {
          Logger.error(
            `Pre Save Listener Error ${this.constructor.modelName}: ${e instanceof Error ? e.message : typeof e === "string" ? e : "unknown error"}`
          );
        }
      })
    );
    next();
  });
  schema.post("save", async function (this) {
    const saveType: "create" | "update" | "remove" = this.isNew
      ? "create"
      : this.isModified("removedAt")
        ? this.removedAt
          ? "remove"
          : "create"
        : "update";
    const saveListeners = [
      ...this.constructor.postSaveListenerSet,
      ...(saveType === "create"
        ? [...this.constructor.postCreateListenerSet]
        : saveType === "update"
          ? [...this.constructor.postUpdateListenerSet]
          : [...this.constructor.postRemoveListenerSet]),
    ];
    await Promise.all(
      saveListeners.map(async (listener) => {
        try {
          await listener(this, saveType);
        } catch (e) {
          Logger.error(
            `Post Save Listener Error ${this.constructor.modelName}: ${e instanceof Error ? e.message : typeof e === "string" ? e : "unknown error"}`
          );
        }
      })
    );
  });

  const onSchema = Object.getOwnPropertyDescriptor(middleware.prototype, "onSchema")?.value;
  onSchema?.(schema);
  schema.index({ removedAt: -1 });
  setSchemaMetaByName(refName, schema as Schema);
  return schema;
};

export const addSchema = <Mdl, Doc, Input, Middleware extends BaseMiddleware>(
  modelRef: Type<Mdl>,
  docRef: Type<Doc>,
  inputRef: Type<Input>,
  middleware: Type<Middleware>
): Schema<null, Mdl, Doc, undefined, null, Mdl> => {
  const refName = documentInfo.getRefName(docRef);
  const databaseConstantModelInfo = documentInfo.getDatabase(refName);
  const originDoc = databaseConstantModelInfo.doc;
  const originInput = databaseConstantModelInfo.input;
  const modelSchema = Reflect.getMetadata(refName, SchemaStorage.prototype);
  if (!modelSchema) throw new Error(`Schema of ${refName} not found`);
  const fieldMetas = getFieldMetas(docRef);
  const schemaProps = {
    createdAt: {
      type: Date,
      get: (date: Date | null) => (date ? dayjs(date) : date),
      set: (day: Dayjs | null) => (day ? dayjs(day).toDate() : day),
    },
    updatedAt: {
      type: Date,
      get: (date: Date | null) => (date ? dayjs(date) : date),
      set: (day: Dayjs | null) => (day ? dayjs(day).toDate() : day),
    },
  };
  fieldMetas.forEach((fieldMeta) => {
    applyMongoProp(schemaProps, fieldMeta);
    applyNestField(originDoc, fieldMeta);
  });
  const inputFieldMetas = getFieldMetas(inputRef);
  inputFieldMetas.forEach((fieldMeta) => {
    applyNestField(originInput, fieldMeta, "input");
  });
  const schema = new Schema(schemaProps, getDefaultSchemaOptions());
  modelSchema.add(schema as any);

  Object.getOwnPropertyNames(docRef.prototype).forEach((name) => {
    if (name === "constructor") return;
    modelSchema.methods[name] = Object.getOwnPropertyDescriptor(docRef.prototype, name)?.value;
  });
  const onSchema = Object.getOwnPropertyDescriptor(middleware.prototype, "onSchema")?.value;
  onSchema?.(modelSchema);
  return modelSchema;
};
