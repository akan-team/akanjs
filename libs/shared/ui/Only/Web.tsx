"use client";
import { st } from "@shared/client";
import { ReactNode } from "react";

interface WebProps {
  children: ReactNode;
}

export const Web = ({ children }: WebProps) => {
  const innerWidth = st.use.innerWidth();
  return innerWidth > 768 ? children : null;
};
