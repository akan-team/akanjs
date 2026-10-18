import { capitalize } from "akanjs/common";
import { actionTagOf } from "./actionTag";
import { StoreRegistry } from "./storeRegistry";

export interface FormUpload {
  upload: (fileList: FileList | File[]) => Promise<void>;
  write: (value: unknown) => void;
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
  const writeOn = actions[`writeOn${Model}`];
  if (typeof upload !== "function" || typeof writeOn !== "function") return null;
  return {
    upload: upload as FormUpload["upload"],
    write: (value) => void (writeOn as (path: string, value: unknown) => unknown)(field, value),
  };
};
