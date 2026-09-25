import type { cnst } from "@libs/shared/client";

interface GeneralProps {
  className?: string;
  admin: cnst.Admin;
}

export const General = ({ className, admin }: GeneralProps) => {
  return <div className="flex items-center gap-2 text-foreground">{admin.accountId}</div>;
};
