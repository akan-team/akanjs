import { Admin, usePage } from "@shared/client";

import * as cnst from "../cnst";

interface AdminViewProps {
  className?: string;
  admin: cnst.Admin;
}

export const General = ({ className, admin }: AdminViewProps) => {
  const { l } = usePage();
  return (
    <div className="mr-4 flex items-center gap-2 text-white">
      {admin.accountId}
      <Admin.Util.ToolMenu />
    </div>
  );
};
