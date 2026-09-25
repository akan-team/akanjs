"use client";
import { clsx } from "akanjs/client";
import { useContext } from "react";
import { useReactToPrint } from "react-to-print";

import { PrintContext } from "./context";

interface TriggerProps {
  children: React.ReactNode;
  className?: string;
  // Custom print stylesheet; passing this replaces react-to-print's default `@page { margin: 0 }`,
  // so callers that need page margins provide their own `@page` rule here.
  pageStyle?: string;
}

export const Trigger = ({ children, className, pageStyle }: TriggerProps) => {
  const { ref } = useContext(PrintContext);
  const print = useReactToPrint({ contentRef: ref, pageStyle });
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
