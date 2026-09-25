import type { cnst } from "@libs/shared/client";
import { Admin } from "@libs/shared/client";

interface GeneralProps {
  className?: string;
  admin: cnst.Admin;
}

export const General = ({ className, admin }: GeneralProps) => {
  return (
    <div className="mr-4 flex items-center gap-2 text-white">
      {admin.accountId}
      <Admin.Util.ToolMenu />
    </div>
  );
};
