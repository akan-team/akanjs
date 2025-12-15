"use client";
import { baseClientEnv } from "@akanjs/base";
import { clsx, usePathCtx } from "@akanjs/client";
import React, { ReactNode, useEffect, useState } from "react";
import { BiChevronLeft } from "react-icons/bi";

import { Link } from "../Link";
import { Portal } from "../Portal";

export interface NavbarProps {
  className?: string;
  children?: ReactNode;
  height?: number;
  title?: ReactNode;
  back?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
}

export const Navbar = ({ back = false, className, height, children, title, left, right }: NavbarProps) => {
  const [render, setRender] = useState(false); //! 이거 왜 쓰는지 모르겠음 삭제해도 될듯
  const { location } = usePathCtx();
  const suffix = baseClientEnv.renderMode === "csr" ? `-${location.pathRoute.path}` : "";
  useEffect(() => {
    setRender(true);
  }, []);
  if (!render) return null;
  return (
    <>
      <Portal id={`topInsetContent${suffix}`}>
        <div className={clsx("size-full", className)}>{children}</div>
      </Portal>
      {back ? (
        <Portal id={`topLeftActionContent${suffix}`}>
          {typeof back === "boolean" ? (
            <Link.Back className="text-4xl">
              <BiChevronLeft />
            </Link.Back>
          ) : (
            back
          )}
        </Portal>
      ) : null}
    </>
  );
};
