import { clsx } from "akanjs/client";

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
      <div className={clsx("flex w-full flex-col gap-2 p-4", { "cursor-pointer": !!href }, className)}>{children}</div>
    </Link>
  );
};
