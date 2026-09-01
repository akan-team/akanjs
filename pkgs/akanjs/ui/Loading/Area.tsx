import { usePage } from "akanjs/client";

import { Spin } from "./Spin";

export const Area = () => {
  const { l } = usePage();
  return (
    <div className="absolute inset-0 flex size-full flex-col items-center justify-center gap-2 rounded-[inherit] bg-background/60 backdrop-blur-sm">
      <Spin />
      <div className="text-foreground/60 text-sm">{l("base.processing")}</div>
    </div>
  );
};
