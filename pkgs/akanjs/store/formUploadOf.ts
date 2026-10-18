import { actionTagOf } from "./actionTag";
import { StoreRegistry } from "./storeRegistry";

type FormUpload = (fileList: FileList | File[]) => Promise<void>;

/** The form's `upload<Field>On<Model>` for a `set<Field>On<Model>` passed by reference, or `null` for any other handler. */
export const formUploadOf = (setter: unknown): FormUpload | null => {
  const action = actionTagOf(setter)?.action;
  if (!action?.startsWith("set")) return null;
  const upload = (StoreRegistry.instance.do as unknown as { [key: string]: unknown })[`upload${action.slice(3)}`];
  return typeof upload === "function" ? (upload as FormUpload) : null;
};
