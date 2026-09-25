import type { cnst } from "@libs/shared/client";
import type { ModelProps } from "akanjs/client";

export const Card = ({ admin, href }: ModelProps<"admin", cnst.LightAdmin>) => {
  return <div>{admin.accountId}</div>;
};
