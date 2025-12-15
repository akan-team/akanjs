import { arraiedModel, BaseObject, Dayjs, dayjs, Float, ID, Int, JSON, Type } from "@akanjs/base";
import { capitalize } from "@akanjs/common";
import { ConstantFieldMeta, constantInfo, DocumentModel, getFieldMetas } from "@akanjs/constant";
import type { Doc } from "@akanjs/document";
import * as Nest from "@nestjs/graphql";
import { Field, InputType, ObjectType } from "@nestjs/graphql";
import { isDayjs } from "dayjs";
import { Kind, ValueNode } from "graphql";
import { default as GraphQLJSON } from "graphql-type-json";

@Nest.Scalar("Date", () => Date)
export class DateScalar implements Nest.CustomScalar<Date, Dayjs> {
  description = "Date custom scalar type";
  parseValue(value: number) {
    return dayjs(value); // value from the client
  }
  serialize(value: Dayjs): Date {
    if (isDayjs(value))
      return value.toDate(); // value sent to the client
    else return new Date(value);
  }
  parseLiteral(ast: ValueNode) {
    if (ast.kind === Kind.INT) return dayjs(ast.value);
    else if (ast.kind === Kind.STRING) return dayjs(ast.value);
    else return null as unknown as Dayjs;
  }
}

class ObjectGqlStorage {}
class InputGqlStorage {}

const getPredefinedInqutGql = (refName: string) => {
  const inputGql = Reflect.getMetadata(refName, InputGqlStorage.prototype) as Type | undefined;
  return inputGql;
};
const setPredefinedInqutGql = (refName: string, inputGql: Type) => {
  Reflect.defineMetadata(refName, inputGql, InputGqlStorage.prototype);
};
const getPredefinedObjectGql = (refName: string) => {
  const objectGql = Reflect.getMetadata(refName, ObjectGqlStorage.prototype) as Type | undefined;
  return objectGql;
};
const setPredefinedObjectGql = (refName: string, objectGql: Type) => {
  Reflect.defineMetadata(refName, objectGql, ObjectGqlStorage.prototype);
};

const gqlNestFieldMap = new Map<any, any>([
  [ID, Nest.ID],
  [Int, Nest.Int],
  [Float, Nest.Float],
  [JSON, GraphQLJSON],
  [Map, GraphQLJSON],
]);
export const applyNestField = (model: Type, fieldMeta: ConstantFieldMeta, type: "object" | "input" = "object") => {
  if (fieldMeta.fieldType === "hidden" && type === "object") return;
  const modelRef = (
    fieldMeta.isClass
      ? type === "object"
        ? generateGql(fieldMeta.modelRef)
        : fieldMeta.isScalar
          ? generateGqlInput(fieldMeta.modelRef)
          : Nest.ID
      : (gqlNestFieldMap.get(fieldMeta.modelRef) ?? fieldMeta.modelRef)
  ) as Type;
  Field(() => arraiedModel(modelRef, fieldMeta.arrDepth), { nullable: fieldMeta.nullable })(
    model.prototype as object,
    fieldMeta.key
  );
};
export const generateGqlInput = <InputModel>(inputRef: Type<InputModel>): Type<DocumentModel<InputModel>> => {
  const refName = constantInfo.getRefName(inputRef);
  const modelType = constantInfo.getModelType(inputRef);
  const gqlName = `${capitalize(refName)}${modelType === "object" ? "Object" : "Input"}`;
  const predefinedInputGql = getPredefinedInqutGql(gqlName);
  if (predefinedInputGql) return predefinedInputGql;
  const fieldMetas = getFieldMetas(inputRef);
  class InputGql {}
  const inputGql = constantInfo.isScalar(inputRef) ? InputGql : constantInfo.getDatabase(refName).input;
  fieldMetas.forEach((fieldMeta) => {
    applyNestField(inputGql, fieldMeta, "input");
  });
  InputType(gqlName)(inputGql);
  setPredefinedInqutGql(gqlName, inputGql);
  return inputGql;
};

export const generateGql = <ObjectModel>(
  objectRef: Type<ObjectModel>
): Type<ObjectModel extends BaseObject ? Doc<ObjectModel> : DocumentModel<ObjectModel>> => {
  const refName = constantInfo.getRefName(objectRef);
  const isLight = constantInfo.isLight(objectRef);

  const gqlName = `${isLight ? "Light" : ""}${capitalize(refName)}${constantInfo.isInsight(objectRef) ? "Insight" : ""}`;
  if (isLight) {
    const fullModelRef = constantInfo.getDatabase(refName).full;
    return generateGql(fullModelRef);
  }
  const predefinedObjectGql = getPredefinedObjectGql(gqlName);
  if (predefinedObjectGql) return predefinedObjectGql;
  const fieldMetas = getFieldMetas(objectRef);
  class ObjectGql {}
  const objectGql =
    constantInfo.isScalar(objectRef) || constantInfo.isInsight(objectRef)
      ? ObjectGql
      : constantInfo.getDatabase(refName).full;
  fieldMetas.forEach((fieldMeta) => {
    applyNestField(objectGql, fieldMeta);
  });
  ObjectType(gqlName)(objectGql);
  setPredefinedObjectGql(gqlName, objectGql);
  return objectGql;
};
