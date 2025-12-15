import { deepObjectify } from "@akanjs/common";
import type { ReactNode } from "react";

import { NewWrapper_Client } from "./NewWrapper_Client";

interface NewWrapperProps<Full = any> {
  className?: string;
  children: ReactNode;
  sliceName: string;
  partial?: Partial<Full> | (() => Partial<Full>);
  setDefault?: boolean;
  modal?: string | null;
  resets?: string[] | null;
}

export default function NewWrapper<Full>({ partial = {}, ...props }: NewWrapperProps<Full>) {
  const serializedPartial = deepObjectify(typeof partial === "function" ? partial() : partial, { serializable: true });
  return <NewWrapper_Client {...props} partial={serializedPartial} />;
}
