"use client";
import { st } from "@akanjs/store";

export const DevModeToggle = () => {
  const devMode = st.use.devMode();
  return (
    <div className="form-control">
      <label className="label cursor-pointer">
        <span className="label-text mr-2 text-sm whitespace-nowrap">Dev Mode</span>
        <input
          type="checkbox"
          className="toggle"
          checked={devMode}
          onChange={(e) => {
            st.do.setDevMode(e.target.checked);
          }}
        />
      </label>
    </div>
  );
};
