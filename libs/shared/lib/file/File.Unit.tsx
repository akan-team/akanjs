import { ModelProps } from "@akanjs/client";

import * as cnst from "../cnst";

export const Card = ({ file }: ModelProps<"file", cnst.LightFile>) => {
  return (
    <div>
      {file.filename}-{file.createdAt.format("YYYY-MM-DD")}
    </div>
  );
};
