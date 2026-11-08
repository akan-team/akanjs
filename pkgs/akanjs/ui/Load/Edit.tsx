import { type DynamicRecord, deepObjectify, isThenable, modelNames } from "akanjs/common";
import type { ServerEdit } from "akanjs/fetch";

import Edit_Client, { type EditProps } from "./Edit_Client";

export default function Edit<T extends string, Full extends { id: string }>({ edit, ...props }: EditProps<T, Full>) {
  const getObjEdit = (edit: ServerEdit<T, Full> | Partial<Full> | Promise<Partial<Full>>) => {
    const editType: "edit" | "new" =
      (edit as ServerEdit<string, Full>).refName &&
      ((edit as DynamicRecord)[modelNames((edit as ServerEdit<string, Full>).refName).modelObj] as Full)
        ? "edit"
        : "new";
    return editType === "edit" ? edit : deepObjectify(edit, { serializable: true });
  };
  const objEdit = isThenable(edit) ? Promise.resolve(edit).then(getObjEdit) : getObjEdit(edit);
  return (
    <Edit_Client edit={objEdit as unknown as ServerEdit<T, Full> | Partial<Full> | Promise<Partial<Full>>} {...props} />
  );
}
