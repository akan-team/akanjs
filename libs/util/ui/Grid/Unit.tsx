"use client";
import { clsx } from "@akanjs/client";
import { useContext, useRef } from "react";
import { BiX } from "react-icons/bi";

import { GridContext, GridUnitContext } from "./context";

interface UnitProps {
  className?: string;
  closeClassName?: string;
  children: any;
}
export const Unit = ({ className, closeClassName, children }: UnitProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { viewRef, setViewRef } = useContext(GridContext);
  const open = ref === viewRef;
  return (
    <GridUnitContext.Provider value={{ open }}>
      <div
        data-open={open}
        className={clsx("group/gridunit cursor-pointer transition-all duration-150", className)}
        onClick={() => {
          setViewRef(ref);
        }}
      >
        {children}
        <div
          className={clsx(
            "absolute top-2 right-2 z-10 hidden cursor-pointer group-data-[open=true]/gridunit:block",
            closeClassName
          )}
          onClick={(e) => {
            e.stopPropagation();
            setViewRef(null);
          }}
        >
          <BiX className="text-4xl" />
        </div>
      </div>
    </GridUnitContext.Provider>
  );
};
