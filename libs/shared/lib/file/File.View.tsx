import { RecentTime } from "@akanjs/ui";
import { usePage } from "@shared/client";

import * as cnst from "../cnst";

interface GeneralProps {
  file: cnst.File;
}
export const General = ({ file }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div>
      <div className="mt-4 mb-0 flex justify-between border-b border-gray-200 p-2 text-2xl">
        <h3>
          {l("file.id")}-{file.id}
        </h3>
      </div>
      <div className="mt-0 flex justify-between bg-gray-50 p-4 text-xs md:text-base">
        <div>{file.id}</div>
        <RecentTime date={file.createdAt} breakUnit="second" />
      </div>
    </div>
  );
};
