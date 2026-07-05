import { type Cls, FIELD_META, type GetActionObject } from "akanjs/base";
import { applyMixins } from "akanjs/common";
import { ConstantRegistry, type DocumentConstantModelRef, type DocumentModel, type FieldObject } from "akanjs/constant";

export type DatabaseCls<Schema = unknown> = Cls<Schema, { refName: string; [FIELD_META]: FieldObject }>;
export type DatabaseInstanceOf<DatabaseRef extends DatabaseCls> = DatabaseRef extends new (
  ...args: never[]
) => infer Instance
  ? Instance
  : never;
type ConstantModelCls = DocumentConstantModelRef<unknown>;

export interface DefaultDocMtds<TDocument> {
  refresh(): Promise<this>;
  isModified(field?: keyof TDocument & string): boolean;
  set(data: Partial<TDocument>): this;
  save(): Promise<this>;
  toJSON(): DocumentModel<TDocument>;
  toObject(): DocumentModel<TDocument>;
}
type HydratedDocumentMethods<TDocument, Self> = Omit<
  DefaultDocMtds<TDocument>,
  "isModified" | "refresh" | "save" | "set"
> & {
  refresh(): Promise<Self>;
  isModified(field?: keyof TDocument & string): boolean;
  set(data: Partial<TDocument>): Self;
  save(): Promise<Self>;
};
type HydratedDocumentWithId<TDocument> = TDocument & { id: string } & HydratedDocumentMethods<TDocument, TDocument>;
interface ChainableHydratedMethods<TDocument>
  extends Omit<DefaultDocMtds<TDocument>, "isModified" | "refresh" | "save" | "set"> {
  refresh(): Promise<this>;
  isModified(field?: keyof TDocument & string): boolean;
  set(data: Partial<TDocument>): this;
  save(): Promise<this>;
}
type ChainableHydratedDocument<TDocument> = TDocument & {
  id: string;
} & ChainableHydratedMethods<TDocument>;
export type Doc<M = unknown> = HydratedDocumentWithId<DocumentModel<M>>;
type DatabaseSchemaOf<ModelCls> = ModelCls extends { _DatabaseSchema: infer Schema } ? Schema : never;
type ObjectDocumentModelType = "object" | "full" | "light";
type ModelTypeOf<ModelCls> = ModelCls extends { _ModelType: infer ModelType } ? ModelType : never;
type IsObjectModel<ModelCls> = ModelTypeOf<ModelCls> extends ObjectDocumentModelType ? true : false;
type DocModelOf<ModelCls, Schema = DatabaseSchemaOf<ModelCls>> =
  IsObjectModel<ModelCls> extends true ? ChainableHydratedDocument<DocumentModel<Schema>> : DocumentModel<Schema>;
type DocActionOmitKey<ModelCls, Schema = DatabaseSchemaOf<ModelCls>> =
  | (keyof Schema & string)
  | (IsObjectModel<ModelCls> extends true ? keyof DefaultDocMtds<unknown> | "id" : never);
type DatabaseSchemaFor<ModelCls extends ConstantModelCls> = DatabaseSchemaOf<ModelCls>;
type DocModelFor<ModelCls extends ConstantModelCls> = DocModelOf<ModelCls, DatabaseSchemaFor<ModelCls>>;
type DocActionOmitKeyFor<ModelCls extends ConstantModelCls> = DocActionOmitKey<ModelCls, DatabaseSchemaFor<ModelCls>>;
type StrictDocumentActions<T> = string extends keyof T
  ? T[string] extends never
    ? Record<never, never>
    : GetActionObject<T>
  : GetActionObject<T>;
type DocumentActionsOf<AddDbModel extends DatabaseCls, OmitKey extends string> = Omit<
  StrictDocumentActions<DatabaseInstanceOf<AddDbModel>>,
  OmitKey
>;
type MergeDocumentActions<
  AddDbModels extends readonly DatabaseCls[],
  OmitKey extends string,
  Acc = Record<never, never>,
> = AddDbModels extends readonly [infer First extends DatabaseCls, ...infer Rest extends readonly DatabaseCls[]]
  ? MergeDocumentActions<Rest, OmitKey, Acc & DocumentActionsOf<First, OmitKey>>
  : AddDbModels extends readonly (infer AddDbModel extends DatabaseCls)[]
    ? Acc & DocumentActionsOf<AddDbModel, OmitKey>
    : Acc;
type ByInstance<
  ModelCls extends ConstantModelCls,
  AddDbModels extends readonly DatabaseCls[],
  _OmitKey extends string = DocActionOmitKeyFor<ModelCls> & string,
  _DocModel = DocModelFor<ModelCls>,
> = MergeDocumentActions<AddDbModels, _OmitKey> & _DocModel;

export function by<ModelCls extends ConstantModelCls>(modelRef: ModelCls): DatabaseCls<DocModelFor<ModelCls>>;
export function by<ModelCls extends ConstantModelCls, AddDbModel extends DatabaseCls>(
  modelRef: ModelCls,
  addRef: AddDbModel,
): DatabaseCls<DocumentActionsOf<AddDbModel, DocActionOmitKeyFor<ModelCls> & string> & DocModelFor<ModelCls>>;
export function by<ModelCls extends ConstantModelCls, const AddDbModels extends DatabaseCls[]>(
  modelRef: ModelCls,
  ...addRefs: AddDbModels
): DatabaseCls<ByInstance<ModelCls, AddDbModels>>;
export function by(modelRef: ConstantModelCls, ...addRefs: DatabaseCls[]): DatabaseCls {
  const refName = ConstantRegistry.getRefName(modelRef as Cls);
  const databaseCls = class DatabaseCls {
    static refName = refName;
    static [FIELD_META] = modelRef[FIELD_META];
  };
  applyMixins(databaseCls as Cls, addRefs);
  return databaseCls as unknown as DatabaseCls;
}
