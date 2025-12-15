"use client";
import { storage } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export const ThemeToggle = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, themes } = useTheme();
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleTheme = async (e) => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    await storage.setItem("theme", newTheme);
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="form-control">
      <label className="label cursor-pointer">
        <span className="text-base-content mr-2 text-sm whitespace-nowrap">{capitalize(theme ?? "")}</span>
        <input type="checkbox" className="toggle toggle-sm" checked={theme === "dark"} onChange={handleTheme} />
      </label>
    </div>
  );
};
