"use client";
import { cn } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { st } from "akanjs/store";
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
  const { ref, name } = useContext(PrintContext);
  const print = useReactToPrint({ contentRef: ref, pageStyle });
  st.tool(name ? `print${capitalize(name)}` : "printPage", {
    settle: false,
    //? Every Print on a screen stays mounted, a hidden tab's included; only the one with a box on screen may print.
    guard: () =>
      (ref.current?.getClientRects().length ?? 0) > 0 ||
      "This document is not on screen. Show it first, for example by switching to its tab.",
  })
    .desc(
      name
        ? `Open the print dialog for the ${name} document on screen.`
        : "Open the print dialog for the document on screen.",
    )
    .exec(() => {
      print();
    });
  return (
    <div
      className={cn("cursor-pointer", className)}
      onClick={() => {
        print();
      }}
    >
      {children}
    </div>
  );
};
