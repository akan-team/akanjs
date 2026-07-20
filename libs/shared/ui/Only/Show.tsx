"use client";
import { type cnst, st } from "@libs/shared/client";
import type { ReactNode } from "react";

interface ShowProps {
  children: ReactNode | ReactNode[];
  show?: boolean | cnst.util.Responsive["value"][];
}
export const Show = ({ children, show = false }: ShowProps) => {
  const responsive = st.use.responsive();
  if (typeof show === "boolean") return show ? children : null;
  else return show.includes(responsive) ? children : null;
};
