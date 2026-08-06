import {
  type Cls,
  type EnumInstance,
  FIELD_META,
  getNonArrayModel,
  PrimitiveRegistry,
  type PrimitiveScalar,
} from "akanjs/base";
import { capitalize } from "akanjs/common";
import {
  type ConstantCls,
  type ConstantField,
  type ConstantModel,
  ConstantRegistry,
  type TextFieldRole,
} from "akanjs/constant";

export const databaseModelVariants = ["input", "object", "full", "light", "insight"] as const;
export type DatabaseModelVariant = (typeof databaseModelVariants)[number];

export interface ConstantSchemaOptions {
  models?: string[];
  scalars?: string[];
  enums?: string[];
}

export interface ConstantSchemaDoc {
  databases: DatabaseSchema[];
  scalars: ScalarSchema[];
  enums: EnumSchema[];
  relations: RelationSchema[];
}

export interface DatabaseSchema {
  kind: "database";
  refName: string;
  modelName: string;
  variants: Record<DatabaseModelVariant, ModelVariantSchema>;
}

export interface ScalarSchema {
  kind: "scalar";
  refName: string;
  modelName: string;
  modelRef: ConstantCls;
  fields: FieldSchema[];
}

export interface ModelVariantSchema {
  refName: string;
  variant: DatabaseModelVariant | "scalar";
  modelName: string;
  modelRef: ConstantCls;
  fields: FieldSchema[];
}

export interface EnumSchema {
  key: string;
  refName: string;
  typeName: string;
  values: (string | number)[];
  enumRef: EnumInstance;
  usedBy: EnumUsage[];
}

export interface EnumUsage {
  refName: string;
  variant: DatabaseModelVariant | "scalar";
  fieldKey: string;
}

export interface RelationSchema {
  sourceRefName: string;
  sourceVariant: DatabaseModelVariant | "scalar";
  targetRefName: string;
  targetKind: "database" | "scalar";
  fieldKey: string;
  relationType: string;
  external: boolean;
}

export interface FieldSchema {
  key: string;
  typeLabel: string;
  typeRefName?: string;
  typeKind: "primitive" | "database" | "scalar" | "map" | "unknown";
  required: boolean;
  nullable: boolean;
  arrDepth: number;
  fieldType: "property" | "hidden" | "secret" | "resolve";
  select: boolean;
  immutable: boolean;
  ref?: string;
  refPath?: string;
  refType?: "child" | "parent" | "relation";
  relationLabel?: string;
  enumRefName?: string;
  enumValues?: (string | number)[];
  defaultLabel?: string;
  exampleLabel?: string;
  constraints: string[];
  text?: TextFieldRole;
  meta: Record<string, unknown>;
  raw: ConstantField;
}

export const getConstantSchemaDoc = (options: ConstantSchemaOptions = {}): ConstantSchemaDoc => {
  const databases = getSelectedEntries(ConstantRegistry.database, options.models).map(([refName, model]) =>
    buildDatabaseSchema(refName, model),
  );
  const scalars = getSelectedEntries(ConstantRegistry.scalar, options.scalars).map(([refName, scalar]) => {
    const modelRef = scalar.model;
    return {
      kind: "scalar" as const,
      refName,
      modelName: getModelName(modelRef, refName),
      modelRef,
      fields: getFields(modelRef, "scalar"),
    };
  });
  const selectedEnums = getSelectedEntries(ConstantRegistry.enum, options.enums);
  const enumUsages = collectEnumUsages(databases, scalars);
  const enums = selectedEnums.map(([key, enumRef]) => ({
    key,
    refName: enumRef.refName,
    typeName: PrimitiveRegistry.getName(enumRef.type as typeof PrimitiveScalar),
    values: [...enumRef.values] as (string | number)[],
    enumRef,
    usedBy: enumUsages.get(enumRef) ?? [],
  }));
  const relations = collectRelations(databases, scalars);
  return { databases, scalars, enums, relations };
};

export const getDefaultVariant = (database: DatabaseSchema): ModelVariantSchema => database.variants.full;

export const getVariantTitle = (variant: DatabaseModelVariant | "scalar") => {
  if (variant === "scalar") return "Scalar";
  return capitalize(variant);
};

const buildDatabaseSchema = (refName: string, model: ConstantModel): DatabaseSchema => {
  const variants = Object.fromEntries(
    databaseModelVariants.map((variant) => {
      const modelRef = model[variant];
      return [
        variant,
        {
          refName,
          variant,
          modelName: ConstantRegistry.getModelName(modelRef),
          modelRef,
          fields: getFields(modelRef, variant),
        },
      ];
    }),
  ) as Record<DatabaseModelVariant, ModelVariantSchema>;
  return { kind: "database", refName, modelName: ConstantRegistry.getModelName(model.full), variants };
};

const getFields = (modelRef: ConstantCls, variant: DatabaseModelVariant | "scalar"): FieldSchema[] =>
  Object.entries(modelRef[FIELD_META]).map(([key, field]) => buildFieldSchema(key, field, variant));

const buildFieldSchema = (
  key: string,
  field: ConstantField,
  _variant: DatabaseModelVariant | "scalar",
): FieldSchema => {
  const props = field.getProps();
  const typeInfo = getTypeInfo(props.modelRef, props.arrDepth, props.isMap, props.of as Cls | Cls[] | undefined);
  const enumValues = props.enum ? ([...props.enum.values] as (string | number)[]) : undefined;
  const relationLabel = props.refType ?? (typeInfo.typeKind === "database" ? "reference" : undefined);
  return {
    key,
    typeLabel: typeInfo.typeLabel,
    typeRefName: typeInfo.typeRefName,
    typeKind: typeInfo.typeKind,
    required: !props.nullable,
    nullable: props.nullable,
    arrDepth: props.arrDepth,
    fieldType: props.fieldType,
    select: props.select,
    immutable: props.immutable,
    ref: props.ref,
    refPath: props.refPath,
    refType: props.refType,
    relationLabel,
    enumRefName: props.enum?.refName,
    enumValues,
    defaultLabel: stringifyMetaValue(props.default),
    exampleLabel: stringifyMetaValue(props.example),
    constraints: getConstraints(props),
    text: props.text,
    meta: props.meta as Record<string, unknown>,
    raw: field,
  };
};

const getTypeInfo = (
  modelRef: Cls,
  arrDepth: number,
  isMap: boolean,
  of?: Cls | Cls[],
): Pick<FieldSchema, "typeKind" | "typeLabel" | "typeRefName"> => {
  if (isMap) {
    const mapValue = of ? getNestedTypeInfo(of) : { label: "Unknown", refName: undefined };
    return { typeKind: "map", typeLabel: `Map<String, ${mapValue.label}>`, typeRefName: mapValue.refName };
  }
  const refName = ConstantRegistry.getRefName(modelRef, { allowEmpty: true });
  if (PrimitiveRegistry.has(modelRef)) {
    return {
      typeKind: "primitive",
      typeLabel: formatArrayType(PrimitiveRegistry.getName(modelRef as typeof PrimitiveScalar), arrDepth),
    };
  }
  if (refName && ConstantRegistry.database.has(refName)) {
    return {
      typeKind: "database",
      typeLabel: formatArrayType(ConstantRegistry.getModelName(modelRef), arrDepth),
      typeRefName: refName,
    };
  }
  if (refName && ConstantRegistry.scalar.has(refName)) {
    return {
      typeKind: "scalar",
      typeLabel: formatArrayType(getModelName(modelRef, refName), arrDepth),
      typeRefName: refName,
    };
  }
  return { typeKind: "unknown", typeLabel: formatArrayType("Unknown", arrDepth), typeRefName: refName };
};

const getModelName = (modelRef: Cls, refName: string) => {
  if ((modelRef as ConstantCls).modelType) return ConstantRegistry.getModelName(modelRef);
  return capitalize(refName);
};

const getNestedTypeInfo = (model: Cls | Cls[]) => {
  const [modelRef, arrDepth] = getNonArrayModel(model as Cls);
  const info = getTypeInfo(modelRef as Cls, arrDepth, modelRef === Map);
  return { label: info.typeLabel, refName: info.typeRefName };
};

const formatArrayType = (name: string, arrDepth: number) => `${"[".repeat(arrDepth)}${name}${"]".repeat(arrDepth)}`;

const stringifyMetaValue = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === "function") return "[function]";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const getConstraints = (props: ReturnType<ConstantField["getProps"]>) =>
  [
    props.min !== undefined ? `min ${props.min}` : null,
    props.max !== undefined ? `max ${props.max}` : null,
    props.minlength !== undefined ? `minlength ${props.minlength}` : null,
    props.maxlength !== undefined ? `maxlength ${props.maxlength}` : null,
    props.text ? `text:${props.text}` : null,
    props.validate ? "custom validate" : null,
    props.accumulate ? "accumulate" : null,
  ].filter((constraint): constraint is string => !!constraint);

const getSelectedEntries = <Value>(map: Map<string, Value>, selected?: string[]): [string, Value][] => {
  if (!selected?.length) return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  return selected.flatMap((key) => {
    const value = map.get(key);
    return value ? ([[key, value]] as [string, Value][]) : [];
  });
};

const collectEnumUsages = (databases: DatabaseSchema[], scalars: ScalarSchema[]) => {
  const usages = new Map<EnumInstance, EnumUsage[]>();
  const addUsage = (field: FieldSchema, usage: EnumUsage) => {
    const enumRef = field.raw.enum;
    if (!enumRef) return;
    usages.set(enumRef, [...(usages.get(enumRef) ?? []), usage]);
  };
  databases.forEach((database) => {
    Object.values(database.variants).forEach((variant) => {
      variant.fields.forEach((field) => {
        addUsage(field, { refName: database.refName, variant: variant.variant, fieldKey: field.key });
      });
    });
  });
  scalars.forEach((scalar) => {
    scalar.fields.forEach((field) => {
      addUsage(field, { refName: scalar.refName, variant: "scalar", fieldKey: field.key });
    });
  });
  return usages;
};

const collectRelations = (databases: DatabaseSchema[], scalars: ScalarSchema[]): RelationSchema[] => {
  const selectedDatabases = new Set(databases.map((database) => database.refName));
  const selectedScalars = new Set(scalars.map((scalar) => scalar.refName));
  const relations: RelationSchema[] = [];
  const addRelations = (refName: string, variant: DatabaseModelVariant | "scalar", fields: FieldSchema[]) => {
    fields.forEach((field) => {
      if (
        !field.typeRefName ||
        (field.typeKind !== "database" && field.typeKind !== "scalar" && field.typeKind !== "map")
      )
        return;
      const targetKind = ConstantRegistry.database.has(field.typeRefName) ? "database" : "scalar";
      const selected =
        targetKind === "database" ? selectedDatabases.has(field.typeRefName) : selectedScalars.has(field.typeRefName);
      relations.push({
        sourceRefName: refName,
        sourceVariant: variant,
        targetRefName: field.typeRefName,
        targetKind,
        fieldKey: field.key,
        relationType: field.relationLabel ?? field.typeKind,
        external: !selected,
      });
    });
  };
  databases.forEach((database) => {
    addRelations(database.refName, "full", database.variants.full.fields);
  });
  scalars.forEach((scalar) => {
    addRelations(scalar.refName, "scalar", scalar.fields);
  });
  return relations;
};
