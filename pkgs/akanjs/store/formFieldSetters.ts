import {
  capitalize,
  type DynamicRecord,
  formSetterNames,
  modelNames,
  resolveFileUploadCapability,
} from "akanjs/common";
import {
  type BaseObject,
  type ConstantField,
  ConstantRegistry,
  immerify,
  type ProtoFile,
  type ProtoLightFile,
} from "akanjs/constant";
import type { FetchProxy } from "akanjs/fetch";
import { produce } from "immer";
import { tagAction } from "./actionTag";
import type { SetGet } from "./types";
import { pollUploadedFiles, releasedUpload, type Uploading } from "./uploadPoll";

type Light = BaseObject;
type StateRecord = { [key: string]: unknown };
type FormState = { [key: string]: unknown };
type FieldNames = ReturnType<typeof formSetterNames>;

export const formSetterContextOf = (refName: string, fetch: FetchProxy<any>) => {
  const className = capitalize(refName);
  const modelRef = ConstantRegistry.getDatabase(refName).full;
  const fileUploadRefName = resolveFileUploadCapability(fetch.serializedSignal)?.refName;
  const names = modelNames(refName);
  let uploadSeq = 0;
  const nextUploadTicket = () => `${++uploadSeq}`;
  const formPatchOf = (
    state: StateRecord,
    recipe: (form: FormState) => void,
    uploading = state[names.modelFormUploading] as Uploading,
  ) => ({
    [names.modelForm]: produce(state[names.modelForm] as FormState, recipe),
    // `set` reads a form patch without the upload slot as a whole-form replace and drops every upload in flight.
    [names.modelFormUploading]: uploading,
  });
  return { className, modelRef, fileUploadRefName, names, fetch, nextUploadTicket, formPatchOf };
};

type FormSetterContext = ReturnType<typeof formSetterContextOf>;

const valueSetterOf = (
  ctx: FormSetterContext,
  namesOfField: FieldNames,
  field: ConstantField,
  isFileField: boolean,
) => {
  const { names, formPatchOf } = ctx;
  return {
    [namesOfField.setFieldOnModel]: function (this: SetGet, value: any | null) {
      const state = this.get() as StateRecord;
      const setValue =
        value === null ? null : field.isClass ? immerify<object>(field.modelRef, value as object) : (value as object);
      // An explicit write wins over a single field's upload in flight; an array keeps its uploads.
      const uploading = state[names.modelFormUploading] as Uploading;
      this.set(
        formPatchOf(
          state,
          (form) => {
            form[namesOfField.field] = setValue;
          },
          isFileField && !field.isArray ? releasedUpload(uploading, namesOfField.field) : uploading,
        ),
      );
      // After the write, so a hook that reads the field sees the new value.
      const postSet = (this as unknown as { [key: string]: ((value: unknown) => unknown) | undefined })[
        namesOfField.postSetField
      ];
      if (postSet) void postSet.call(this, value);
    },
  };
};

const arraySettersOf = (ctx: FormSetterContext, namesOfField: FieldNames, field: ConstantField) => {
  const { names, formPatchOf } = ctx;
  return {
    [namesOfField.addFieldOnModel]: function (
      this: SetGet,
      value: Light | Light[],
      options: { idx?: number; limit?: number } = {},
    ) {
      const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: any };
      const length = (form[namesOfField.field] as unknown[]).length;
      if (options.limit && options.limit <= length) return;
      const idx = options.idx ?? length;
      const setValue = field.isClass ? immerify<Light | Light[]>(field.modelRef, value) : value;
      this.set(
        formPatchOf(this.get(), (draft) => {
          draft[namesOfField.field] = [
            ...(form[namesOfField.field] as object[]).slice(0, idx),
            ...(Array.isArray(setValue) ? setValue : [setValue]),
            ...(form[namesOfField.field] as object[]).slice(idx),
          ];
        }),
      );
    },
    [namesOfField.subFieldOnModel]: function (this: SetGet, idx: number | number[]) {
      const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: object[] };
      this.set(
        formPatchOf(this.get(), (draft) => {
          draft[namesOfField.field] =
            typeof idx === "number"
              ? form[namesOfField.field].filter((_, i) => i !== idx)
              : form[namesOfField.field].filter((_, i) => !idx.includes(i));
        }),
      );
    },
    [namesOfField.addOrSubFieldOnModel]: function (
      this: SetGet,
      value: any,
      options: { idx?: number; limit?: number } = {},
    ) {
      const { [names.modelForm]: form } = this.get() as { [key: string]: { [key: string]: any[] } };
      const index = form[namesOfField.field].indexOf(value);
      if (index === -1)
        ((this as unknown as DynamicRecord)[namesOfField.addFieldOnModel] as (...args: any) => void)(value, options);
      else ((this as unknown as DynamicRecord)[namesOfField.subFieldOnModel] as (...args: any) => void)(index);
    },
  };
};

const uploadSetterOf = (
  ctx: FormSetterContext,
  namesOfField: FieldNames,
  field: ConstantField,
  fileUploadRefName: string,
) => {
  const { names, fetch, formPatchOf, nextUploadTicket } = ctx;
  return {
    [namesOfField.uploadFieldOnModel]: async function (this: SetGet, fileList: FileList | File[], index?: number) {
      const formId = ((this.get() as { [key: string]: any })[names.modelForm] as { id?: string }).id;
      if (!fileList.length) return;
      // A whole-form set clears all tickets and a single field keeps only the newest; a missing one is stale.
      const ticket = nextUploadTicket();
      const uploading = (this.get() as StateRecord)[names.modelFormUploading] as Uploading;
      const tickets = uploading[namesOfField.field] ?? [];
      this.set({
        [names.modelFormUploading]: {
          ...uploading,
          [namesOfField.field]: field.isArray ? [...tickets, ticket] : [ticket],
        },
      });
      const releasedIn = (state: StateRecord) =>
        releasedUpload(state[names.modelFormUploading] as Uploading, namesOfField.field, ticket);
      let files: ProtoFile[];
      try {
        files = await (fetch[names.addModelFiles] as (...args: any) => Promise<ProtoFile[]>)(fileList, formId);
      } catch (error) {
        this.set({ [names.modelFormUploading]: releasedIn(this.get() as StateRecord) });
        throw error;
      }
      const state = this.get() as StateRecord;
      const isWritten =
        !!(state[names.modelFormUploading] as Uploading)[namesOfField.field]?.includes(ticket) &&
        (state[names.modelForm] as { id?: string }).id === formId;
      if (!isWritten) {
        this.set({ [names.modelFormUploading]: releasedIn(state) });
        return;
      }
      // One update, so no subscriber sees the field idle before the file it waited for is in the form.
      this.set(
        formPatchOf(
          state,
          (form) => {
            if (field.isArray) {
              const current = (form[namesOfField.field] as ProtoLightFile[] | null) ?? [];
              const idx = Math.min(index ?? current.length, current.length);
              form[namesOfField.field] = [...current.slice(0, idx), ...files, ...current.slice(idx)];
            } else form[namesOfField.field] = files[0] ?? null;
          },
          releasedIn(state),
        ),
      );
      const postSet = (this as unknown as { [key: string]: ((value: unknown) => unknown) | undefined })[
        namesOfField.postSetField
      ];
      if (postSet) void postSet.call(this, (this.get() as { [key: string]: any })[names.modelForm][namesOfField.field]);
      // A light-declared field stores the light projection, so the poll re-reads through the light endpoint.
      const fileReadName = ConstantRegistry.isLight(field.modelRef)
        ? modelNames(fileUploadRefName).lightModel
        : fileUploadRefName;
      const holdsFile = (id: string) => {
        const value = (this.get() as { [key: string]: { [key: string]: unknown } })[names.modelForm][
          namesOfField.field
        ] as ProtoLightFile | ProtoLightFile[] | null;
        return Array.isArray(value) ? value.some((heldFile) => heldFile.id === id) : value?.id === id;
      };
      pollUploadedFiles({
        files,
        readName: fileReadName,
        read: (fetch as { [key: string]: any })[fileReadName] as (id: string) => Promise<ProtoLightFile>,
        holds: holdsFile,
        land: (currentFile) =>
          this.set(
            formPatchOf(this.get(), (form) => {
              const value = form[namesOfField.field] as ProtoLightFile[] | ProtoLightFile | null;
              form[namesOfField.field] = Array.isArray(value)
                ? value.map((heldFile) => (heldFile.id === currentFile.id ? currentFile : heldFile))
                : currentFile;
            }),
          ),
      });
    },
  };
};

export const fieldSettersOf = (ctx: FormSetterContext, key: string, field: ConstantField) => {
  const { className, names, fileUploadRefName } = ctx;
  const namesOfField = formSetterNames(className, key);
  const isFileField =
    field.isClass && !!fileUploadRefName && ConstantRegistry.getRefName(field.modelRef) === fileUploadRefName;
  const singleFieldSetAction = {
    ...valueSetterOf(ctx, namesOfField, field, isFileField),
    ...(field.isArray ? arraySettersOf(ctx, namesOfField, field) : {}),
    ...(isFileField && fileUploadRefName ? uploadSetterOf(ctx, namesOfField, field, fileUploadRefName) : {}),
  };
  // The only place the state path is known; `st.do` carries the tag so `Field.*` can emit `data-akan-state`.
  tagAction(singleFieldSetAction[namesOfField.setFieldOnModel] as (...args: never[]) => unknown, {
    action: namesOfField.setFieldOnModel,
    state: `${names.modelForm}.${namesOfField.field}`,
  });
  return singleFieldSetAction;
};
