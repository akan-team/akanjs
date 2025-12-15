"use client";
import { clsx } from "@akanjs/client";
import { useContext } from "react";
import { useReactToPrint } from "react-to-print";

import { PrintContext } from "./context";

interface TriggerProps {
  children: React.ReactNode;
  className?: string;
}

export const Trigger = ({ children, className }: TriggerProps) => {
  const { ref } = useContext(PrintContext);
  const print = useReactToPrint({ contentRef: ref });
  return (
    <div
      className={clsx("cursor-pointer", className)}
      onClick={() => {
        print();
      }}
    >
      {children}
    </div>
  );
};
