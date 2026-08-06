import type { cnst } from "@libs/shared/client";
import type { ModelProps } from "akanjs/client";

export const Card = ({ file }: ModelProps<"file", cnst.LightFile>) => {
  return (
    <div>
      {file.filename}-{file.createdAt.format("YYYY-MM-DD")}
    </div>
  );
};
