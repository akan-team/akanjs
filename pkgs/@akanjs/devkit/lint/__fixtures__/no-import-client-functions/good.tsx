import type { ReactNode } from "react"; // @ok
import { cnst } from "@libs/shared/client"; // @ok
import { usePage } from "akanjs/client"; // @ok
export const Card = ({ children }: { children: ReactNode }) => <div>{children}</div>; // @ok
export { cnst, usePage };
