"use client";
import { useContext } from "react";

import { PrintContext } from "./context";

interface AreaProps {
  className?: string;
  children: React.ReactNode;
}
export const Area = ({ children, className }: AreaProps) => {
  const { ref } = useContext(PrintContext);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
};
