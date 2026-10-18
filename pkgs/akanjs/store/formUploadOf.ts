import { capitalize } from "akanjs/common";
import { actionTagOf } from "./actionTag";
import { StoreRegistry } from "./storeRegistry";

interface HeldFile {
  id: string;
}

export interface FormUpload {
  upload: (fileList: FileList | File[]) => Promise<void>;
  refresh: (files: HeldFile[]) => void;
}

// Only a generated field setter qualifies: a custom `setAvatar` beside a custom `uploadAvatar` is not this pair.
export const formUploadOf = (setter: unknown): FormUpload | null => {
  const tag = actionTagOf(setter);
  const [formKey, field, ...rest] = tag?.state?.split(".") ?? [];
  if (!formKey?.endsWith("Form") || !field || rest.length) return null;
  const [Model, Field] = [capitalize(formKey.slice(0, -"Form".length)), capitalize(field)];
  if (tag?.action !== `set${Field}On${Model}`) return null;
  const actions = StoreRegistry.instance.do as unknown as { [key: string]: unknown };
  const upload = actions[`upload${Field}On${Model}`];
  const writeOn = actions[`writeOn${Model}`] as ((path: string, value: unknown) => unknown) | undefined;
  if (typeof upload !== "function" || typeof writeOn !== "function") return null;
  // Read at write time, not when the poll started: a file the field no longer holds is not written back.
  const refresh = (files: HeldFile[]) => {
    const form = StoreRegistry.instance.get()[formKey] as { [key: string]: unknown } | undefined;
    const held = form?.[field] as HeldFile | HeldFile[] | null | undefined;
    const fresh = (file: HeldFile) => files.find((updated) => updated.id === file.id);
    if (Array.isArray(held)) {
      if (held.some((file) => fresh(file)))
        void writeOn(
          field,
          held.map((file) => fresh(file) ?? file),
        );
    } else if (held) {
      const updated = fresh(held);
      if (updated) void writeOn(field, updated);
    }
  };
  return { upload: upload as FormUpload["upload"], refresh };
};
