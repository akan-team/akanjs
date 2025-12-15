"use client";
import { st } from "@shared/client";
import { ReactNode } from "react";

interface MobileProps {
  children: ReactNode;
}

export const Mobile = ({ children }: MobileProps) => {
  const innerWidth = st.use.innerWidth();
  return innerWidth && innerWidth < 768 ? children : null;
};
