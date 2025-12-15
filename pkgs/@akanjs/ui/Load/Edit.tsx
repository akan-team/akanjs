import { deepObjectify } from "@akanjs/common";
import type { ServerEdit } from "@akanjs/signal";

import Edit_Client, { EditProps } from "./Edit_Client";

export default function Edit<T extends string, Full extends { id: string }>({ edit, ...props }: EditProps<T, Full>) {
  const getObjEdit = (edit: ServerEdit<T, Full> | Partial<Full> | Promise<Partial<Full>>) => {
    const editType: "edit" | "new" =
      (edit as ServerEdit<string, Full>).refName && edit[`${(edit as ServerEdit<string, Full>).refName}Obj`]
        ? "edit"
        : "new";
    return editType === "edit" ? edit : deepObjectify(edit, { serializable: true });
  };
  const objEdit = edit instanceof Promise ? edit.then(getObjEdit) : getObjEdit(edit);
  return (
    <Edit_Client edit={objEdit as unknown as ServerEdit<T, Full> | Partial<Full> | Promise<Partial<Full>>} {...props} />
  );
}
