"use client";
import { st } from "@shared/client";
import { ReactNode } from "react";

interface DevProps {
  children: ReactNode;
}

export const Dev = ({ children }: DevProps) => {
  const devMode = st.use.devMode();
  return devMode ? children : null;
};
