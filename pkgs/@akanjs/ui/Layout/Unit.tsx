import { clsx } from "@akanjs/client";

import { Link } from "../Link";

export interface UnitProps {
  className?: string;
  children: React.ReactNode;
  href?: string;
}
export const Unit = ({ className, children, href }: UnitProps) => {
  return (
    <Link href={href}>
      <div className={clsx("flex w-full flex-col gap-2 p-4", { "cursor-pointer": !!href }, className)}>{children}</div>
    </Link>
  );
};
