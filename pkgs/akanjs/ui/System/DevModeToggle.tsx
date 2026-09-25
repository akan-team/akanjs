"use client";
import { st } from "akanjs/store";

import { Switch } from "../Switch";

export const DevModeToggle = () => {
  const devMode = st.use.devMode({ agent: false });
  return (
    <div className="flex cursor-pointer items-center">
      <span className="mr-2 whitespace-nowrap text-sm">Dev Mode</span>
      <Switch
        checked={devMode}
        onChange={(checked) => {
          st.do.setDevMode(checked);
        }}
      />
    </div>
  );
};
