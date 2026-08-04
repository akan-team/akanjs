import { cn } from "akanjs/client";

import { Link } from "../Link";

export interface UnitProps {
  /** Additional classes merged with the default list/card item layout. */
  className?: string;
  /** Unit body content. */
  children: React.ReactNode;
  /** Optional route that makes the whole unit clickable through Link. */
  href?: string;
}
export const Unit = ({ className, children, href }: UnitProps) => {
  return (
    <Link href={href}>
      <div className={cn("flex w-full flex-col gap-2 p-4", !!href && "cursor-pointer", className)}>{children}</div>
    </Link>
  );
};
