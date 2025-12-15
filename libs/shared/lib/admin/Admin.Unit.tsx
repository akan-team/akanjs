import { ModelProps } from "@akanjs/client";

import * as cnst from "../cnst";

export const Card = ({ admin, href }: ModelProps<"admin", cnst.LightAdmin>) => {
  return <div>{admin.accountId}</div>;
};
